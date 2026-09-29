const jschardet = require("jschardet");
const iconv = require("iconv-lite");
iconv.skipDecodeWarning = true; // This is because we have to use decoding from a binary string in the browser version

/**
 * Encoding names jschardet may report that iconv-lite only knows under another name.
 */
const ENCODING_ALIASES = {
  "utf-8-sig": "utf-8", // UTF-8 with a byte order mark, which iconv-lite strips by itself
  "x-mac-cyrillic": "maccyrillic",
};

/**
 * How many of jschardet's guesses (best first) are tried. The rest are too unlikely to be
 * worth decoding the whole file for.
 */
const MAX_GUESSES = 10;

/**
 * Weight of jschardet's confidence when candidate encodings are compared, expressed as a
 * number of unknown characters: a candidate jschardet did not suggest at all is penalized as
 * if this share of the file's non-ASCII bytes had decoded to unknown characters (and never
 * less than MIN_CONFIDENCE_WEIGHT characters). A guess with confidence c relative to the best
 * guess gets (1 - c) times that penalty, so jschardet's best guess is kept unless another
 * encoding fits the source format clearly better.
 */
const CONFIDENCE_WEIGHT_RATIO = 0.1;
const MIN_CONFIDENCE_WEIGHT = 2;

/**
 * Counts bytes >= 0x80 in a Buffer or in a binary string (one character per byte).
 * @param {Buffer|string} input - Raw file content.
 * @returns {number} - Number of non-ASCII bytes.
 */
function countHighBytes(input) {
  let count = 0;
  if (typeof input === "string") {
    for (let i = 0; i < input.length; i++) {
      if (input.charCodeAt(i) > 0x7f) count++;
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      if (input[i] > 0x7f) count++;
    }
  }
  return count;
}

/**
 * Builds a predicate telling whether a character may occur in a file of the given source format.
 * @param {Object|string} inMap - Source format map or "unicode".
 * @returns {function(string): boolean} - The predicate.
 */
function alphabetOf(inMap) {
  if (inMap === "unicode") {
    return (ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x2800 && code <= 0x28ff; // Unicode braille patterns
    };
  }
  const chars = new Set(Object.keys(inMap.characters));
  return (ch) => chars.has(ch);
}

/**
 * Counts the non-ASCII characters of a decoded text that the source format does not define.
 * ASCII is ignored because every candidate encoding decodes it the same way. U+FFFD always
 * counts, because it means the bytes were invalid for the encoding.
 * @param {string} text - Decoded text.
 * @param {function(string): boolean} isKnown - Alphabet predicate from alphabetOf().
 * @returns {number} - Number of unknown characters.
 */
function countUnknownChars(text, isKnown) {
  let unknown = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) continue;
    if (code === 0xfffd || !isKnown(text[i])) unknown++;
  }
  return unknown;
}

/**
 * Returns jschardet's guesses for the input, best first, with confidences relative to the
 * best guess (which gets 1). jschardet's absolute confidences are on an arbitrary scale that
 * differs between encodings and versions, so only their ranking is used.
 * @param {Buffer|string} inText - Input file content as a Buffer or a binary string.
 * @returns {Array<{encoding: string, confidence: number}>} - Guesses, best first.
 */
function jschardetGuesses(inText) {
  const guesses = jschardet
    .detectAll(inText, { minimumThreshold: 0 })
    .filter((guess) => guess.encoding && guess.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_GUESSES);
  const top = guesses.length ? guesses[0].confidence : 1;
  return guesses.map((guess) => ({
    encoding: guess.encoding,
    confidence: guess.confidence / top,
  }));
}

/**
 * Chooses the encoding used to decode an input file.
 *
 * Files of a format are not always stored in the encoding the format was designed for, so the
 * encoding has to be detected, but a statistical detector alone is not reliable for braille
 * files: its language models expect natural-language text, so related code pages get
 * confused and 8-dot data may be taken for an unrelated script, and it may name encodings
 * iconv-lite cannot decode. The source format, on the other hand, defines exactly which
 * characters a file may contain, so that alphabet is the judge:
 *
 * 1. A file without bytes >= 0x80 decodes identically in every ASCII-compatible encoding and
 *    needs no detection at all.
 * 2. Otherwise the candidates are jschardet's best guesses, the encoding declared by the
 *    source format, UTF-8 and ISO-8859-1. A detector reports Windows-1252 rather than
 *    ISO-8859-1, although the two differ in the 0x80-0x9F range that the 8-dot tables map to
 *    cells, so ISO-8859-1 always shares the confidence of a Windows-1252 guess.
 * 3. Each candidate is scored by the number of decoded characters the format does not define,
 *    plus a penalty for jschardet's lack of confidence in it (see CONFIDENCE_WEIGHT_RATIO).
 *    The lowest score wins; ties go to the candidate jschardet ranked higher.
 *
 * @param {Buffer|string} inText - Input file content as a Buffer or a binary string.
 * @param {Object|string} inMap - Source format map or "unicode".
 * @returns {string} - An encoding name accepted by iconv-lite.
 */
function detectEncoding(inText, inMap) {
  const highBytes = countHighBytes(inText);
  if (highBytes === 0) return "utf-8";

  const candidates = [];
  const seen = new Set();
  function addCandidate(name, confidence) {
    if (!name) return;
    name = ENCODING_ALIASES[name.toLowerCase()] || name;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key) || !iconv.encodingExists(name)) return;
    seen.add(key);
    candidates.push({ name, confidence });
  }
  for (const guess of jschardetGuesses(inText)) {
    addCandidate(guess.encoding, guess.confidence);
    if (guess.encoding.toLowerCase() === "windows-1252") {
      addCandidate("ISO-8859-1", guess.confidence);
    }
  }
  if (inMap !== "unicode") addCandidate(inMap.encoding, 0);
  addCandidate("utf-8", 0);
  addCandidate("ISO-8859-1", 0);
  candidates.sort((a, b) => b.confidence - a.confidence); // Stable: ties keep the order above

  const isKnown = alphabetOf(inMap);
  const weight = Math.max(
    MIN_CONFIDENCE_WEIGHT,
    highBytes * CONFIDENCE_WEIGHT_RATIO,
  );
  let best = candidates[0].name;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const penalty = (1 - candidate.confidence) * weight;
    if (penalty >= bestScore) break; // No later candidate can score lower
    const unknown = countUnknownChars(
      iconv.decode(inText, candidate.name),
      isKnown,
    );
    if (unknown + penalty < bestScore) {
      best = candidate.name;
      bestScore = unknown + penalty;
    }
  }
  return best;
}

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
    outText = outText.replaceAll(
      char,
      String.fromCharCode(10240 + replacementNumber),
    );
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
  // Make a shallow copy to avoid mutating the original table
  const table = { ...inTable };
  let outText = inText;
  // At first, we need to replace letters A-Z, as they're used as a virtual braille dots
  for (let char of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (char in table) {
      outText = outText.replaceAll(char, table[char]);
      delete table[char];
    }
  }
  // Now we can replace other characters
  for (let char in table) {
    // Append '0' to simple 1-to-1 mappings to distinguish them
    if (table[char].length == 1 && table[char].charCodeAt(0) <= 10303) {
      outText = outText.replaceAll(char, table[char] + "0");
    } else {
      outText = outText.replaceAll(char, table[char]);
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
    const value = outTable[key];
    if (!reverseOutTable[value]) {
      reverseOutTable[value] = key;
    }
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
 * @param {Buffer|string} inText - Input file content as a buffer or a binary string.
 * @param {boolean} [force6dot=false] - Optional flag to force 6-dot Unicode output.
 * @returns {Buffer} - Output file content as a buffer.
 */
function convert(inMap, outMap, inText, force6dot = false) {
  let encoding = detectEncoding(inText, inMap);
  inText = iconv.decode(inText, encoding);

  let outText = inText;
  const isSource8dot = inMap === "unicode" ? true : inMap["8dots"] || false;

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

convert.detectEncoding = detectEncoding;

module.exports = convert;
