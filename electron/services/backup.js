// A daily copy of the database and of every attached document, taken
// without being asked. The code reinstalls from GitHub; what the owner has
// typed and attached cannot be rebuilt, so that is what this protects.
//
// The database uses db.backupTo(), which is SQLite's own backup: safe to
// run while the app is open and writing.
//
// The documents are a mirror rather than a dated snapshot — fourteen daily
// copies of the same unchanging PDFs would be waste — so anything missing
// from the mirror is added to it.
//
// **The mirror never deletes.** A document removed from the app stays in
// the backup, which is the whole point of having one.
//
// Where it goes: Documents\Command Center Backups. Optionally (Settings),
// the same files are also copied into OneDrive, which uploads them — so a
// dead drive or a stolen laptop does not take the data and every backup
// of it together. The backups are finished files, so unlike the live
// database they are safe in a synced folder.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const db = require('./db');

const KEEP_DAYS = 14;
const CHECK_EVERY_MS = 60 * 60 * 1000;
const PREFIX = 'command-center-daily-';

let timer = null;

function backupDir() {
  // Outside the app's own data folder, so a corrupted app-data folder does
  // not take the copies with it.
  return path.join(app.getPath('documents'), 'Command Center Backups');
}

/**
 * The copy that leaves the machine — only when turned on in Settings
 * (`backup_onedrive` = 'yes') and only if OneDrive is set up on this PC.
 * OneDrive uploads whatever lands in this folder, so writing finished
 * backup files here is the whole job.
 *
 * Only finished files go here, never the live database: OneDrive syncing a
 * SQLite file while it is being written can corrupt it.
 */
function offsiteDir() {
  const root = process.env.OneDrive || path.join(app.getPath('home'), 'OneDrive');
  return path.join(root, 'Command Center Backup');
}

function offsiteOn() {
  return db.getSetting('backup_onedrive', 'no') === 'yes';
}

function today() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
}

/** Older automatic copies only. Never touches the hand-made ones, which
 *  were taken before specific changes and are worth keeping. */
function prune(dir) {
  let files;
  try { files = fs.readdirSync(dir); } catch (e) { return 0; }
  const mine = files
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.sqlite'))
    .sort();
  const excess = mine.slice(0, Math.max(0, mine.length - KEEP_DAYS));
  excess.forEach((f) => {
    try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* leave it */ }
  });
  return excess.length;
}

/**
 * Every attached document, mirrored.
 *
 * Stored names carry a timestamp prefix, so a name never refers to two
 * different files and anything already in the mirror can be left alone.
 * Size is compared anyway: a copy interrupted half way leaves a short file
 * behind, and without that check it would look done forever.
 */
function mirrorDocuments() {
  return mirrorFolder(
    path.join(app.getPath('userData'), 'attachments'),
    path.join(backupDir(), 'attachments')
  );
}

/** Adds anything missing or short from `from` into `to`. Never deletes. */
function mirrorFolder(from, to, only) {
  let names;
  try {
    names = fs.readdirSync(from);
  } catch (e) {
    // No attachments folder yet is not a failure, it is a new install.
    return { ok: true, copied: 0, total: 0, bytes: 0 };
  }

  fs.mkdirSync(to, { recursive: true });

  let copied = 0;
  let bytes = 0;
  let total = 0;
  const failed = [];

  names.forEach((name) => {
    if (only && !only(name)) return;
    const src = path.join(from, name);
    let stat;
    try {
      stat = fs.statSync(src);
    } catch (e) {
      return;
    }
    if (stat.isDirectory()) return;
    total++;

    const dest = path.join(to, name);
    let have = null;
    try { have = fs.statSync(dest); } catch (e) { /* not there yet */ }
    if (have && have.size === stat.size) return;

    try {
      fs.copyFileSync(src, dest);
      copied++;
      bytes += stat.size;
    } catch (e) {
      failed.push(name + ': ' + e.message);
    }
  });

  if (failed.length) {
    console.error('Command Center: could not copy ' + failed.length
      + ' file(s) to ' + to + ' — ' + failed[0]);
  }
  return { ok: !failed.length, copied, total, bytes, failed };
}

/**
 * The daily database copies and the document mirror, copied into OneDrive.
 * The daily copies are pruned to the same fourteen days as the local ones —
 * they are automatic files this code made, the same rule `prune` follows.
 * Documents are only ever added, like the local mirror.
 */
function mirrorOffsite() {
  const root = offsiteDir();
  if (!fs.existsSync(path.dirname(root))) {
    return { ok: false, error: 'OneDrive folder not found' };
  }
  fs.mkdirSync(root, { recursive: true });
  const daily = mirrorFolder(backupDir(), root,
    (n) => n.startsWith(PREFIX) && n.endsWith('.sqlite'));
  prune(root);
  const docs = mirrorFolder(path.join(backupDir(), 'attachments'), path.join(root, 'attachments'));
  return {
    ok: daily.ok && docs.ok,
    copied: daily.copied + docs.copied,
    bytes: daily.bytes + docs.bytes
  };
}

async function runOnce() {
  const dir = backupDir();
  const target = path.join(dir, `${PREFIX}${today()}.sqlite`);
  const result = {};

  try {
    fs.mkdirSync(dir, { recursive: true });

    // One database copy a day. The file's existence is the record — no
    // extra state to keep in sync, and it stays true if someone deletes a
    // backup by hand.
    if (fs.existsSync(target)) {
      result.database = { skipped: true };
    } else {
      await db.backupTo(target);
      const removed = prune(dir);
      const kb = Math.round(fs.statSync(target).size / 1024);
      db.logEvent('System', 'Database backed up', `${kb} KB`);
      result.database = { ok: true, path: target, kb, removed };
    }
  } catch (e) {
    // A failed backup must never take the app down with it.
    console.error('Command Center: daily backup failed —', e.message);
    result.database = { ok: false, error: e.message };
  }

  // Deliberately outside the block above, and not behind the same
  // once-a-day gate: a document attached this afternoon must still reach
  // the mirror on a day whose database copy was already taken this morning.
  try {
    const docs = mirrorDocuments();
    result.documents = docs;
    if (docs.copied) {
      const mb = Math.round(docs.bytes / 1024 / 1024 * 10) / 10;
      db.logEvent('System', 'Documents backed up',
        `${docs.copied} new · ${docs.total} total · ${mb} MB`);
    }
  } catch (e) {
    console.error('Command Center: document backup failed —', e.message);
    result.documents = { ok: false, error: e.message };
  }

  // Last, so it copies what the two steps above just made. Opt-in.
  if (!offsiteOn()) return result;
  try {
    const off = mirrorOffsite();
    result.offsite = off;
    if (off.copied) {
      const mb = Math.round(off.bytes / 1024 / 1024 * 10) / 10;
      db.logEvent('System', 'Backup copied to OneDrive', `${off.copied} file(s) · ${mb} MB`);
    } else if (!off.ok && off.error) {
      console.error('Command Center: OneDrive copy skipped —', off.error);
    }
  } catch (e) {
    console.error('Command Center: OneDrive copy failed —', e.message);
    result.offsite = { ok: false, error: e.message };
  }

  return result;
}

/**
 * Checks hourly rather than scheduling for a time of day. The machine
 * sleeps, so a fixed hour is one the app is often not awake for; asking
 * "has today been done" whenever it happens to be running catches it on
 * the first check after waking.
 */
function start() {
  if (timer) return;
  setTimeout(() => { runOnce(); }, 30 * 1000);
  timer = setInterval(() => { runOnce(); }, CHECK_EVERY_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, runOnce, mirrorOffsite, backupDir, offsiteDir, KEEP_DAYS };
