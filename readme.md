# Braille Encoding Converter

Braille Encoding Converter (brlc-converter) is a simple tool to convert ready braille files between different braille encodings. A braille encoding is a character set used to represent braille patterns in digital form. For historical reasons, different countries, and even different printing houses within the same country, use different character sets when preparing texts for embossing in braille. This is largely due to the equipment used, as well as the peculiarities of a specific alphabet. This tool is designed to solve the problem of incompatibility of Braille encodings when it is necessary to emboss a file prepared for the equipment of one printing house on the equipment of another one, or to read this file using a braille display.

## Supported Braille Encodings

For now, the following formats are supported:

* [Braille Unicode](https://en.wikipedia.org/wiki/Braille_Patterns) — A universal, language-independent 8-dot encoding. It is recommended to use this format for reading with a screen-reader and a braille display. Unfortunately, few braille embossers support Braille Unicode (if any), so it is difficult to emboss a file containing Braille Unicode.
* BRF ([Braille ASCII](https://en.wikipedia.org/wiki/Braille_ASCII)) — A widely used 6-dot electronic braille format. Supported by many braille embossers, displays, and notetakers.
* [Eurobraille](http://www.braille.ch/eb-allg.htm) — An 8-dot encoding widely used in German-speaking countries. Braille transcription software such as [RTFC](https://www.rtfc.eu/) produces braille in this encoding.
* [NABCC](https://brltty.app/doc/Manual-BRLTTY/English/BRLTTY-14.html) (North American Braille Computer Code) — An 8-dot encoding that is increasingly being used in American BRF files instead of Braille ASCII.
* Local Russian encodings (developed and used by Russian braille printing houses):
  * [Logos](https://logosvos.ru) braille encoding — CP866-based 6-dot encoding that is also set up by default as \"Russian encoding\" in [Index Braille](https://indexbraille.com) embossers.
  * [\"CHTENIE\" Publishing House of All-Russia Society of the blind](https://chtenie.spb.ru) braille encoding — A 6-dot encoding.
  * GOST braille encoding — The 6-dot encoding that was accepted in [GOST R 58511-2019 Braille characters and design of braille publications](https://allgosts.ru/11/180/gost_r_58511-2019).

> **Note on 8-dot Encodings:** 8-dot encodings like Eurobraille and NABCC do not necessarily contain mappings for all 256 possible braille combinations. If a specific 8-dot character from a source file is missing in the target encoding, the converter will attempt to find a mapping for its 6-dot equivalent.

## Usage

You can use this tool in several ways, from the simple web interface to a command-line tool.

### 1. Using the Web App

The easiest way to convert your files is with the official web interface:

[https://brlc-converter.app](https://brlc-converter.app)

The web interface supports both single file and batch folder conversion:

#### Converting a Single File

1.  Select the **Convert File** tab (default).
2.  Select the **Source Format** of your file.
3.  Choose the **File to convert** using the file picker.
4.  Select the desired **Output Format**.
5.  Click the **Convert** button to process the file and receive a download link.

#### Converting Multiple Files (Batch Mode)

1.  Select the **Convert Folder** tab.
2.  Select the **Source Format** of all files in the folder.
3.  Choose the **Folder to convert** using the folder picker.
4.  Select the desired **Output Format**.
5.  Click the **Convert** button to process all files and receive a ZIP archive.

The ZIP file will be named `{folder_name}_{format}.zip` (e.g., `mybooks_unicode.zip`).

> Note: All files in the folder must be in the same braille encoding.

When converting from an 8-dot encoding (like Eurobraille or NABCC) to Braille Unicode, a checkbox will appear: **\"Force 6-dot output (discard dots 7 and 8)\"**. This allows you to replace the 8-dot characters with their 6-dot variants.

> Tip: This feature is also useful if you simply need to convert an 8-dot Braille Unicode file to 6-dot Braille Unicode. To do this, select Braille Unicode as both the input and output format, and check the 6-dot box.

If you prefer to run the web version offline or host it yourself, you can download the latest `-web.zip` file from the [Releases page](https://github.com/Futyn-Maker/brlc-converter/releases). Unzip the package and open the `index.html` file in your browser to use it locally.

### 2. Using the Windows Executable

For Windows users who want a graphical interface, you can also download the latest `brlc-converter.exe` from the [Releases page](https://github.com/Futyn-Maker/brlc-converter/releases).

The executable has two modes:

#### A) Local Web UI

For a graphical interface, simply **double-click (or press Enter) the `brlc-converter.exe` file**.

This will start a local web server in the background and automatically open the converter in your default browser.

#### B) Command Line Interface (CLI)

To use the tool in your terminal or in scripts, run it with the `--input` (or `-i`) flag.

```bash
brlc-converter.exe --input mybook.brf --from brf --to unicode
```

This will output `mybook.txt` in the same directory.

### 3. Running from Source

Developers can run the tool directly from the source code.

1.  Ensure you have **Node.js v21 or newer** installed.
2.  Clone this repo: `git clone https://github.com/Futyn-Maker/brlc-converter.git`
3.  Move into the directory: `cd brlc-converter`
4.  Install dependencies: `npm install`

Now you can run the CLI script:

```bash
node src/cli/cli.js -i mybook.brf -f brf -t unicode
```

To run the local web server from source (it will run in your current terminal):

```bash
npm start
```

## Command Line Options

Running the tool with `--help` displays all available commands:

```
Usage: brlc-converter [options]

Converts braille files between different braille encodings

Options:
  -V, --version        output the version number
  -f, --from <format>  The braille encoding of the input file (default: "unicode")
  -t, --to <format>    The braille encoding of the output file (default: "unicode")
  -i, --input <path>   Path to the file or folder to be converted
  -o, --output <path>  Path to the output file or folder
  --force-6dot         Force 6-dot output (remove dots 7/8) when converting to Unicode
  -h, --help           display help for command
```

The `-i` option accepts both files and folders:

* **Single file:** Converts the file and outputs to the same directory (or to `-o` if specified).
* **Folder:** Converts all files in the folder. If `-o` is not specified, creates a new folder named `{input_folder}_{format}` (e.g., `mybooks_unicode`). If `-o` is specified, outputs directly to that folder.

The arguments for `-f` (`--from`) and `-t` (`--to`) are:

* `unicode` (default) — Braille Unicode (8-dot)
* `brf` — BRF / Braille ASCII (6-dot)
* `eurobraille` — Eurobraille (8-dot)
* `nabcc` — North American Braille Computer Code (8-dot)
* `logos` — Logos braille encoding (6-dot)
* `chtenie` — \"CHTENIE\" Publishing House braille encoding (6-dot)
* `gost` — GOST braille encoding (6-dot)

**Examples:**

Convert a Logos file to Braille Unicode:

```bash
node src/cli/cli.js -f logos -t unicode -i mybook.txt -o mybook.txt
```

Convert a Eurobraille file to 6-dot Braille Unicode, discarding dots 7 and 8:

```bash
node src/cli/cli.js -f eurobraille -t unicode --force-6dot -i mybook.brl -o mybook.txt
```

Convert all files in a folder from BRF to Braille Unicode:

```bash
node src/cli/cli.js -f brf -t unicode -i ./my_brf_books
```

This creates a folder `my_brf_books_unicode` with the converted files.

Convert a folder to a specific output directory:

```bash
node src/cli/cli.js -f brf -t unicode -i ./my_brf_books -o ./converted
```

## Building from Source

If you want to build the executable for your platform or the static web package yourself, first follow the \"Running from Source\" steps (`clone`, `cd`, `npm install`).

You must have **Node.js v21 or newer** to build the project.

### Building the Static Web Package

This command bundles all web files (HTML, JS, and data) into the `/dist` folder. This is the folder you would upload to a static web host or run `index.html` locally.

```bash
npm run build:web
```

### Building the Single Executable Application (SEA)

This command first builds the web package (like above) and then bundles the entire application, including the Node.js runtime, into a single executable file located in the `/bin` folder.

```bash
npm run build:sea
```
