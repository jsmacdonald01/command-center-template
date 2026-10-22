// Attachments live on disk, not in SQLite. V1 stored 3MB base64 blobs in
// table rows that were rewritten on every save, which capped file size and
// made every keystroke more expensive as files accumulated.

const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

function baseDir() {
  return path.join(app.getPath('userData'), 'attachments');
}

function safeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function store(sourcePath) {
  const dir = baseDir();
  fs.mkdirSync(dir, { recursive: true });

  const stat = fs.statSync(sourcePath);
  const original = path.basename(sourcePath);
  const stored = `${Date.now()}-${safeName(original)}`;
  const dest = path.join(dir, stored);

  fs.copyFileSync(sourcePath, dest);
  return { name: original, filePath: dest, size: stat.size };
}

function open(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: 'File not found' };
  }
  shell.openPath(filePath);
  return { ok: true };
}

function reveal(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: 'File not found' };
  }
  shell.showItemInFolder(filePath);
  return { ok: true };
}

function remove(filePath) {
  // Only ever deletes inside our own attachments directory.
  if (!filePath) return false;
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(baseDir()))) return false;
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  return true;
}

function exists(filePath) {
  return !!filePath && fs.existsSync(filePath);
}

module.exports = { store, open, reveal, remove, exists, baseDir };
