#!/usr/bin/env node

const { program } = require("commander");
const fs = require("fs");
const path = require("path");
const net = require('net');
const os = require('os');
const { spawn } = require('child_process');
const { isSea, getAsset } = require("node:sea");
const convert = require("../core/convert");

const LOCK_FILE = path.join(os.tmpdir(), 'brlc-converter.lock');
const DEFAULT_PORT = 3000;

// Helper function to load data from SEA or filesystem
function loadData(assetPath, encoding = 'utf8') {
  if (isSea()) {
    try {
      // Asset keys in the SEA are relative to the project root at build time
      return getAsset(assetPath, encoding);
    } catch (e) {
      console.error(`Failed to load asset from executable: ${assetPath}`, e);
      process.exit(1);
    }
  } else {
    // Fallback for running from source
    const fsPath = path.join(__dirname, '../../', assetPath);
    try {
      return fs.readFileSync(fsPath, encoding);
    } catch (e) {
      console.error(`Failed to read file from filesystem: ${fsPath}`, e);
      process.exit(1);
    }
  }
}

function loadMap(formatName) {
  if (formatName === 'unicode') {
    return 'unicode';
  }
  const assetPath = `data/${formatName}.json`;
  const fileContent = loadData(assetPath);
  return JSON.parse(fileContent);
}

// Helper function to find an available port
function findAvailablePort(port, isDaemon = false) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref(); // Don't keep the process alive
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (!isDaemon) console.log(`Port ${port} is busy, trying ${port + 1}`);
        resolve(findAvailablePort(port + 1));
      } else {
        reject(err);
      }
    });
    server.listen(port, () => {
      server.close(() => {
        if (!isDaemon) console.log(`Port ${port} is available.`);
        resolve(port);
      });
    });
  });
}

/**
 * Gets the output file extension for a given format.
 * @param {object|string} outFormat - Output format map or 'unicode'
 * @returns {string} - File extension (e.g., ".txt", ".brf")
 */
function getOutputExtension(outFormat) {
  if (outFormat === 'unicode') {
    return '.txt';
  }
  return '.' + outFormat.format;
}

/**
 * Generates output filename from input filename.
 * @param {string} inputPath - Input file path
 * @param {object|string} outFormat - Output format map or 'unicode'
 * @returns {string} - Output filename (without directory)
 */
function getOutputFileName(inputPath, outFormat) {
  const baseName = path.basename(inputPath).replace(/\.\w+$/, "");
  return baseName + getOutputExtension(outFormat);
}

/**
 * Converts a single file.
 * @param {string} inputPath - Path to input file
 * @param {string} outputPath - Path to output file
 * @param {object|string} inFormat - Input format map or 'unicode'
 * @param {object|string} outFormat - Output format map or 'unicode'
 * @param {boolean} force6dot - Whether to force 6-dot output
 */
function convertSingleFile(inputPath, outputPath, inFormat, outFormat, force6dot) {
  const inText = fs.readFileSync(inputPath);
  const outText = convert(inFormat, outFormat, inText, force6dot);
  fs.writeFileSync(outputPath, outText);
}

/**
 * Converts all files in a directory.
 * @param {string} inputDir - Path to input directory
 * @param {string} outputDir - Path to output directory
 * @param {object|string} inFormat - Input format map or 'unicode'
 * @param {object|string} outFormat - Output format map or 'unicode'
 * @param {boolean} force6dot - Whether to force 6-dot output
 */
function convertDirectory(inputDir, outputDir, inFormat, outFormat, force6dot) {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get all files in the input directory (non-recursive)
  const files = fs.readdirSync(inputDir).filter(file => {
    const filePath = path.join(inputDir, file);
    return fs.statSync(filePath).isFile();
  });

  if (files.length === 0) {
    console.log('No files found in the input directory.');
    return;
  }

  console.log(`Converting ${files.length} file(s)...`);

  let convertedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputFileName = getOutputFileName(inputPath, outFormat);
    const outputPath = path.join(outputDir, outputFileName);

    try {
      convertSingleFile(inputPath, outputPath, inFormat, outFormat, force6dot);
      convertedCount++;
      console.log(`  Converted: ${file} -> ${outputFileName}`);
    } catch (e) {
      errorCount++;
      console.error(`  Error converting ${file}: ${e.message}`);
    }
  }

  console.log(`\nDone! ${convertedCount} file(s) converted${errorCount > 0 ? `, ${errorCount} error(s)` : ''}.`);
  console.log(`Output directory: ${path.resolve(outputDir)}`);
}

// CLI Logic
function runCli(args, pkg) {
  try {
    const inFormat = loadMap(args.from);
    const outFormat = loadMap(args.to);

    const inputStat = fs.statSync(args.input);

    if (inputStat.isDirectory()) {
      // Directory mode
      const inputDir = args.input;
      const inputDirName = path.basename(path.resolve(inputDir));

      let outputDir;
      if ("output" in args) {
        outputDir = args.output;
      } else {
        // Create output folder name: {source_folder_name}_{encoding_name}
        outputDir = `${inputDirName}_${args.to}`;
      }

      convertDirectory(inputDir, outputDir, inFormat, outFormat, args.force6dot);
    } else {
      // Single file mode
      let fileName = "";
      if ("output" in args) {
        fileName = args.output;
      } else {
        fileName = args.input.replace(/\.\w+$/, ""); // Remove file extension
        fileName += getOutputExtension(outFormat);
      }

      convertSingleFile(args.input, fileName, inFormat, outFormat, args.force6dot);
      console.log("Done!");
    }
  } catch (e) {
    console.error(`Error during conversion: ${e.message}`);
    process.exit(1);
  }
}

// Local UI Logic
async function runLocalWebServer(isDaemon = false) {
  try {
    const express = require('express');
    const open = require('open');

    // Check for existing server
    if (fs.existsSync(LOCK_FILE)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        const port = lockData.port;

        // Check if the port is actually in use
        await new Promise((resolve, reject) => {
          const checker = net.createConnection({ port }, () => {
            checker.end();
            resolve(port); // Success! Server is running.
          });
          checker.on('error', (err) => {
            fs.unlinkSync(LOCK_FILE); // Stale lock file
            reject(new Error('Stale lock file'));
          });
        });

        // If we are here, server is running. Open browser and exit this instance
        const url = `http://localhost:${port}`;
        if (!isDaemon) console.log(`Existing server found. Opening ${url}`);
        open(url, { new: true });
        return;

      } catch (e) {
        // Lock file was stale or unreadable. Proceed to start a new server.
        if (!isDaemon) console.log('Stale lock file found. Starting new server.');
      }
    }

    // No server running. Start a new one.
    const port = await findAvailablePort(DEFAULT_PORT, isDaemon);
    const app = express();

    // Define a simple middleware to serve assets from the SEA
    const seaAssetMiddleware = (req, res, next) => {
      // We'll map web requests to our asset paths
      let assetPath = req.path;
      if (assetPath === '/') {
        assetPath = 'web/index.html';
      } else {
        // Remove leading slash for asset key
        assetPath = `web${assetPath}`;
      }

      try {
        let encoding = 'utf8';
        if (assetPath.endsWith('.js')) {
          res.type('application/javascript');
        } else if (assetPath.endsWith('.css')) {
          res.type('text/css');
        } else if (assetPath.endsWith('.json')) {
          res.type('application/json');
        } else if (assetPath.endsWith('.html')) {
          res.type('text/html');
        } else {
          encoding = undefined;
        }

        const asset = getAsset(assetPath, encoding);
        res.send(asset);
      } catch (e) {
        // Asset not found in SEA
        res.status(404).send('Asset not found');
      }
    };

    if (isSea()) {
      // When running from executable, serve bundled assets
      app.use(seaAssetMiddleware);
    } else {
      // When running from source, serve the /dist folder
      const distPath = path.join(__dirname, '../../dist');
      if (!fs.existsSync(distPath)) {
        if (!isDaemon) {
          console.error('Error: /dist folder not found.');
          console.log('Please run the build script first (npm run build:web).');
        }
        process.exit(1);
      }

      app.use(express.static(distPath));
    }

    const server = app.listen(port, () => {
      const url = `http://localhost:${port}`;
      if (!isDaemon) {
        console.log(`BRLC-Converter UI is running at: ${url}`);
        console.log('Press Ctrl+C to stop the server.');
      }

      // Write lock file *after* server is listening
      try {
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ port }));
      } catch (e) {
        if (!isDaemon) console.error('Failed to write lock file:', e);
      }

      open(url, { new: true });
    });

    // Graceful shutdown: remove the lock file
    const cleanup = () => {
      try {
        if (fs.existsSync(LOCK_FILE)) {
          fs.unlinkSync(LOCK_FILE);
          if (!isDaemon) console.log('Lock file removed.');
        }
      } catch (e) {
        if (!isDaemon) console.error('Failed to remove lock file:', e);
      }
      server.close(() => {
        if (!isDaemon) console.log('Server shut down.');
        process.exit(0);
      });
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } catch (e) {
    if (!isDaemon) {
      console.error('Failed to start local UI server.', e);
      console.error('Please make sure "express" and "open" are installed:');
      console.error('npm install express open');
    }
    process.exit(1);
  }
}

// Main Application
async function run() {
  if (process.argv.includes('--run-as-daemon')) {
    // This is the daemon process, run the server silently
    await runLocalWebServer(true);
    return; // Keep daemon process alive
  }

  // Load package.json from assets
  const pkg = JSON.parse(loadData('package.json'));

  program
    .name(pkg.name)
    .description(pkg.description)
    .version(pkg.version)
    .option("-f, --from <format>", "The braille encoding of the input file", "unicode")
    .option("-t, --to <format>", "The braille encoding of the output file", "unicode")
    .option("-i, --input <path>", "Path to the file or folder to be converted")
    .option("-o, --output <path>", "Path to the output file or folder")
    .option("--force-6dot", "Force 6-dot output (remove dots 7/8) when converting to Unicode")
    .showHelpAfterError();

  program.parse(process.argv);

  const args = program.opts();

  // If -i (input) is provided, run CLI. Otherwise, launch UI.
  if (args.input) {
    runCli(args, pkg);
  } else {
    // Check if any args were passed. If so, show help (unless it's --help or --version)
    const relevantArgs = process.argv.slice(2).filter(arg => arg !== '--help' && arg !== '-V' && arg !== '--version');
    if (relevantArgs.length > 0 && !args.input) {
      program.help();
    } else {
      // Launch UI
      if (isSea()) {
        // In SEA, spawn a detached daemon process and exit this launcher
        console.log('Starting BRLC-Converter server in the background...');
        const daemonArgs = process.argv.slice(1).concat('--run-as-daemon');
        const child = spawn(process.execPath, daemonArgs, {
          detached: true, // Detach from parent
          stdio: 'pipe'
        });
        child.unref(); // Allow parent to exit
        process.exit(0); // Exit the launcher
      } else {
        // From source, run server in the foreground
        await runLocalWebServer(false);
      }
    }
  }
}

run();
