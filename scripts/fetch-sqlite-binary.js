// Fetches the better-sqlite3 binary built for THIS Electron.
//
// A native module is compiled against one runtime. Everything that opens
// the database — the app, the MCP server, the verification harnesses —
// must therefore run under Electron, and must share one binary built for
// Electron's ABI (128 for Electron 32). The Stop hook already sets that
// precedent by running notify.js under Electron.
//
// This is a script rather than a postinstall hook because npm 11 blocks
// lifecycle scripts unless the package is listed in `allowScripts`, and a
// silent no-op there would leave an unloadable binary behind. Run it
// explicitly, and it tells you what it did.
//
//   node scripts/fetch-sqlite-binary.js
//
// better-sqlite3 v13 stopped publishing Electron prebuilds. v12.2.0 is
// pinned for that reason — check before upgrading.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PKG = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const BINARY = path.join(PKG, 'build', 'Release', 'better_sqlite3.node');

function electronVersion() {
  const p = require(path.join(__dirname, '..', 'package.json'));
  return String(p.devDependencies.electron || '').replace(/^[^0-9]*/, '');
}

if (!fs.existsSync(PKG)) {
  console.error('  better-sqlite3 is not installed. Run npm install first.');
  process.exit(1);
}

const target = electronVersion();
console.log(`  fetching better-sqlite3 binary for Electron ${target} (win32 x64)`);

// npm hoists prebuild-install to the root, but it can also sit nested.
// Look in both before falling back to npx, which re-downloads it.
const candidates = [
  path.join(__dirname, '..', 'node_modules', 'prebuild-install', 'bin.js'),
  path.join(PKG, 'node_modules', 'prebuild-install', 'bin.js')
];
const runner = candidates.find((p) => fs.existsSync(p));

const args = ['--runtime=electron', `--target=${target}`, '--arch=x64', '--platform=win32'];

if (runner) {
  execFileSync(process.execPath, [runner, ...args], { cwd: PKG, stdio: 'inherit' });
} else {
  execFileSync('npx', ['--yes', 'prebuild-install', ...args],
    { cwd: PKG, stdio: 'inherit', shell: true });
}

if (!fs.existsSync(BINARY)) {
  console.error('\n  FAILED — no binary at build/Release/better_sqlite3.node');
  console.error('  Check that a prebuild exists for this Electron version.');
  process.exit(1);
}

const kb = Math.round(fs.statSync(BINARY).size / 1024);
console.log(`\n  binary in place (${kb} KB) — built for Electron, not for node.`);
console.log('  Anything opening the database must run under Electron.');
