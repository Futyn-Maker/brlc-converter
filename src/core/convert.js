const jschardet = require("jschardet");
const iconv = require("iconv-lite");
iconv.skipDecodeWarning = true; // This is because we have to use decoding from a binary string in the browser version

/**
 * Strips dots 7 and 8 from 8-dot braille characters.
 * @param {string} inText - Text containing braille patterns.
 * @returns {string} - Text with 8-dot patterns converted to 6-dot.
 */
function stripLoweredDots(inText) {
  let outText = inText;
  // Find all unique characters with lowered dots (dots 7 and/or 8)
  let loweredDots = outText.match(/[\u2840-\u28FF]/g);
  if (!loweredDots) return outText;

  loweredDots = Array.from(new Set(loweredDots));

  for (let char of loweredDots) {
    let number = char.charCodeAt(0) - 10240;
    let replacementNumber;
    if (number < 128) {
      replacementNumber = number - 64; // Dot 7
    } else if (number < 192) {
      replacementNumber = number - 128; // Dot 8
    } else {
      replacementNumber = number - 192; // Dots 7 and 8
    }
    outText = outText.replaceAll(char, String.fromCharCode(10240 + replacementNumber));
  }
  return outText;
}

/**
 * Cleans intermediate Unicode text.
 * This removes virtual dots (A-Z) and optionally strips dots 7/8.
 * @param {string} inText - The intermediate text to clean.
 * @param {boolean} isSource8dot - Whether the source encoding was 8-dot.
 * @param {boolean} force6dot - User flag to force 6-dot output.
 * @returns {string} - Cleaned Unicode text.
 */
function clearUnicode(inText, isSource8dot, force6dot) {
  let outText = inText;
  outText = outText.replaceAll("\u2800", " "); // Replace Braille pattern blank with ASCII space
  outText = outText.replaceAll(/[0A-Z]/g, ""); // Remove virtual dots (A-Z)

  // Conditionally strip dots 7 and 8
  if (!isSource8dot || force6dot) {
    outText = stripLoweredDots(outText);
  }
  return outText;
}

/**
 * Converts text from some encoding to an intermediate Unicode representation.
 * @param {Object} inTable - The character mapping for the source encoding.
 * @param {string} inText - The source text.
 * @returns {string} - Intermediate Unicode text with virtual dots.
 */
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
    // Append '0' to simple 1-to-1 mappings to distinguish them
    if (inTable[char].length == 1 && inTable[char].charCodeAt(0) <= 10303) {
      outText = outText.replaceAll(char, inTable[char] + "0");
    } else {
      outText = outText.replaceAll(char, inTable[char]);
    }
  }
  return outText;
}

/**
 * Converts text from Unicode (clean or intermediate) to some encoding.
 * @param {Object} outTable - The character mapping for the target encoding.
 * @param {string} inText - The source Unicode text.
 * @param {boolean} isClean - True if source is clean Unicode, false if intermediate.
 * @returns {string} - Text in the target encoding.
 */
function fromUnicode(outTable, inText, isClean = true) {
  let outText = inText;

  // Build a reverse map (value: key) for efficient lookups
  const reverseOutTable = {};
  for (const key in outTable) {
    reverseOutTable[outTable[key]] = key;
  }

  if (isClean) {
    // Converting from clean, user-supplied Unicode
    outText = outText.replaceAll("\u2800", " ");
    let brailleChars = outText.match(/[\u2801-\u28FF]/g);
    if (!brailleChars) return outText;

    brailleChars = Array.from(new Set(brailleChars));

    for (let char of brailleChars) {
      if (reverseOutTable[char]) {
        // Direct 8-dot or 6-dot match
        outText = outText.replaceAll(char, reverseOutTable[char]);
      } else {
        // No direct match, check for 6-dot equivalent
        let sixDotEquiv = stripLoweredDots(char);
        if (char !== sixDotEquiv && reverseOutTable[sixDotEquiv]) {
          // 8-dot char has a 6-dot mapping
          outText = outText.replaceAll(char, reverseOutTable[sixDotEquiv]);
        }
        // If no 6-dot match, the character is left as-is
      }
    }
  } else {
    // Converting from intermediate Unicode (legacy-to-legacy)
    let chars = outText.match(/[\u2801-\u28FF][0A-Z]?/g);
    if (!chars) return outText;

    chars = Array.from(new Set(chars));

    for (let charWithVirtual of chars) {
      const baseChar = charWithVirtual[0];
      const hasVirtual = charWithVirtual.length > 1;
      const virtualDot = hasVirtual ? charWithVirtual[1] : "";

      const sixDotEquiv = stripLoweredDots(baseChar);
      const is8dotChar = baseChar !== sixDotEquiv;

      let replacementKey = null;

      // Priority 1: Check for full match (e.g., ⣁A)
      replacementKey = reverseOutTable[charWithVirtual];

      // Priority 2: Check for base match if virtual dot exists (e.g., ⣁)
      if (!replacementKey && hasVirtual) {
        replacementKey = reverseOutTable[baseChar];
      }

      // Priority 3: Check for 6-dot equivalent with virtual dot (e.g., ⠁A)
      if (!replacementKey && is8dotChar) {
        replacementKey = reverseOutTable[sixDotEquiv + virtualDot];
      }

      // Priority 4: Check for 6-dot equivalent without virtual dot (e.g., ⠁)
      if (!replacementKey && is8dotChar) {
        replacementKey = reverseOutTable[sixDotEquiv];
      }

      // Perform replacement or strip virtual dot
      if (replacementKey) {
        outText = outText.replaceAll(charWithVirtual, replacementKey);
      } else if (hasVirtual) {
        // No match found, strip virtual dot but keep base char (8-dot or 6-dot)
        outText = outText.replaceAll(charWithVirtual, baseChar);
      }
    }
  }
  return outText;
}

/**
 * Main conversion function.
 * @param {Object|string} inMap - Source format map or "unicode".
 * @param {Object|string} outMap - Target format map or "unicode".
 * @param {Buffer} inText - Input file content as a buffer.
 * @param {boolean} [force6dot=false] - Optional flag to force 6-dot Unicode output.
 * @returns {Buffer} - Output file content as a buffer.
 */
function convert(inMap, outMap, inText, force6dot = false) {
  let encoding = jschardet.detect(inText).encoding;
  inText = iconv.decode(inText, encoding);

  let outText = inText;
  const isSource8dot = inMap.8dots || false;

  if (inMap == "unicode" && outMap == "unicode") {
    outText = outText.replaceAll("\u2800", " ");
    if (force6dot) {
      outText = stripLoweredDots(outText);
    }
    encoding = "utf-8";
  } else if (inMap == "unicode") {
    // From clean Unicode
    outText = outText.replaceAll("\u2800", " "); // Clean space before mapping
    outText = fromUnicode(outMap.characters, outText, true);
    encoding = outMap.encoding;
  } else if (outMap == "unicode") {
    // To Unicode
    outText = toUnicode(inMap.characters, outText);
    outText = clearUnicode(outText, isSource8dot, force6dot);
    encoding = "utf-8";
  } else {
    // Legacy-to-Legacy
    outText = toUnicode(inMap.characters, outText);
    outText = fromUnicode(outMap.characters, outText, false);
    encoding = outMap.encoding;
  }

  outText = iconv.encode(outText, encoding);
  return outText;
}

module.exports = convert;
