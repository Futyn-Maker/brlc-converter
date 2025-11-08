const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const { rimraf } = require('rimraf');
const { ncp } = require('ncp');
const esbuild = require('esbuild');

// Promisify async functions for use with await
const execPromise = util.promisify(exec);
const ncpPromise = util.promisify(ncp);

// Configuration
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const name = packageJson.name;

const BUILD_DIR = path.resolve(__dirname, 'build_temp');
const DIST_DIR = path.resolve(__dirname, 'dist');
const BIN_DIR = path.resolve(__dirname, 'bin');
const DATA_DIR = path.resolve(__dirname, 'data');
const LOCALES_DIR = path.resolve(__dirname, 'locales');
const WEB_SRC_DIR = path.resolve(__dirname, 'src/web');
const CORE_SCRIPT = path.resolve(__dirname, 'src/core/convert.js');
const CLI_SCRIPT = path.resolve(__dirname, 'src/cli/cli.js');
const CLI_BUNDLE_SCRIPT = path.join(BUILD_DIR, 'cli.bundle.js');

// Helper Functions

// Clean up old build artifacts
async function clean() {
  console.log('Cleaning old build directories...');
  await Promise.all([
    rimraf(BUILD_DIR),
    rimraf(DIST_DIR),
    rimraf(BIN_DIR)
  ]);
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log('Cleaned successfully.');
}

// Bundle convert.js for the browser
async function bundleConverter() {
  console.log('Bundling converter logic for browser...');
  const in_file = CORE_SCRIPT;
  const out_file = path.join(DIST_DIR, 'convert.bundle.js');

  await execPromise(`npx browserify ${in_file} -s convert -o ${out_file}`);
  console.log('Converter bundled.');
}

// Bundle data/*.json files into data.js
async function bundleData() {
  console.log('Bundling data files...');
  const dataBundle = {};
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const formatName = path.basename(file, '.json');
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    dataBundle[formatName] = JSON.parse(content);
  }

  const content = `window.brlcData = ${JSON.stringify(dataBundle)};`;
  fs.writeFileSync(path.join(DIST_DIR, 'data.js'), content);
  console.log('Data files bundled.');
}

// Bundle locales/*.json files into locales.js
async function bundleLocales() {
  console.log('Bundling locale files...');
  const localesBundle = {};
  const langs = fs.readdirSync(LOCALES_DIR);

  for (const lang of langs) {
    const langDir = path.join(LOCALES_DIR, lang);
    if (fs.statSync(langDir).isDirectory()) {
      const translationFile = path.join(langDir, 'translation.json');
      if (fs.existsSync(translationFile)) {
        const content = fs.readFileSync(translationFile, 'utf8');
        localesBundle[lang] = { translation: JSON.parse(content) };
      }
    }
  }

  const content = `window.brlcLocales = ${JSON.stringify(localesBundle)};`;
  fs.writeFileSync(path.join(DIST_DIR, 'locales.js'), content);
  console.log('Locale files bundled.');
}

// Copy web source files
async function copyWebFiles() {
  console.log('Copying web UI files...');
  await ncpPromise(WEB_SRC_DIR, DIST_DIR);
  console.log('Web UI files copied.');
}

// Bundle the CLI script and all its node_modules dependencies with esbuild
async function bundleCli() {
  console.log('Bundling CLI script for SEA with esbuild...');
  try {
    await esbuild.build({
      entryPoints: [CLI_SCRIPT],
      bundle: true,
      outfile: CLI_BUNDLE_SCRIPT,
      platform: 'node',
      target: 'node20',
      external: [], // Force bundling of all dependencies
      logLevel: 'info',
      minify: true,
    });
    console.log('CLI script bundled successfully.');
  } catch (err) {
    console.error('Error bundling CLI with esbuild:', err);
    throw err;
  }
}

// Build the 'dist' folder (static web version)
async function buildWeb() {
  console.log('\n--- Building Static Web Version ---');
  await Promise.all([
    bundleConverter(),
    bundleData(),
    bundleLocales(),
    copyWebFiles()
  ]);
  console.log('--- Static Web Version build complete in /dist ---');
}

// Build the Single Executable Application
async function buildSEA() {
  console.log('\n--- Building Single Executable Application ---');

  // Build the 'dist' folder assets (needed for the web server)
  await Promise.all([
    bundleConverter(),
    bundleData(),
    bundleLocales(),
    copyWebFiles()
  ]);
  console.log('Static web assets prepared.');

  // Bundle the CLI script
  await bundleCli();

  const platform = process.platform;
  let outputExeName = name;
  if (platform === 'win32') {
    outputExeName += '.exe';
  }
  const outputExePath = path.join(BIN_DIR, outputExeName);

  // Generate the SEA config
  console.log('Generating SEA config...');
  const seaConfig = {
    main: CLI_BUNDLE_SCRIPT,
    output: path.join(BUILD_DIR, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    assets: {
      'package.json': path.resolve(__dirname, 'package.json')
    }
  };

  // Add data assets
  const dataFiles = fs.readdirSync(DATA_DIR);
  for (const file of dataFiles) {
    const assetKey = `data/${file}`;
    const assetPath = path.resolve(DATA_DIR, file);
    seaConfig.assets[assetKey] = assetPath;
  }

  // Add web/dist assets
  const distFiles = fs.readdirSync(DIST_DIR);
  for (const file of distFiles) {
    const assetKey = `web/${file}`;
    const assetPath = path.resolve(DIST_DIR, file);
    seaConfig.assets[assetKey] = assetPath;
  }

  const configPath = path.join(BUILD_DIR, 'sea-config.json');
  fs.writeFileSync(configPath, JSON.stringify(seaConfig, null, 2));

  // Generate the blob
  console.log('Generating SEA blob...');
  await execPromise(`node --experimental-sea-config ${configPath}`);

  // Create a copy of the node executable
  console.log(`Copying node executable to ${outputExePath}...`);
  fs.copyFileSync(process.execPath, outputExePath);

  // Remove signature (macOS/Windows)
  if (platform === 'darwin') {
    console.log('Removing signature from macOS binary...');
    await execPromise(`codesign --remove-signature "${outputExePath}"`);
  } else if (platform === 'win32') {
    console.log('Attempting to remove signature from Windows binary (this may fail if signtool is not in PATH)...');
    try {
      await execPromise(`signtool remove /s "${outputExePath}"`);
    } catch (e) {
      console.warn('Could not remove signature. This is often safe to ignore.');
    }
  }

  // Inject the blob using postject
  console.log('Injecting blob into executable...');
  // Use path.resolve for postject paths to avoid shell issues
  const resolvedExePath = path.resolve(outputExePath);
  const resolvedBlobPath = path.resolve(seaConfig.output);

  let postjectCmd = `npx postject "${resolvedExePath}" NODE_SEA_BLOB "${resolvedBlobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;

  if (platform === 'darwin') {
    postjectCmd += ' --macho-segment-name NODE_SEA';
  }

  await execPromise(postjectCmd);

  // Sign the binary (macOS/Windows)
  if (platform === 'darwin') {
    console.log('Signing macOS executable...');
    await execPromise(`codesign --sign - "${resolvedExePath}"`);
  } else if (platform === 'win32') {
    console.log('Windows executable signing skipped. (Requires a certificate)');
  }

  console.log(`--- SEA build complete in /bin/${outputExeName} ---`);
}

// Main Execution
async function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'all'; // 'all', 'web', or 'sea'

  try {
    await clean();

    if (target === 'web') {
      await buildWeb();
    } else if (target === 'sea') {
      await buildSEA();
    } else { // default 'all'
      await buildWeb();
      await buildSEA();
    }

    console.log('\nBuild finished successfully.');
  } catch (error) {
    console.error('\nBuild FAILED:');
    console.error(error.message);
    if (error.stdout) console.error('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exit(1);
  } finally {
    // Clean up temporary build files
    await rimraf(BUILD_DIR);
  }
}

main();
