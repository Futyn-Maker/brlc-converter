# Braille Encoding Converter

Braille Encoding Converter (brlc-converter) is a simple tool to convert ready braille files between different braille encodings. A braille encoding is a character set used to represent braille patterns in digital form. For historical reasons, different countries, and even different printing houses within the same country, use different character sets when preparing texts for embossing in braille. This is largely due to the equipment used, as well as the peculiarities of a specific alphabet. This tool is designed to solve the problem of incompatibility of Braille encodings when it is necessary to emboss a file prepared for the equipment of one printing house on the equipment of another one, or to read this file using a braille display.

-----

## Supported Braille Encodings

For now, the following formats are supported:

  * [Braille Unicode](https://en.wikipedia.org/wiki/Braille_Patterns) — The universal, language-independent encoding. It is recommended to use this format for reading with a screen-reader and a braille display. Unfortunately, few braille embossers support Braille Unicode (if any), so it is difficult to emboss a file containing Braille Unicode.
  * BRF ([Braille ASCII](https://en.wikipedia.org/wiki/Braille_ASCII)) — A widely used 6-dot electronic braille format. Supported by many braille embossers, displays, and notetakers.
  * Local Russian encodings (developed and used by Russian braille printing houses):
      * [Logos](https://logosvos.ru) braille encoding — CP866-based encoding that is also set up by default as "Russian encoding" in [Index Braille](https://indexbraille.com) embossers.
      * ["CHTENIE" Publishing House of All-Russia Society of the blind](https://chtenie.spb.ru) braille encoding.
      * GOST braille encoding — The encoding that was accepted in [GOST R 58511-2019 Braille characters and design of braille publications](https://allgosts.ru/11/180/gost_r_58511-2019).

-----

## Usage

You can use this tool in several ways, from the simple web interface to a command-line tool.

### 1\. Using the Web App

The easiest way to convert your files is with the official web interface:

**[https://brlc-converter.app](https://brlc-converter.app)**

If you prefer to run the web version offline or host it yourself, you can download the latest `-web.zip` file from the [Releases page](https://github.com/Futyn-Maker/brlc-converter/releases). Unzip the package and open the `index.html` file in your browser to use it locally.

### 2\. Using the Windows Executable

For Windows users who want a graphical interface, you can also download the latest `brlc-converter.exe` from the [Releases page](https://github.com/Futyn-Maker/brlc-converter/releases).

The executable has two modes:

#### A) Local Web UI

For a graphical interface, simply **double-click (or press Enter) the `brlc-converter.exe` file**.

This will start a local web server in the background and automatically open the converter in your default browser.

#### B) Command Line Interface (CLI)

To use the tool in your terminal or in scripts, run it with the `--input` (or `-i`) flag.

```sh
brlc-converter.exe --input mybook.brf --from brf --to unicode
```

This will output `mybook.txt` in the same directory.

### 3\. Running from Source

Developers can run the tool directly from the source code.

1.  Ensure you have **Node.js v21 or newer** installed.
2.  Clone this repo: `git clone https://github.com/Futyn-Maker/brlc-converter.git`
3.  Move into the directory: `cd brlc-converter`
4.  Install dependencies: `npm install`

Now you can run the CLI script:

```sh
node src/cli/cli.js -i mybook.brf -f brf -t unicode
```

To run the local web server from source (it will run in your current terminal):

```sh
npm start
```

-----

## Command Line Options

Running the tool with `--help` displays all available commands:

```
Usage: brlc-converter [options]

Converts braille files between different braille encodings

Options:
  -V, --version        output the version number
  -f, --from <format>  The braille encoding of the input file (default: "unicode")
  -t, --to <format>    The braille encoding of the output file (default: "unicode")
  -i, --input <file>   Path to the file to be converted
  -o, --output <file>  Path to the output file
  -h, --help           display help for command
```

The arguments for `-f` (`--from`) and `-t` (`--to`) are:

  * `unicode` (default) — Braille Unicode
  * `brf` — BRF
  * `logos` — Logos braille encoding
  * `chtenie` — "CHTENIE" Publishing House braille encoding
  * `gost` — GOST braille encoding

**Example:**

```sh
node src/cli/cli.js -f logos -t unicode -i mybook.txt -o mybook.txt
```

-----

## Building from Source

If you want to build the executable for your platform or the static web package yourself, first follow the "Running from Source" steps (clone, cd, `npm install`).

You must have **Node.js v21 or newer** to build the project.

### Building the Static Web Package

This command bundles all web files (HTML, JS, and data) into the `/dist` folder. This is the folder you would upload to a static web host or run `index.html` locally.

```sh
npm run build:web
```

### Building the Single Executable Application (SEA)

This command first builds the web package (like above) and then bundles the entire application, including the Node.js runtime, into a single executable file located in the `/bin` folder.

```sh
npm run build:sea
```
