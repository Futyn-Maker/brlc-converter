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

// CLI Logic
function runCli(args, pkg) {
  try {
    let inFormat = loadMap(args.from);
    let outFormat = loadMap(args.to);

    let inText = fs.readFileSync(args.input);
    let outText = convert(inFormat, outFormat, inText, args.force6dot);

    let fileName = "";
    if ("output" in args) {
      fileName = args.output;
    } else {
      fileName = args.input.replace(/\.\w+$/, ""); // Remove file extension
      if (outFormat == "unicode") {
        fileName += ".txt";
      } else {
        fileName += `.${outFormat.format}`;
      }
    }

    fs.writeFileSync(fileName, outText);
    console.log("Done!");
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
    .option("-i, --input <file>", "Path to the file to be converted")
    .option("-o, --output <file>", "Path to the output file")
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
