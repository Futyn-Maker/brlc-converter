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
 */
function update6dotCheckboxVisibility() {
  const inFormat = document.getElementById('inFormat').value;
  const outFormat = document.getElementById('outFormat').value;
  const container = document.getElementById('force-6dot-container');
  const checkbox = document.getElementById('force-6dot');

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

function generate(inFormat, outFormat, inTextFile) {
  // Clear previous link
  const downloadContainer = document.getElementById("download-container");
  downloadContainer.innerHTML = "";

  const inMap = (inFormat === 'unicode') ? 'unicode' : window.brlcData[inFormat];
  const outMap = (outFormat === 'unicode') ? 'unicode' : window.brlcData[outFormat];

  // Get the 6-dot flag value
  const force6dotCheckbox = document.getElementById('force-6dot');
  const force6dot = force6dotCheckbox.checked && (force6dotCheckbox.closest('div').style.display !== 'none');

  const reader = new FileReader();
  reader.readAsBinaryString(inTextFile); // Keep as binary string for jschardet
  reader.onload = function () {
    try {
      const outText = window.convert(inMap, outMap, reader.result, force6dot);

      let fileName = inTextFile.name.replace(/\.\w+$/, "");
      if (outFormat === "unicode") {
        fileName += ".txt";
      } else {
        fileName += `.${outMap.format}`;
      }

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
 * Updates all UI elements with localized text.
 * @param {Function} t - i18next translation function
 */
function updateUITranslations(t) {
  document.documentElement.lang = window.i18next.language;

  const elements = document.querySelectorAll('[id]');
  elements.forEach(el => {
    const key = el.id.replace(/-/g, '_');
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

  // Attach form listener
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

  // Attach listeners to format dropdowns
  const inFormatSelect = document.getElementById('inFormat');
  const outFormatSelect = document.getElementById('outFormat');

  inFormatSelect.addEventListener('change', update6dotCheckboxVisibility);
  outFormatSelect.addEventListener('change', update6dotCheckboxVisibility);

  // Run once on load
  update6dotCheckboxVisibility();
}

window.addEventListener('load', initApp);
