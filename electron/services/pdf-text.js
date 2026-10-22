// Text out of a PDF.
//
// The app already stores their documents; this is what lets a panel read one
// instead of asking them to type what the paper already says. Nothing here
// writes, downloads or phones anywhere — it opens a file they attached and
// pulls the words out.
//
// There are two readers in this file, tried in that order:
//
// 1. **pdf.js**, trimmed to two files in `electron/vendor/pdfjs`. It
//    follows cross-reference tables, object streams and font encodings,
//    which is what the hand-written one below cannot do.
// 2. **The hand-written one**, kept as a fallback. It inflates every
//    content stream and reads the strings back out of the drawing
//    operators: `(some text) Tj` and `[(kerned) -20 (text)] TJ`.
//
// Why both: measured against a real set of sixteen documents, pdf.js read
// four that the hand-written one returned nothing for — one of them over
// 12,000 characters. On one document the hand-written reader returned
// *more*, which was repetition rather than more information, but it costs
// nothing to keep as a second try and it means a failure inside pdf.js
// cannot take document reading down with it.
//
// Scans — photographs of paper — have no text, and both readers correctly
// return nothing. That is said plainly rather than guessed at. Reading
// those needs OCR (ocr.js), which is not this file's job.
//
// Write this file with an editor, never a shell heredoc — the escapes in
// these patterns do not survive one.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

/** Undoes PDF string escapes: \( \) \\ and octal \053. */
function unescapePdf(text) {
  return text
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1');
}

/**
 * The strings a content stream actually draws, in order.
 *
 * Matching the operators rather than every parenthesis matters: a stream
 * is full of coordinates and font names, and treating those as text is how
 * a page of words comes back as gibberish.
 */
function drawnText(stream) {
  const out = [];
  // Written in the "unrolled" form — a run of ordinary characters, then
  // any escape, repeated — rather than the obvious (?:\\.|[^\\()])* .
  // The obvious version backtracks exponentially on a stream that is
  // actually image data, and hangs the app rather than failing. That is
  // what a scanned page in their formation paperwork did.
  const show = /\(([^()\\]*(?:\\[\s\S][^()\\]*)*)\)\s*Tj|\[([^\][]{0,4000}?)\]\s*TJ/g;
  let m = show.exec(stream);

  while (m) {
    if (m[1] !== undefined) {
      out.push(unescapePdf(m[1]));
    } else {
      // A TJ array interleaves strings with kerning numbers. The numbers
      // are spacing, and a large negative one is usually a space.
      const parts = m[2].match(/\([^()\\]*(?:\\[\s\S][^()\\]*)*\)|-?\d+(?:\.\d+)?/g) || [];
      let line = '';
      parts.forEach((p) => {
        if (p.startsWith('(')) line += unescapePdf(p.slice(1, -1));
        else if (Number(p) < -180) line += ' ';
      });
      out.push(line);
    }
    m = show.exec(stream);
  }

  return out.join('\n');
}

/**
 * Is this stream words, or a picture?
 *
 * An inflated image is megabytes of bytes that are not text, and running
 * text patterns over it wastes time at best. A page of words is almost
 * entirely printable.
 */
function looksLikeText(stream) {
  const sample = stream.slice(0, 4096);
  if (!sample) return false;
  let printable = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable += 1;
  }
  return printable / sample.length > 0.8;
}

/** Every stream in the file, inflated where it is compressed. */
function streams(buffer) {
  const raw = buffer.toString('latin1');
  const found = [];
  const re = /stream\r?\n?([\s\S]*?)endstream/g;
  let m = re.exec(raw);

  while (m) {
    const chunk = Buffer.from(m[1], 'latin1');
    try {
      found.push(zlib.inflateSync(chunk).toString('latin1'));
    } catch (e) {
      // Not deflated, or deflated in a way this cannot read. The plain
      // bytes are still worth looking at.
      found.push(chunk.toString('latin1'));
    }
    m = re.exec(raw);
  }

  return found;
}

/** The hand-written reader: what it can find, or '' when it finds none. */
function extractByHand(filePath) {
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (e) {
    return '';
  }
  if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') return '';

  return streams(buffer)
    .filter(looksLikeText)
    .map(drawnText)
    .filter(Boolean)
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/* ---------------------------------------------------------------- pdf.js */

// A page count high enough for anything they attach, and low enough that a
// malformed file cannot spin forever. A document longer than this reads up
// to here and says so.
const MAX_PAGES = 200;

/**
 * Where the vendored reader really is.
 *
 * Packaged, `electron/` lives inside `app.asar`, and a JavaScript module
 * cannot be imported out of an archive — hence the `asarUnpack` entry in
 * package.json putting these two files on disk beside it. This rewrites
 * the path to match. Unpackaged, there is no `app.asar` in it and the
 * path is already right.
 */
function vendorUrl() {
  const file = path.join(__dirname, '..', 'vendor', 'pdfjs', 'pdf.min.mjs');
  const unpacked = file.replace(
    'app.asar' + path.sep,
    'app.asar.unpacked' + path.sep
  );
  return pathToFileURL(unpacked).href;
}

// Loaded once and reused. It is a 365 KB module; importing it per document
// would be paid on every read.
let readerPromise = null;
function reader() {
  if (!readerPromise) {
    readerPromise = import(vendorUrl()).catch((e) => {
      // Let the next call try again rather than caching the failure
      // forever, and fall through to the hand-written reader meanwhile.
      readerPromise = null;
      throw e;
    });
  }
  return readerPromise;
}

async function extractWithPdfjs(filePath) {
  const pdfjs = await reader();

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(filePath)),
    useSystemFonts: true,
    // Nothing in a document they were mailed gets to run as code.
    isEvalSupported: false,
    // Errors only. The character maps and standard font data were left out
    // of the vendored copy on purpose, so pdf.js warns about a missing font
    // file on documents that name one — expected, harmless to the text, and
    // three lines of it per read drowns the log. Real errors still print.
    verbosity: 0
  }).promise;

  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const out = [];
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      out.push(content.items.map((i) => i.str).join(' '));
      page.cleanup();
    }
    if (doc.numPages > pages) {
      out.push('…' + (doc.numPages - pages) + ' more pages not read');
    }
    return out.join('\n').replace(/[ \t]+/g, ' ').trim();
  } finally {
    await doc.destroy();
  }
}

/**
 * All readable text in a PDF, or '' when there is genuinely none.
 *
 * Asynchronous because pdf.js is. Callers await it.
 */
async function extract(filePath) {
  try {
    const text = await extractWithPdfjs(filePath);
    if (text) return text;
  } catch (e) {
    // A reader that throws is not the same as a document with no words in
    // it, and the difference decides whether the fallback is worth trying.
    console.error('pdf.js could not read ' + filePath + ': ' + e.message);
  }
  return extractByHand(filePath);
}

module.exports = { extract, extractByHand, drawnText };
