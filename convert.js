const jschardet = require("jschardet");
const iconv = require("iconv-lite");
iconv.skipDecodeWarning = true; // This is because we have to use decoding from a binary string in the browser version

function convert(inMap, outMap, inText) {
    let encoding = jschardet.detect(inText).encoding;
    inText = iconv.decode(inText, encoding);

    let outText = inText;

    if (inMap == "unicode" && outMap == "unicode") {
        outText = clearUnicode(outText);
        encoding = "utf-8";
    } else if (inMap == "unicode") {
        outText = clearUnicode(outText);
        outText = fromUnicode(outMap.characters, outText);
        encoding = outMap.encoding;
    } else if (outMap == "unicode") {
        outText = toUnicode(inMap.characters, outText);
        outText = clearUnicode(outText);
        encoding = "utf-8";
    } else {
        outText = toUnicode(inMap.characters, outText);
        outText = fromUnicode(outMap.characters, outText, false);
        encoding = outMap.encoding;
    }

    outText = iconv.encode(outText, encoding);
    return outText;
}

function toUnicode(inTable, inText) {
    let outText = inText;
    // At first, we need to replace letters A-Z, as they're used as a virtual braille dots
    for (let char of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        if (char in inTable) {
            outText = outText.replaceAll(char, inTable[char]);
            delete inTable[char];
        }
    }
    // Now we can replace other characters
    for (let char in inTable) {
        if (inTable[char].length == 1 && inTable[char].charCodeAt(0) <= 10303) { // Check if the character doesn't correspond to a virtual dot or a dot with lowered dots (7 and 8)
            outText = outText.replaceAll(char, inTable[char] + "0");
        } else {
            outText = outText.replaceAll(char, inTable[char]);
        }
    }
    return outText;
}

function fromUnicode(outTable, inText, isClean=true) {
    let outText = inText;
    if (isClean) {
        for (let char in outTable) {
            outText = outText.replaceAll(outTable[char], char);
        }
    } else {
        let chars = outText.match(/[\u2801-\u28FF][0A-Z]?/g); // Get all braille characters, both with virtual dots and without
        chars = Array.from(new Set(chars));
        for (let char of chars) {
            if (char[1] == "0") {
                outText = outText.replaceAll(char, Object.keys(outTable)[Object.values(outTable).indexOf(char[0])]);
            } else {
                if (Object.values(outTable).includes(char)) {
                    outText = outText.replaceAll(char, Object.keys(outTable)[Object.values(outTable).indexOf(char)]);
                } else {
                    outText = outText.replaceAll(char, Object.keys(outTable)[Object.values(outTable).indexOf(clearUnicode(char))]);
                }
            }
        }
    }
    return outText;
}

function clearUnicode(inText) {
    let outText = inText;
    outText = outText.replaceAll("\u2800", " "); // Replace Braille pattern blank with ASCII space
    outText = outText.replaceAll(/[0A-Z]/g, ""); // Remove virtual dots
    // Replace characters containing lowered dots with corresponding characters without them
    let loweredDots = outText.match(/[\u2840-\u28FF]/g);
    loweredDots = Array.from(new Set(loweredDots));
    for (let char of loweredDots) {
        let number = char.charCodeAt(0) - 10240;
        if (number < 128) {
            outText = outText.replaceAll(char, String.fromCharCode(10240 + number - 64));
        } else if (number < 192) {
            outText = outText.replaceAll(char, String.fromCharCode(10240 + number - 128));
        } else {
            outText = outText.replaceAll(char, String.fromCharCode(10240 + number - 192));
        }
    }
    return outText;
}

module.exports = convert;
