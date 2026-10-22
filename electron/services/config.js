// The layout file, read by the main process.
//
// The pages and their boxes ("widgets") are described in JSON. The screen
// reads the layout to draw itself; this side reads it so the parts that never see the screen — the library, the agent,
// the Telegram brief, Claude chat — can call a box by the name its owner
// gave it instead of by an id.
//
// Two files make the layout:
//
// - `config/command-center.json` ships with the app. It is the template's
//   own pages, and an update replaces it.
// - `my-pages.json` in the data folder is the owner's own. Pages they add
//   go here, so an update never touches them. A page here with the same id
//   as a built-in one replaces it; `hide` lists built-in pages to leave out.
//
// Edited by hand or by Claude Code (see CLAUDE.md). The app only ever
// creates the owner's file empty, so what is in it is always what they chose.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'config', 'command-center.json');

const USER_FILE_NAME = 'my-pages.json';

const USER_FILE_START = {
  _about: 'Your own pages and settings. Add pages here (or ask Claude Code to) and app updates will never touch them. '
    + 'A page with the same id as a built-in one replaces it; put a built-in page id in "hide" to leave it out. '
    + '"about" and "telegramInbox" can go here too. Restart the app after saving.',
  pages: [],
  hide: []
};

/** The owner's file, in the data folder. Null outside the app (no data folder). */
function userFile() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), USER_FILE_NAME);
  } catch (e) {
    return null;
  }
}

/** Creates the owner's file, empty, so there is somewhere obvious to add pages. */
function ensureUserFile() {
  const file = userFile();
  if (!file || fs.existsSync(file)) return;
  try {
    fs.writeFileSync(file, JSON.stringify(USER_FILE_START, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.error('Command Center: could not create ' + USER_FILE_NAME + ' —', e.message);
  }
}

const base = { data: null, at: 0 };
const mine = { data: null, at: 0, file: null };
let cached = null;

function readBase() {
  try {
    const stat = fs.statSync(FILE);
    if (base.data && stat.mtimeMs === base.at) return false;
    base.data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    base.at = stat.mtimeMs;
    return true;
  } catch (e) {
    console.error('Command Center: could not read config/command-center.json —', e.message);
    if (!base.data) base.data = { owner: '', pages: [] };
    return false;
  }
}

/** The owner's file. Missing or broken means "no pages of their own" — never a blank app. */
function readMine() {
  const file = userFile();
  let stat = null;
  try { stat = file && fs.statSync(file); } catch (e) { /* no file yet */ }
  if (!stat) {
    const changed = mine.data !== null;
    mine.data = null; mine.at = 0;
    return changed;
  }
  if (stat.mtimeMs === mine.at && mine.file === file) return false;
  try {
    mine.data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Command Center: ' + USER_FILE_NAME + ' could not be read, so your own pages are left out until it is fixed —', e.message);
    mine.data = null;
  }
  mine.at = stat.mtimeMs;
  mine.file = file;
  return true;
}

/** Built-in pages, with the owner's replacements in place, hidden ones out, and their new pages after. */
function merge(b, m) {
  if (!m) return b;
  const theirs = (Array.isArray(m.pages) ? m.pages : []).filter((p) => p && p.id);
  const hide = new Set(Array.isArray(m.hide) ? m.hide : []);
  const byId = new Map(theirs.map((p) => [p.id, p]));
  const pages = (b.pages || [])
    .filter((p) => p && !hide.has(p.id))
    .map((p) => byId.get(p.id) || p);
  const builtIn = new Set((b.pages || []).map((p) => p && p.id));
  theirs.forEach((p) => { if (!builtIn.has(p.id)) pages.push(p); });
  // Anything else they set (owner, about, telegramInbox) wins over the built-in value.
  const { pages: _p, hide: _h, _about, ...rest } = m;
  return { ...b, ...rest, pages };
}

function load() {
  const baseChanged = readBase();
  const mineChanged = readMine();
  if (!cached || baseChanged || mineChanged) cached = merge(base.data, mine.data);
  return cached;
}

/**
 * The owner's first name, or '' if nobody has given one. The name typed
 * into the greeting on the Home page wins; the config file's `owner` is
 * the fallback. db is required lazily because db.js loads this module.
 */
function owner() {
  let typed = '';
  try { typed = require('./db').getSetting('owner_name', ''); } catch (e) { /* db not open yet */ }
  return String(typed || load().owner || '').trim();
}

/** Every widget on every page, each carrying the title of its page. */
function widgets() {
  const out = [];
  (load().pages || []).forEach((page) => {
    (page.widgets || []).forEach((w) => {
      out.push({ ...w, pageId: page.id, pageTitle: page.title });
    });
  });
  return out;
}

/** One widget by id, or null. */
function widget(id) {
  return widgets().find((w) => w.id === id) || null;
}

/** "Bills (Money)" — how a person would name where something lives. */
function describe(id) {
  const w = widget(id);
  if (!w) return id;
  return w.pageTitle ? `${w.title} (${w.pageTitle})` : w.title;
}

module.exports = { load, owner, widgets, widget, describe, ensureUserFile, userFile, FILE };
