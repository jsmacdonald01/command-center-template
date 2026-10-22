// Publishes a new version for everyone using the template.
//
//   npm run release                 next small version (1.0.0 -> 1.0.1)
//   npm run release -- minor        bigger change      (1.0.1 -> 1.1.0)
//   npm run release -- 2.0.0        an exact version
//   npm run release -- --notes "What changed"
//
// Builds the installer, puts it on GitHub as a release, and commits the new
// version number. Installed copies find it on their own (see
// electron/services/updater.js) and show "A new version is ready".
// Needs the GitHub CLI (gh), signed in to the account that owns the repo.
// Their data is never part of a release: it lives in their data folder.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkgFile = path.join(ROOT, 'package.json');

function run(cmd) {
  console.log('> ' + cmd);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function bump(version, how) {
  if (/^\d+\.\d+\.\d+$/.test(how || '')) return how;
  const [major, minor, patch] = version.split('.').map(Number);
  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const args = process.argv.slice(2);
const notesAt = args.indexOf('--notes');
const notes = notesAt >= 0 ? args[notesAt + 1] : '';
const how = args.find((a, i) => !a.startsWith('--') && i !== notesAt + 1);

const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const publish = pkg.build && pkg.build.publish;
if (!publish || !publish.owner || !publish.repo) {
  console.error('package.json has no build.publish owner/repo — nowhere to publish to.');
  process.exit(1);
}

const next = bump(pkg.version, how);
console.log(`Releasing ${pkg.version} -> ${next} to ${publish.owner}/${publish.repo}`);

pkg.version = next;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
run(`npm version ${next} --no-git-tag-version --allow-same-version`);

run('npm run dist');

const dist = path.join(ROOT, 'dist');
const exe = `My-Command-Center-Setup-${next}.exe`;
const files = [exe, `${exe}.blockmap`, 'latest.yml'].map((f) => path.join(dist, f));
files.forEach((f) => {
  if (!fs.existsSync(f)) {
    console.error('Missing after the build: ' + f);
    process.exit(1);
  }
});

const quoted = files.map((f) => `"${f}"`).join(' ');
const body = (notes || `Version ${next}.`).replace(/"/g, '\\"');
run(`gh release create v${next} ${quoted} --repo ${publish.owner}/${publish.repo} --title "Version ${next}" --notes "${body}"`);

run('git add package.json package-lock.json');
run(`git commit -m "Release ${next}"`);
run('git push');

console.log(`\nDone. Version ${next} is on GitHub; installed copies will offer it within a few hours, or right away from Settings -> Updates.`);
