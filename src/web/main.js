/**
 * Checks if a given format name is considered 8-dot.
 * 'unicode' is treated as 8-dot for this logic.
 * @param {string} formatName
 * @returns {boolean}
 */
function isFormat8dot(formatName) {
  if (formatName === 'unicode') {
    return true;
  }
  if (window.brlcData && window.brlcData[formatName]) {
    // Check for the 8dots property in the loaded data
    return window.brlcData[formatName]["8dots"] === true;
  }
  return false;
}

/**
 * Shows or hides the 'force 6-dot' checkbox based on format selections.
 * @param {string} inFormatId - ID of the input format select
 * @param {string} outFormatId - ID of the output format select
 * @param {string} containerId - ID of the checkbox container
 * @param {string} checkboxId - ID of the checkbox
 */
function update6dotCheckboxVisibility(inFormatId, outFormatId, containerId, checkboxId) {
  const inFormat = document.getElementById(inFormatId).value;
  const outFormat = document.getElementById(outFormatId).value;
  const container = document.getElementById(containerId);
  const checkbox = document.getElementById(checkboxId);

  // Show only if:
  // 1. Output is Unicode
  // 2. Input is 8-dot (or also Unicode)
  if (outFormat === 'unicode' && isFormat8dot(inFormat)) {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
    checkbox.checked = false; // Reset when hidden
  }
}

/**
 * Wrapper for file panel 6-dot checkbox visibility
 */
function update6dotCheckboxVisibilityFile() {
  update6dotCheckboxVisibility('inFormat', 'outFormat', 'force-6dot-container', 'force-6dot');
}

/**
 * Wrapper for folder panel 6-dot checkbox visibility
 */
function update6dotCheckboxVisibilityFolder() {
  update6dotCheckboxVisibility('inFormatFolder', 'outFormatFolder', 'force-6dot-container-folder', 'force-6dot-folder');
}

/**
 * Converts a single file and returns the result.
 * @param {string} inFormat - Input format name
 * @param {string} outFormat - Output format name
 * @param {string} binaryString - File content as binary string
 * @param {boolean} force6dot - Whether to force 6-dot output
 * @returns {Uint8Array} - Converted content
 */
function convertFile(inFormat, outFormat, binaryString, force6dot) {
  const inMap = (inFormat === 'unicode') ? 'unicode' : window.brlcData[inFormat];
  const outMap = (outFormat === 'unicode') ? 'unicode' : window.brlcData[outFormat];
  return window.convert(inMap, outMap, binaryString, force6dot);
}

/**
 * Gets the output file extension for a given format.
 * @param {string} outFormat - Output format name
 * @returns {string} - File extension (e.g., ".txt", ".brf")
 */
function getOutputExtension(outFormat) {
  if (outFormat === 'unicode') {
    return '.txt';
  }
  const outMap = window.brlcData[outFormat];
  return '.' + outMap.format;
}

/**
 * Generates output filename from input filename.
 * @param {string} inputName - Input filename
 * @param {string} outFormat - Output format name
 * @returns {string} - Output filename
 */
function getOutputFileName(inputName, outFormat) {
  const baseName = inputName.replace(/\.\w+$/, "");
  return baseName + getOutputExtension(outFormat);
}

function generate(inFormat, outFormat, inTextFile) {
  // Clear previous link
  const downloadContainer = document.getElementById("download-container");
  downloadContainer.innerHTML = "";

  // Get the 6-dot flag value
  const force6dotCheckbox = document.getElementById('force-6dot');
  const force6dot = force6dotCheckbox.checked && (force6dotCheckbox.closest('div').style.display !== 'none');

  const reader = new FileReader();
  reader.readAsBinaryString(inTextFile); // Keep as binary string for jschardet
  reader.onload = function () {
    try {
      const outText = convertFile(inFormat, outFormat, reader.result, force6dot);

      const fileName = getOutputFileName(inTextFile.name, outFormat);

      const link = document.createElement("a");
      link.download = fileName;
      link.href = URL.createObjectURL(new Blob([outText.buffer]));
      link.textContent = i18next.t('downloadLinkText', { fileName: fileName });
      link.classList.add('btn', 'btn-success', 'mt-3');
      downloadContainer.appendChild(link);

      const status = document.getElementById('status');
      status.removeAttribute('style');
      status.classList.add('alert', 'alert-success', 'mt-3');
      status.innerHTML = i18next.t('statusDone');
      status.focus();

    } catch (e) {
      const status = document.getElementById('status');
      status.removeAttribute('style');
      status.classList.add('alert', 'alert-danger', 'mt-3');
      status.innerHTML = i18next.t('statusError', { message: e.message });
      status.focus();
      console.error(e);
    }
  };
  reader.onerror = function () {
    const status = document.getElementById('status');
    status.removeAttribute('style');
    status.classList.add('alert', 'alert-danger', 'mt-3');
    status.innerHTML = i18next.t('statusFileError');
    status.focus();
    console.error("Error reading file.");
  };
}

/**
 * Extracts the folder name from the file list.
 * @param {FileList} files - The files from the folder input
 * @returns {string} - The folder name
 */
function getFolderName(files) {
  if (files.length === 0) return 'converted';
  // webkitRelativePath is like "folderName/file.txt"
  const firstPath = files[0].webkitRelativePath;
  const parts = firstPath.split('/');
  return parts[0] || 'converted';
}

/**
 * Converts all files in a folder and creates a ZIP file.
 * @param {string} inFormat - Input format name
 * @param {string} outFormat - Output format name
 * @param {FileList} files - Files from the folder input
 */
async function generateFolder(inFormat, outFormat, files) {
  const downloadContainer = document.getElementById("download-container");
  downloadContainer.innerHTML = "";

  const status = document.getElementById('status');
  status.removeAttribute('style');
  status.className = 'alert alert-info mt-3';
  status.innerHTML = i18next.t('statusConverting', { current: 0, total: files.length });

  // Get the 6-dot flag value
  const force6dotCheckbox = document.getElementById('force-6dot-folder');
  const force6dot = force6dotCheckbox.checked && (force6dotCheckbox.closest('div').style.display !== 'none');

  const folderName = getFolderName(files);
  const zip = new JSZip();

  let convertedCount = 0;
  let errorCount = 0;
  const errors = [];

  // Process files sequentially to avoid memory issues
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Update progress
    status.innerHTML = i18next.t('statusConverting', { current: i + 1, total: files.length });

    try {
      const binaryString = await readFileAsBinaryString(file);
      const outText = convertFile(inFormat, outFormat, binaryString, force6dot);
      const outputFileName = getOutputFileName(file.name, outFormat);

      zip.file(outputFileName, outText);
      convertedCount++;
    } catch (e) {
      errorCount++;
      errors.push({ file: file.name, error: e.message });
      console.error(`Error converting ${file.name}:`, e);
    }
  }

  // Generate ZIP file
  try {
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFileName = `${folderName}_${outFormat}.zip`;

    const link = document.createElement("a");
    link.download = zipFileName;
    link.href = URL.createObjectURL(zipBlob);
    link.textContent = i18next.t('downloadLinkText', { fileName: zipFileName });
    link.classList.add('btn', 'btn-success', 'mt-3');
    downloadContainer.appendChild(link);

    // Show status
    status.className = 'alert mt-3';
    if (errorCount > 0) {
      status.classList.add('alert-warning');
      status.innerHTML = i18next.t('statusBatchPartial', { converted: convertedCount, total: files.length, errors: errorCount });
    } else {
      status.classList.add('alert-success');
      status.innerHTML = i18next.t('statusBatchDone', { count: convertedCount });
    }
    status.focus();

  } catch (e) {
    status.className = 'alert alert-danger mt-3';
    status.innerHTML = i18next.t('statusError', { message: e.message });
    status.focus();
    console.error("Error creating ZIP:", e);
  }
}

/**
 * Reads a file as binary string (Promise-based).
 * @param {File} file - The file to read
 * @returns {Promise<string>} - File content as binary string
 */
function readFileAsBinaryString(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}

/**
 * Switches between tabs.
 * @param {string} activeTabId - ID of the tab to activate
 */
function switchTab(activeTabId) {
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  tabs.forEach(tab => {
    const isActive = tab.id === activeTabId;
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
    tab.classList.toggle('btn-primary', isActive);
    tab.classList.toggle('btn-outline-secondary', !isActive);
  });

  panels.forEach(panel => {
    const tabId = panel.getAttribute('aria-labelledby');
    const isActive = tabId === activeTabId;
    panel.style.display = isActive ? 'block' : 'none';
  });

  // Clear status and download container when switching tabs
  const status = document.getElementById('status');
  status.style.display = 'none';
  status.className = '';
  const downloadContainer = document.getElementById("download-container");
  downloadContainer.innerHTML = "";
}

/**
 * Handles keyboard navigation for tabs.
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleTabKeydown(event) {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const currentIndex = tabs.indexOf(event.target);

  let newIndex = -1;

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
      break;
    case 'Home':
      newIndex = 0;
      break;
    case 'End':
      newIndex = tabs.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  tabs[newIndex].focus();
}

/**
 * Updates all UI elements with localized text.
 * @param {Function} t - i18next translation function
 */
function updateUITranslations(t) {
  document.documentElement.lang = window.i18next.language;

  const elements = document.querySelectorAll('[id]');
  elements.forEach(el => {
    let key = el.id.replace(/-/g, '_');

    // Handle folder panel elements that share translations with file panel
    if (key.endsWith('_folder')) {
      const baseKey = key.replace(/_folder$/, '');
      // Check if there's a specific folder translation, otherwise use the base
      const folderTranslation = t(key);
      const baseTranslation = t(baseKey);

      // Use folder-specific translation if it exists, otherwise use base
      if (folderTranslation !== key) {
        key = key;
      } else if (baseTranslation !== baseKey) {
        key = baseKey;
      }
    }

    const translation = t(key);
    if (translation !== key) {
      // Use innerHTML for keys that contain links
      if (key === 'app_description' || key === 'footer_support' || key === 'footer_contact') {
        el.innerHTML = translation;
      } else if (el.tagName === 'INPUT' && el.type === 'submit') {
        el.value = translation;
      } else {
        el.textContent = translation;
      }
    }
  });

  // Translate format options in folder panel using file panel keys
  const folderOptions = document.querySelectorAll('#panel-folder option');
  folderOptions.forEach(opt => {
    const id = opt.id;
    if (id) {
      // Convert "opt-unicode-1-folder" to "opt_unicode_1"
      const baseKey = id.replace('-folder', '').replace(/-/g, '_');
      const translation = t(baseKey);
      if (translation !== baseKey) {
        opt.textContent = translation;
      }
    }
  });

  // Special case for <title>
  document.title = t('app_title');

  // Update language menu aria-label
  const langMenu = document.getElementById('language-menu');
  langMenu.setAttribute('aria-label', t('language_selector_label'));

  // Update language selector button text
  const langButton = document.getElementById('language-selector-button');
  langButton.textContent = t('language_selector_label');

  // Update header brand link
  const headerBrand = document.getElementById('header-brand');
  headerBrand.textContent = t('app_title');

  // Update tablist aria-label
  const tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    tablist.setAttribute('aria-label', t('tablist_label') !== 'tablist_label' ? t('tablist_label') : 'Conversion mode');
  }
}

/**
 * Builds the language selector menu from available locales.
 * @param {string} currentLang - The currently active language code
 */
function buildLanguageMenu(currentLang) {
  const langList = document.getElementById('language-list');
  langList.innerHTML = '';

  const locales = window.brlcLocales;
  const langCodes = Object.keys(locales).sort();

  langCodes.forEach(langCode => {
    const langName = locales[langCode].translation.language_name || langCode;
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'dropdown-item';
    link.textContent = langName;
    link.dataset.lang = langCode;

    if (langCode === currentLang) {
      link.setAttribute('aria-current', 'page');
      link.classList.add('active');
    }

    link.addEventListener('click', function (e) {
      e.preventDefault();
      changeLanguage(langCode);
    });

    li.appendChild(link);
    langList.appendChild(li);
  });
}

/**
 * Changes the interface language.
 * @param {string} langCode - The language code to switch to
 */
function changeLanguage(langCode) {
  const i18n = window.i18next;
  i18n.changeLanguage(langCode, function (err, t) {
    if (err) {
      console.error('Error changing language:', err);
      return;
    }
    updateUITranslations(t);
    buildLanguageMenu(langCode);
    closeLanguageMenu();

    // Focus brand link after language change for screen reader announcement
    setTimeout(function () {
      document.getElementById('header-brand').focus();
    }, 200);
  });
}

/**
 * Toggles the language menu visibility.
 */
function toggleLanguageMenu() {
  const menu = document.getElementById('language-menu');
  const button = document.getElementById('language-selector-button');
  const isExpanded = button.getAttribute('aria-expanded') === 'true';

  if (isExpanded) {
    closeLanguageMenu();
  } else {
    menu.style.display = 'block';
    menu.style.position = 'absolute';
    menu.style.right = '1rem';
    menu.style.top = '3.5rem';
    button.setAttribute('aria-expanded', 'true');
  }
}

/**
 * Closes the language menu.
 */
function closeLanguageMenu() {
  const menu = document.getElementById('language-menu');
  const button = document.getElementById('language-selector-button');
  menu.style.display = 'none';
  button.setAttribute('aria-expanded', 'false');
}

function initApp() {
  const i18n = window.i18next;
  const LngDetector = window.i18nextBrowserLanguageDetector;

  i18n
    .use(LngDetector)
    .init({
      fallbackLng: 'en',
      resources: window.brlcLocales,
      debug: false
    }, function (err, t) {
      if (err) {
        console.error('Error initializing i18next:', err);
      }
      updateUITranslations(t);
      buildLanguageMenu(i18n.language);
    });

  // Language selector button click handler
  const langButton = document.getElementById('language-selector-button');
  langButton.addEventListener('click', toggleLanguageMenu);

  // Close menu when clicking outside
  document.addEventListener('click', function (e) {
    const menu = document.getElementById('language-menu');
    const button = document.getElementById('language-selector-button');
    if (!menu.contains(e.target) && e.target !== button) {
      closeLanguageMenu();
    }
  });

  // Tab switching handlers
  const tabFile = document.getElementById('tab-file');
  const tabFolder = document.getElementById('tab-folder');

  tabFile.addEventListener('click', () => switchTab('tab-file'));
  tabFolder.addEventListener('click', () => switchTab('tab-folder'));

  // Keyboard navigation for tabs
  tabFile.addEventListener('keydown', handleTabKeydown);
  tabFolder.addEventListener('keydown', handleTabKeydown);

  // Attach file form listener
  const form = document.querySelector('form[name="args"]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const inFormat = form.inFormat.value;
    const outFormat = form.outFormat.value;
    const inTextFile = form.inText.files[0];
    if (inTextFile) {
      generate(inFormat, outFormat, inTextFile);
    }
  });

  // Attach folder form listener
  const folderForm = document.querySelector('form[name="argsFolder"]');
  folderForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const inFormat = folderForm.inFormat.value;
    const outFormat = folderForm.outFormat.value;
    const files = folderForm.inFolder.files;
    if (files.length > 0) {
      generateFolder(inFormat, outFormat, files);
    }
  });

  // Attach listeners to format dropdowns (file panel)
  const inFormatSelect = document.getElementById('inFormat');
  const outFormatSelect = document.getElementById('outFormat');

  inFormatSelect.addEventListener('change', update6dotCheckboxVisibilityFile);
  outFormatSelect.addEventListener('change', update6dotCheckboxVisibilityFile);

  // Attach listeners to format dropdowns (folder panel)
  const inFormatFolderSelect = document.getElementById('inFormatFolder');
  const outFormatFolderSelect = document.getElementById('outFormatFolder');

  inFormatFolderSelect.addEventListener('change', update6dotCheckboxVisibilityFolder);
  outFormatFolderSelect.addEventListener('change', update6dotCheckboxVisibilityFolder);

  // Run once on load
  update6dotCheckboxVisibilityFile();
  update6dotCheckboxVisibilityFolder();
}

window.addEventListener('load', initApp);
