// The owner's Obsidian notebook ("vault"), read from disk.
//
// The notebook box on the page and the agent's note tools share this one
// implementation, so a fix to either reaches both.
//
// **Read-only, deliberately.** The owner writes these files and relies on
// them. A second author would make them untrustworthy, so nothing here
// writes, renames or deletes notes. Editing happens in Obsidian, one click
// away. The one exception is ensureNotebook below, which only ever creates
// a brand-new notebook where none exists.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { app, shell } = require('electron');

function documentsDir() {
  try { return app.getPath('documents'); } catch (e) { return path.join(os.homedir(), 'Documents'); }
}

/**
 * Where the notebook lives. Chosen in Settings (`vault_path`); until then
 * it defaults to a folder called "Command Center Notes" in the owner's
 * Documents. Read on every call, so changing it in Settings takes effect
 * without a restart. Required lazily because db.js loads early.
 */
function vaultDir() {
  let chosen = '';
  try { chosen = require('./db').getSetting('vault_path', ''); } catch (e) { /* db not open yet */ }
  return chosen || path.join(documentsDir(), 'Command Center Notes');
}

/** Copies a folder tree, never overwriting a file that is already there. */
function copyMissing(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyMissing(src, dest);
    else if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  });
}

/**
 * Adds the notebook to Obsidian's own list, so it is simply there the
 * first time Obsidian opens — no "Open folder as vault" step. Only possible
 * once Obsidian has been installed and opened once (that is when it writes
 * the list); until then this does nothing, and runs again next start.
 * Additive: other notebooks in the list are left exactly as they were.
 */
function registerWithObsidian(dir) {
  const file = path.join(app.getPath('appData'), 'obsidian', 'obsidian.json');
  if (!fs.existsSync(file)) return { ok: false, reason: 'obsidian not set up yet' };
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.vaults = json.vaults || {};
    const wanted = path.resolve(dir).toLowerCase();
    const known = Object.values(json.vaults).some((v) => v && v.path && path.resolve(v.path).toLowerCase() === wanted);
    if (known) return { ok: true, already: true };
    json.vaults[crypto.randomBytes(8).toString('hex')] = { path: path.resolve(dir), ts: Date.now() };
    fs.writeFileSync(file, JSON.stringify(json));
    return { ok: true, added: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * Makes sure there is a notebook, at startup. If none was ever chosen and
 * the default folder does not exist yet, the starter notebook that ships
 * with the app is copied there — so the notebook box works on day one with
 * nothing to set up. A notebook the owner already has is never touched.
 */
function ensureNotebook() {
  const dir = vaultDir();
  let created = false;
  if (!fs.existsSync(dir)) {
    const starter = path.join(__dirname, '..', '..', 'notebook-starter');
    if (!fs.existsSync(starter)) return { ok: false, reason: 'starter missing' };
    copyMissing(starter, dir);
    created = true;
    try { require('./db').logEvent('System', 'Notebook created', dir); } catch (e) { /* not fatal */ }
  }
  const obsidian = registerWithObsidian(dir);
  return { ok: true, dir, created, obsidian };
}

/** Is there a notebook folder at all? */
function configured() {
  try { return fs.statSync(vaultDir()).isDirectory(); } catch (e) { return false; }
}

/** Obsidian's own config, the `.git` folder, and anything else dot-prefixed. */
function hidden(name) {
  return name.startsWith('.');
}

/**
 * Resolves a note name to a file, and refuses anything that climbs out of
 * the vault. Names arrive from the renderer, so this is a boundary.
 *
 * Obsidian's links do not carry folders: the vault writes [[Next Session]]
 * for a note that lives in Handoffs/. So an exact path is tried first, and
 * a bare name that matches exactly one note anywhere is accepted after it.
 * Without that second pass every link between notes leads nowhere, which
 * is most of the links in this vault.
 */
function resolveNote(name) {
  const safe = String(name || '').replace(/\.md$/i, '').trim();
  if (!safe) return null;

  const root = path.resolve(vaultDir());
  const exact = path.resolve(vaultDir(), safe + '.md');
  if (!exact.startsWith(root + path.sep)) return null;
  if (fs.existsSync(exact)) return exact;

  if (safe.includes('/') || safe.includes('\\')) return exact;

  const wanted = safe.toLowerCase();
  const match = list().find((notePath) => {
    const base = notePath.slice(notePath.lastIndexOf('/') + 1);
    return base.toLowerCase() === wanted;
  });

  return match ? path.resolve(vaultDir(), match + '.md') : exact;
}

/**
 * The vault as folders and notes, the way Obsidian shows it: folders
 * first, then notes, each group alphabetical. Names are vault-relative and
 * carry no extension, so they can be handed straight back to read().
 */
function tree(dir = vaultDir(), prefix = '') {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return []; }

  const folders = [];
  const notes = [];

  entries.forEach((entry) => {
    if (hidden(entry.name)) return;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const children = tree(full, prefix + entry.name + '/');
      // A folder holding no notes at all is noise on a page about notes.
      if (children.length) folders.push({ type: 'folder', name: entry.name, path: prefix + entry.name, children });
      return;
    }

    if (!entry.name.toLowerCase().endsWith('.md')) return;
    const base = entry.name.replace(/\.md$/i, '');
    let modified = 0;
    try { modified = fs.statSync(full).mtimeMs; } catch (e) { /* listing survives a stat failure */ }
    notes.push({ type: 'note', name: base, path: prefix + base, modified });
  });

  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  return [...folders.sort(byName), ...notes.sort(byName)];
}

/**
 * The vault-relative name a link actually points at, or null if nothing is
 * there. [[Next Session]] comes back as "Handoffs/Next Session", so the
 * tree can highlight the note the reader is showing.
 */
function canonical(name) {
  const target = resolveNote(name);
  if (!target || !fs.existsSync(target)) return null;
  return path.relative(vaultDir(), target).replace(/\\/g, '/').replace(/\.md$/i, '');
}

/** Every note as a flat list of names. What the agent's list_notes returns. */
function list() {
  const out = [];
  (function walk(nodes) {
    nodes.forEach((n) => (n.type === 'folder' ? walk(n.children) : out.push(n.path)));
  }(tree()));
  return out;
}

/**
 * One note's text. `limit` exists for the agent, where a long note is
 * tokens spent; the page passes nothing and gets the whole file.
 */
function read(name, limit = 0) {
  const target = resolveNote(name);
  if (!target) throw new Error('Outside the knowledge base.');
  if (!fs.existsSync(target)) throw new Error('No note called "' + name + '".');
  const body = fs.readFileSync(target, 'utf8');
  if (limit && body.length > limit) return body.slice(0, limit) + '\n…truncated';
  return body;
}

/** Notes mentioning a phrase, with the lines that matched. */
function search(query, maxNotes = 8, maxLines = 4) {
  const q = String(query || '').toLowerCase();
  if (!q) return [];
  const hits = [];
  list().forEach((name) => {
    if (hits.length >= maxNotes) return;
    let body = '';
    try { body = read(name); } catch (e) { return; }
    const matched = body.split('\n').filter((l) => l.toLowerCase().includes(q)).slice(0, maxLines);
    if (matched.length) hits.push({ note: name, lines: matched });
  });
  return hits;
}

/** Is this path one of the vault's own notes? Decides how a link opens. */
function contains(filePath) {
  if (!filePath) return false;
  const resolved = path.resolve(String(filePath));
  if (!resolved.startsWith(path.resolve(vaultDir()) + path.sep)) return false;
  return resolved.toLowerCase().endsWith('.md');
}

/** A vault file path as the note name the rest of this module expects. */
function noteNameFor(filePath) {
  if (!contains(filePath)) return null;
  return path.relative(vaultDir(), path.resolve(String(filePath)))
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '');
}

/**
 * Opens the note in Obsidian itself. The page reads; Obsidian edits. Uses
 * the same protocol-handler route as the Claude Desktop button, because
 * the app's install path is not something to go looking for.
 */
async function openInObsidian(name) {
  const target = resolveNote(name);
  if (!target) return { ok: false, error: 'Outside the knowledge base.' };
  const uri = 'obsidian://open?vault=' + encodeURIComponent(path.basename(vaultDir()))
    + '&file=' + encodeURIComponent(String(name).replace(/\.md$/i, ''));
  try {
    await shell.openExternal(uri);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Obsidian did not open. It may not be installed.' };
  }
}

module.exports = {
  vaultDir, configured, ensureNotebook, registerWithObsidian,
  tree, list, canonical, read, search, contains, noteNameFor, openInObsidian
};
