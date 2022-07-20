# Braille Encoding Converter

Braille Encoding Converter (brlc-converter) is a simple tool to convert ready braille files between different braille encodings. A braille encoding is a character set used to represent braille patterns in digital form. For historical reasons, different countries, and even different Braille printing houses within the same country, use different character sets when preparing texts for embossing in braille. This is largely due to the equipment used, as well as the peculiarities of a specific alphabet. This tool is designed to solve the problem of incompatibility of Braille encodings when it is necessary to emboss a file prepared for the equipment of one printing house on the equipment of another one, or to read this file using a braille display.

## Supported braille encodings

For now, the following formats are supported:

* [Braille Unicode](https://en.wikipedia.org/wiki/Braille_Patterns) — the universal, language independent encoding. It is recommended to use this format for reading with a screen-reader and a braille display. Unfortunately, few braille embossers support Braille Unicode (if any), so it is difficult to emboss a file containing Braille Unicode.
* BRF ([Braille ASCII](https://en.wikipedia.org/wiki/Braille_ASCII)) — a widely used electronic braille format. Supported by any braille embosser and many braille displays and notetakers.
* Local Russian encodings (they are developed and used by Russian braille printing houses):
  * [Logos](https://logosvos.ru) braille encoding — CP866-based encoding that is also set up by default as "Russian encoding" in the [Index Braille)(https://indexbraille.com) embossers.
  * ["CHTENIE" Publishing House of All-Russia Society of the blind](https://chtenie.spb.ru) braille encoding;
  * GOST braille encoding — the encoding that was accepted in [GOST R 58511-2019 Braille characters and design of braille publications](https://allgosts.ru/11/180/gost_r_58511-2019#:~:text=%D0%93%D0%9E%D0%A1%D0%A2%20%D0%A0%2058511%2D2019%20%D0%A1%D0%B8%D0%BC%D0%B2%D0%BE%D0%BB%D1%8B%20%D0%91%D1%80%D0%B0%D0%B9%D0%BB%D1%8F%20%D0%B8%20%D0%BE%D1%84%D0%BE%D1%80%D0%BC%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B1%D1%80%D0%B0%D0%B9%D0%BB%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D1%85%20%D0%B8%D0%B7%D0%B4%D0%B0%D0%BD%D0%B8%D0%B9,-%D0%9E%D0%B1%D0%BE%D0%B7%D0%BD%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%3A).

## Usage

There are two ways of using this app: as a command line  tool or as a web service.

### The command line tool

Depending on whether you use an already compiled executable file or run the app from the source code, type in the terminal:
`brlc-converter --help`
OR
`node brlc-converter.js --help`
(in the second case it is assumed that you've already installed [Node.js](https://nodejs.org).

```
Usage: brlc-converter [options]

Converts braille files between different braille encodings

Options:
  -V, --version        output the version number
  -f, --from <format>  The braille encoding of the input file (default:
                       "unicode")
  -t, --to <format>    The braille encoding of the output file (default:
                       "unicode")
  -i, --input <file>   Path to the file to be converted
  -o, --output <file>  Path to the output file
  -h, --help           display help for command
```

The arguments for `from` and `to` options are following:

* `unicode` (default) — Braille Unicode.
* `brf` — BRF.
* `logos` — Logos braille encoding.
* `chtenie` — Chtenie Publishing House braille encoding.
* `gost` — GOST braille encoding.

For example, to convert the BRF file to the Braille Unicode format, you can type:
`brlc-converter -f brf -t unicode -i mybook.brf -o mybook.txt`

### Using the web service

Instead of using the command line tool, you can just go [here](https://brlc-converter.pages.dev) and use the simple form to select  input and output formats and upload your file (this UI is available in Russian language only). After pressing "convert" button, the link for downloading converted file will appear after a few seconds.

## Running from source and building

If you would like to run the app from source, or build it for your platform, do following:

1. Install [Node.js](https://nodejs.org).
2. Clone this repo with `git clone https://github.com/Futyn-Maker/brlc-converter.git`. Then move to the project directory with `cd brlc-converter`.
3. Install the dependencies with `npm install`. After this, you can run the app using "brlc-converter.js". If you want to get an executable file, follow next.
4. Install Pkg with `npm install -g pkg`.
5. Run `pkg .` and wait for completing packaging. This will create the "dist" folder with  the executable file for your platform containing a command line tool.
6. Copy the "data" folder from the root directory of the app to created "dist" folder.

The web version of the app can't work locally due to the [Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy). You should deploy the app using your own server or one of the free static-site hostings, such as [GitHub Pages](https://github.io), [Cloudflare Pages](https://pages.dev), or [Surge](https://surge.sh). To do this you need:

1. Clone the repo with `git clone https://github.com/Futyn-Maker/brlc-converter`.
2. Create a new directory, for example, "web" and copy there following:
  * "data" directory;
  * "index.html".;
  * "convert.min.js".
3. Deploy the project using this folder.

Note: the file "convert.min.js" was created by [Browserify](https://browserify.org). You can get it yourself from "convert.js". To do this, install Browserify with `npm install -g browserify`, then, in the project directory, run `browserify -o convert.min.js -s convert convert.js`.
