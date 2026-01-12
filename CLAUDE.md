# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Braille Encoding Converter (brlc-converter) converts braille files between different braille encodings. Supported formats: Unicode (8-dot), BRF/Braille ASCII (6-dot), Eurobraille (8-dot), NABCC (8-dot), and Russian encodings (Logos, CHTENIE, GOST - all 6-dot).

## Commands

```bash
# Run CLI directly
node src/cli/cli.js -i file.brf -f brf -t unicode

# Run local web server (requires dist/ to exist)
npm start

# Build static web version (outputs to /dist)
npm run build:web

# Build single executable application (outputs to /bin)
npm run build:sea

# Build both web and SEA
npm run build
```

**Requires Node.js v21 or newer.**

## Architecture

### Core Components

- [src/core/convert.js](src/core/convert.js) - Core conversion logic with intermediate Unicode representation
- [src/cli/cli.js](src/cli/cli.js) - CLI and local web server. Uses `node:sea` module to detect Single Executable mode
- [src/web/main.js](src/web/main.js) - Browser-side code using `window.brlcData` and `window.brlcLocales`, handles language switching
- [src/web/index.html](src/web/index.html) - Web interface with header containing language selector

### Conversion Algorithm

The `convert()` function in [convert.js](src/core/convert.js) handles four conversion paths:

1. **Unicode → Unicode**: Pass through, optionally strip dots 7/8 if `force6dot` is set
2. **Unicode → Legacy**: Direct lookup in reverse character map with 6-dot fallback
3. **Legacy → Unicode**: Convert via `toUnicode()`, then clean with `clearUnicode()`
4. **Legacy → Legacy**: Convert to intermediate Unicode, then to target encoding

**Conversion steps (Legacy → Legacy):**

1. Auto-detect input file encoding using `jschardet`, decode with `iconv-lite`
2. `toUnicode()`: Replace source characters with Unicode braille patterns + virtual dot markers
3. `fromUnicode()`: Look up each braille pattern (with marker) in target encoding's reverse map
4. Encode output to target encoding

**6-dot fallback logic** (`fromUnicode`, priority order):
1. Full match with virtual dot (e.g., `⣁A`)
2. Base braille character without virtual dot (e.g., `⣁`)
3. 6-dot equivalent with virtual dot (e.g., `⠁A`) - strips dots 7/8 from the pattern
4. 6-dot equivalent without virtual dot (e.g., `⠁`)

**Virtual dots concept:**

Virtual dots are letter markers (A-Z) or "0" appended to braille characters during conversion. They solve the problem of multiple source characters mapping to the same braille pattern.

Example: In Logos encoding, both `#` and `н` map to `⠝`. When converting Logos → another format:
- `#` becomes `⠝A` (with virtual dot A)
- `н` becomes `⠝0` (with virtual dot 0, for simple 1-to-1 mappings)

This allows the reverse lookup to distinguish them and find the correct target character. Virtual dots are stripped when outputting to Unicode.

### Data Files Structure

Encoding mappings in `data/*.json`:

```json
{
  "encoding": "CP866",       // iconv-lite encoding name for output
  "format": "txt",           // File extension for converted files
  "8dots": false,            // true if encoding uses dots 7/8
  "characters": {
    "А": "⡁",               // Simple: source char → Unicode braille
    "#": "⠝A",              // With virtual dot: distinguishes from other chars mapping to ⠝
    "1": "⠁B"               // Different virtual dot for digits
  }
}
```

**Characters object:**
- Keys: Characters in the source encoding (ASCII, Cyrillic, etc.)
- Values: Unicode braille pattern (U+2800-U+28FF), optionally followed by a virtual dot letter (A-Z)
- Multiple source characters can map to the same braille pattern if they use different virtual dots
- 8-dot patterns use U+2840-U+28FF range (dots 7 and/or 8 set)

### Build System

[build.js](build.js) bundles the application:
- `build:web` - Uses browserify to bundle convert.js, inlines data/*.json into data.js, inlines locales into locales.js
- `build:sea` - Additionally bundles CLI with esbuild and creates a Node.js Single Executable Application

## Adding New Localizations

1. Create folder `locales/{lang_code}/` (e.g., `locales/fr/`)
2. Copy `locales/en/translation.json` to the new folder
3. Translate all string values (keep the keys unchanged)
4. Set `language_name` to the language name in its native form (e.g., "Français" for French)
5. Set `language_selector_label` to the word "Language" in the target language
6. Rebuild: `npm run build:web`

**Required translation keys for language selector:**
- `language_name` - The language name in its native form (shown in the language menu)
- `language_selector_label` - The word "Language" (used for the selector button and aria-label)

The web UI auto-detects browser language via i18next. Users can also manually select a language from the header dropdown menu.

## Adding New Braille Encodings

1. Create `data/{encoding_name}.json` with the structure:
   ```json
   {
     "encoding": "utf-8",
     "format": "brf",
     "8dots": false,
     "characters": { ... }
   }
   ```

2. Fill `characters` with source character → braille Unicode mappings
   - Use virtual dots (append A-Z) if multiple characters share the same braille pattern
   - Use 8-dot Unicode patterns (U+2840+) for encodings with dots 7/8

3. Add translation keys for the new format in all `locales/*/translation.json`:
   ```json
   "opt_{encoding_name}_1": "Format Name (for source dropdown)",
   "opt_{encoding_name}_2": "Format Name (for target dropdown)"
   ```

4. Add options to both `<select>` elements in [src/web/index.html](src/web/index.html):
   ```html
   <option value="{encoding_name}" id="opt-{encoding_name}-1">Format Name</option>
   ```

5. Rebuild: `npm run build`
