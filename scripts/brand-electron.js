// Puts the Command Center mark on the development copy of Electron.
//
// Verification runs and `npm run dev` launch node_modules/electron
// directly, and a raw Electron window carries Electron's own logo — a
// blue galaxy that appears in the taskbar beside the real app every time
// the project is built or driven. It looks like the app reverting to an
// old icon. It is not; it is a second program.
//
// The packaged app is unaffected either way — after-pack.js already
// stamps the same icon onto the shipped executable.
//
// Runs on postinstall, because npm restores the stock binary whenever
// dependencies are reinstalled. Safe to run at any time, and a no-op if
// Electron is missing or currently running.

const fs = require('fs');
const os = require('os');
const path = require('path');

const EXE = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const ICON = path.join(__dirname, '..', 'build', 'icon.ico');

async function main() {
  if (process.platform !== 'win32') return;
  if (!fs.existsSync(EXE)) {
    console.log('  • electron not installed, nothing to brand');
    return;
  }
  if (!fs.existsSync(ICON)) {
    console.log('  • build/icon.ico missing, nothing to brand');
    return;
  }

  const { rcedit } = require('rcedit');

  // rcedit rewrites in place, and something on this machine refuses that
  // for executables sitting in node_modules — it fails with "Unable to
  // commit changes" while the very same edit succeeds on a copy in temp.
  // So: stamp a copy, then move it into place. The move is also safer,
  // since a half-written 178MB binary would break every dev run.
  const staged = path.join(os.tmpdir(), `electron-branded-${process.pid}.exe`);
  try {
    fs.copyFileSync(EXE, staged);
    await rcedit(staged, {
      icon: ICON,
      'version-string': {
        ProductName: 'Command Center (dev)',
        FileDescription: 'Command Center — development runtime'
      }
    });
    fs.rmSync(EXE, { force: true });
    fs.renameSync(staged, EXE);
    console.log(`  • dev Electron branded  file=${EXE}`);
  } catch (e) {
    // An open Electron window will hold the file. Not worth failing an
    // install over — the next run picks it up.
    if (fs.existsSync(staged)) fs.rmSync(staged, { force: true });
    console.log(`  • could not brand dev Electron (${e.message.split('\n')[0]})`);
  }
}

main();
