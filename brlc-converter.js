const {program} = require("commander");
const {name, description, version} = require("./package.json");
const fs = require("fs");
const path = require("path");
const convert = require("./convert");

program
    .name(name)
    .description(description)
    .version(version)
    .option("-f, --from <format>", "The braille encoding of the input file", "unicode")
    .option("-t, --to <format>", "The braille encoding of the output file", "unicode")
    .requiredOption("-i, --input <file>", "Path to the file to be converted")
    .option("-o, --output <file>", "Path to the output file")
    .showHelpAfterError();
const args = program.parse().opts()
const dataPath = path.dirname(process.execPath);

let inFormat = args.from;
if (inFormat != "unicode") {
    inFormat = require(path.join(dataPath, "data", `${inFormat}.json`));
}

let outFormat = args.to;
if (outFormat != "unicode") {
    outFormat = require(path.join(dataPath, "data", `${outFormat}.json`));
}

let inText = fs.readFileSync(args.input);

let outText = convert(inFormat, outFormat, inText);

let fileName = ""
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
