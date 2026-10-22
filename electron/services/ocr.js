// Reading the words off a scanned document.
//
// Many important papers are scans — photographs of paper saved as PDFs. A
// text reader gets nothing out of those, because there is no text in them:
// there is a picture of text. OCR is what turns one into the other.
//
// **Windows does all of it.** `Windows.Data.Pdf` renders the page and
// `Windows.Media.Ocr` reads it, both shipped with Windows, both running on
// this machine. Nothing is installed, there is no account, no key, no bill,
// and no document is uploaded to anybody to be read. Needs the English OCR
// language, which Windows installs with English.
//
// It is one PowerShell process and nothing else, which is the second
// version of this file. The first had Chromium render each page to a PNG
// through the vendored pdf.js and handed those to Windows. Every piece of
// that worked on its own and the whole thing hung inside the app: with a
// BrowserWindow alive in the main process, `powershell -Command "'hello'"`
// never returned either. Rather than work around a wedged window, the
// window went — and the temp PNGs with it.

const { spawn } = require('child_process');
const path = require('path');

// Measured on a dense one-page form by rendering it at several sizes and
// counting what came back: 720px across gave 1,237 characters of largely
// garbled text, 2,000px gave 3,891, 3,500px gave 3,991. The useful range
// ends around here and going wider only costs memory.
const WIDTH = 2400;

// A cap, not a judgement: each page costs about a second, and a long scan
// would otherwise hold up attaching a file. Anything past this is left
// unread and says so in the text.
const MAX_PAGES = 15;

// Generous, because it is a backstop rather than a schedule — a typical
// scan reads in about a second. It exists so a stuck page can never leave
// the app waiting forever.
const TIMEOUT_MS = 3 * 60 * 1000;

function scriptPath() {
  const file = path.join(__dirname, '..', 'vendor', 'ocr', 'ocr-pdf.ps1');
  // Packaged, this sits outside the asar: PowerShell cannot read a script
  // out of the archive. The asarUnpack entry in package.json is what puts
  // it on disk, and this is what finds it there.
  return file.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

function available() {
  return process.platform === 'win32';
}

/**
 * All the text OCR can find in a scanned PDF.
 *
 * Returns '' when there was genuinely nothing to read, and throws when the
 * reading itself failed. The caller has to tell those apart: one is a blank
 * page, the other is a broken tool, and they must not look the same.
 */
function extract(filePath) {
  if (!available()) return Promise.resolve('');

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      // -STA because the WinRT imaging calls want a single-threaded
      // apartment and a child of Electron does not get one by default.
      //
      // stdin ignored because nothing is ever fed to this script, and a
      // child left holding an open input is a child that can hang.
      ['-STA', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath(),
        '-Path', path.resolve(filePath),
        '-MaxPages', String(MAX_PAGES),
        '-Width', String(WIDTH)],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let out = '';
    let err = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      fn(value);
    };

    const guard = setTimeout(() => {
      child.kill();
      finish(reject, new Error('timed out reading the document'));
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish(reject, e));

    child.on('close', (code) => {
      if (code !== 0) {
        const first = String(err || '').trim().split('\n')[0] || ('exit code ' + code);
        return finish(reject, new Error(first));
      }
      finish(resolve, String(out || '').trim());
    });
  });
}

module.exports = { extract, available, WIDTH, MAX_PAGES };
