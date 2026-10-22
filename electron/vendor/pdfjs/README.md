# pdf.js, trimmed

Mozilla's PDF reader, **version 4.6.82**, from the npm package
`pdfjs-dist` — but only the two files that are actually needed, copied in
by hand rather than installed.

## Why it is here at all

The reader written from scratch in `electron/services/pdf-text.js` reads
simple PDFs and misses the rest. Tested against a set of real-world
documents, it returned **nothing** for several that have real text inside
(longer transcripts, policies, agreements). pdf.js reads them all.

Documents that are genuine photographs or scans have no text inside, and
no text reader of any kind will get words out of those. They need OCR,
which is a separate job (`electron/vendor/ocr/`).

## Why copied in rather than installed

Installing `pdfjs-dist` the normal way adds about 36 MB to every build:
source maps, character maps, a whole web viewer, image decoders. None of
that is used here. These two files are 1.7 MB together.

| File | From | Note |
|---|---|---|
| `pdf.min.mjs` | `legacy/build/pdf.min.mjs` | The reader |
| `pdf.worker.mjs` | `legacy/build/pdf.worker.min.mjs` | **Renamed.** `pdf.min.mjs` imports `./pdf.worker.mjs` by that exact name, so the minified worker has to wear it |

The `legacy` build is the one that runs outside a browser.

## What was deliberately left out

The character maps (`cmaps`) and the standard font data. They matter for
documents in scripts like Chinese or Japanese, and for a few unusual font
encodings. Ordinary English paperwork reads correctly without them. If a
document ever comes back with partial or garbled text, missing cmaps is
the first thing to check.

## Updating

Download the same files from a newer `pdfjs-dist`, keeping the rename
above, then check a few attached documents and make sure none reads
*worse* than before. Nothing else in the app touches these files directly
— `pdf-text.js` is the only door in.

## Packaging

`electron/**/*` already puts these in the build, but they are also listed
in `asarUnpack` in `package.json`. That is load-bearing: a JavaScript
module cannot be imported from inside the asar archive, so these two have
to sit on disk next to it.
