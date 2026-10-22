const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

let db = null;
let dbPath = null;

const EVENT_RETENTION_DAYS = 365;

/*
 * One SQLite file holds everything the owner types: every box's rows, the
 * settings, the Log, the words read out of attached documents, and what the
 * agent remembers.
 *
 * Real SQLite in WAL mode, so the app and the Claude Desktop connection
 * (mcp/mcp-server.js) can both have it open at once safely, every write is a
 * transaction, and a crash mid-save cannot leave half a file.
 *
 * It is a native module, compiled for one runtime. **Anything that opens
 * this database must run under Electron**, not plain `node` —
 * `npm run setup` puts the right binary in place.
 *
 * The layout is generic on purpose. There is no "bills" table or "goals"
 * table: every list-shaped box on every page stores its rows in `items`,
 * tagged with the box's id from config/command-center.json. Adding a page
 * or a box therefore never needs a database change.
 */

function open(file) {
  const handle = new Database(file);
  handle.pragma('journal_mode = WAL');
  handle.pragma('busy_timeout = 5000');
  handle.pragma('synchronous = NORMAL');
  handle.pragma('foreign_keys = ON');
  return handle;
}

/** Kept so older call sites still read correctly; SQLite reloads itself. */
function reloadIfChanged() {
  return false;
}

function run(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.run(params);
  else stmt.run();
}

function all(sql, params) {
  const stmt = db.prepare(sql);
  return params ? stmt.all(params) : stmt.all();
}

/* ------------------------------------------------------------------ *
 * Entity registry
 *
 * Two kinds of record:
 *
 *   item            — a row in any box. `widget` is the box's id. Each box
 *                     type uses the fields it needs and ignores the rest:
 *                     a checklist uses text + done, a money box uses
 *                     text + amount, a documents box uses name + filePath.
 *   libraryDocument — a document imported straight into the library rather
 *                     than attached to a box.
 * ------------------------------------------------------------------ */
const ENTITIES = {
  item: {
    table: 'items',
    scope: 'widget',
    fields: {
      text: 'text', note: 'note', date: 'date', amount: 'amount', done: 'done',
      name: 'name', filePath: 'file_path', size: 'size', link: 'link'
    },
    logCategory: 'Record'
  },
  libraryDocument: {
    table: 'library_documents',
    fields: { name: 'name', filePath: 'file_path', size: 'size', note: 'note', addedAt: 'added_at' },
    logCategory: 'Document'
  }
};

async function init(targetPath) {
  dbPath = targetPath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = open(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, widget TEXT NOT NULL,
      text TEXT, note TEXT, date TEXT, amount REAL, done INTEGER,
      name TEXT, file_path TEXT, size INTEGER, link TEXT,
      sort_order INTEGER
    );
    CREATE INDEX IF NOT EXISTS items_by_widget ON items (widget, sort_order);
    -- The agent's own records, kept apart from the owner's: what it has
    -- learned, what it is asking permission to do, and what it has spent.
    CREATE TABLE IF NOT EXISTS agent_memory (
      id TEXT PRIMARY KEY, kind TEXT, text TEXT, source TEXT,
      sensitive INTEGER DEFAULT 0, confirmed INTEGER DEFAULT 1,
      created_at INTEGER, last_used_at INTEGER, use_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS agent_proposals (
      id TEXT PRIMARY KEY, created_at INTEGER, expires_at INTEGER,
      surface TEXT, summary TEXT, tool TEXT, args_json TEXT,
      status TEXT, result_json TEXT, verified INTEGER, decided_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS agent_spend (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, month TEXT,
      model TEXT, input_tokens INTEGER, output_tokens INTEGER,
      cost_usd REAL, surface TEXT
    );
    -- The library. library_documents is what was imported into the library
    -- itself; document_text is the words out of every document anywhere in
    -- the app, keyed by file path so one store serves every documents box.
    CREATE TABLE IF NOT EXISTS library_documents (
      id TEXT PRIMARY KEY, name TEXT, file_path TEXT, size INTEGER,
      note TEXT, added_at INTEGER, sort_order INTEGER
    );
    CREATE TABLE IF NOT EXISTS document_text (
      file_path TEXT PRIMARY KEY, name TEXT, chars INTEGER,
      state TEXT, read_at INTEGER, text TEXT
    );
    -- SQLite's own full-text search: nothing to install, and documents
    -- never leave the machine to become searchable.
    CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(
      name, text, file_path UNINDEXED
    );
    CREATE TABLE IF NOT EXISTS event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, label TEXT,
      category TEXT DEFAULT 'System', entity TEXT
    );
    CREATE TABLE IF NOT EXISTS notification_log (key TEXT NOT NULL, day TEXT NOT NULL, ts INTEGER, PRIMARY KEY (key, day));
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, role TEXT, text TEXT
    );
  `);

  // A fresh install starts empty and ready. There is nothing to seed: the
  // boxes come from the config file, and every one of them starts blank.
  if (getSetting('initialized', null) !== '1') {
    setSetting('initialized', '1');
    logEvent('System', 'Command Center started for the first time');
  }

  pruneEvents();
  flush();
}

/** Folds the write-ahead log back into the main file. */
function flush() {
  if (!db) return;
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { /* another reader holds it; harmless */ }
}

/** Writes are immediate and atomic; kept so call sites read the same. */
function schedulePersist() {
  /* no-op */
}

function transaction(fn) {
  return db.transaction(fn)();
}

/**
 * A consistent copy of the database, safe while the app is running.
 * Returns a promise.
 */
function backupTo(destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  return db.backup(destination);
}

/* ------------------------------ agent ------------------------------ */

function getMemories(includeSensitive = true, limit = 15) {
  const rows = all(
    `SELECT * FROM agent_memory
      WHERE confirmed = 1 ${includeSensitive ? '' : 'AND sensitive = 0'}
      ORDER BY use_count DESC, last_used_at DESC, created_at DESC
      LIMIT ?`, [limit]);
  return rows.map((r) => ({ ...r, sensitive: !!r.sensitive, confirmed: !!r.confirmed }));
}

function listMemories() {
  return all('SELECT * FROM agent_memory ORDER BY created_at DESC')
    .map((r) => ({ ...r, sensitive: !!r.sensitive, confirmed: !!r.confirmed }));
}

function addMemory({ kind, text, source, sensitive, confirmed }) {
  const id = uid();
  run(`INSERT INTO agent_memory (id, kind, text, source, sensitive, confirmed, created_at, last_used_at, use_count)
       VALUES (?,?,?,?,?,?,?,?,0)`,
  [id, kind || 'preference', text, source || 'conversation',
    sensitive ? 1 : 0, confirmed === false ? 0 : 1, Date.now(), Date.now()]);
  return id;
}

function updateMemory(id, patch) {
  if (patch.text !== undefined) run('UPDATE agent_memory SET text = ? WHERE id = ?', [patch.text, id]);
  if (patch.confirmed !== undefined) run('UPDATE agent_memory SET confirmed = ? WHERE id = ?', [patch.confirmed ? 1 : 0, id]);
  if (patch.sensitive !== undefined) run('UPDATE agent_memory SET sensitive = ? WHERE id = ?', [patch.sensitive ? 1 : 0, id]);
  return true;
}

function deleteMemory(id) {
  run('DELETE FROM agent_memory WHERE id = ?', [id]);
  return true;
}

function touchMemories(ids) {
  ids.forEach((id) => run(
    'UPDATE agent_memory SET use_count = use_count + 1, last_used_at = ? WHERE id = ?',
    [Date.now(), id]));
}

const PROPOSAL_TTL_MS = 48 * 60 * 60 * 1000;

function addProposal({ surface, summary, tool, args }) {
  const now = Date.now();
  // The same change proposed twice is one decision, not two cards.
  const argsJson = JSON.stringify(args || {});
  const twin = all(
    `SELECT id FROM agent_proposals
      WHERE status = 'pending' AND tool = ? AND args_json = ? AND created_at > ?`,
    [tool, argsJson, now - 5 * 60 * 1000]
  )[0];
  if (twin) return twin.id;

  const id = uid();
  run(`INSERT INTO agent_proposals
       (id, created_at, expires_at, surface, summary, tool, args_json, status, verified)
       VALUES (?,?,?,?,?,?,?,'pending',0)`,
  [id, now, now + PROPOSAL_TTL_MS, surface || 'app', summary, tool, argsJson]);
  return id;
}

function expireProposals() {
  run("UPDATE agent_proposals SET status = 'expired' WHERE status = 'pending' AND expires_at < ?", [Date.now()]);
}

function listProposals(status) {
  expireProposals();
  const rows = status
    ? all('SELECT * FROM agent_proposals WHERE status = ? ORDER BY created_at DESC', [status])
    : all('SELECT * FROM agent_proposals ORDER BY created_at DESC LIMIT 50');
  return rows.map((r) => ({
    ...r,
    args: JSON.parse(r.args_json || '{}'),
    result: r.result_json ? JSON.parse(r.result_json) : null,
    verified: !!r.verified
  }));
}

function getProposal(id) {
  expireProposals();
  const rows = all('SELECT * FROM agent_proposals WHERE id = ?', [id]);
  if (!rows.length) return null;
  const r = rows[0];
  return { ...r, args: JSON.parse(r.args_json || '{}'), verified: !!r.verified };
}

function setProposalStatus(id, status, result, verified) {
  run(`UPDATE agent_proposals SET status = ?, result_json = ?, verified = ?, decided_at = ?
       WHERE id = ?`,
  [status, result ? JSON.stringify(result) : null, verified ? 1 : 0, Date.now(), id]);
  return true;
}

function recordSpend({ model, inputTokens, outputTokens, costUsd, surface }) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  run(`INSERT INTO agent_spend (ts, month, model, input_tokens, output_tokens, cost_usd, surface)
       VALUES (?,?,?,?,?,?,?)`,
  [Date.now(), month, model, inputTokens || 0, outputTokens || 0, costUsd || 0, surface || 'app']);
}

function monthSpend() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rows = all(
    'SELECT COALESCE(SUM(cost_usd),0) total, COUNT(*) calls FROM agent_spend WHERE month = ?', [month]);
  return { month, total: rows[0].total || 0, calls: rows[0].calls || 0 };
}

/* ---------------------------- settings ---------------------------- */

function getSetting(key, fallback) {
  const rows = all('SELECT value FROM settings WHERE key = ?', [key]);
  return rows.length ? rows[0].value : fallback;
}

/**
 * Settings also hold the values typed into "facts" boxes, under
 * `field:<box id>:<field key>`. Those are logged by the box's own name so
 * the Log reads "Savings goal changed — now $5,000", not a key.
 */
function setSetting(key, value) {
  const previous = getSetting(key, '');
  const next = value == null ? '' : String(value);

  run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, next]);

  const field = /^field:([^:]+):(.+)$/.exec(key);
  if (field && previous !== next) {
    const w = config.widget(field[1]);
    const def = w && (w.fields || []).find((f) => f.key === field[2]);
    const name = (def && def.label) || field[2];
    logEvent('Record', `${name} changed`, next ? `now ${next}` : 'cleared');
  }
  return true;
}

function getSettings(keys) {
  const out = {};
  keys.forEach((k) => { out[k] = getSetting(k, ''); });
  return out;
}

function isInitialized() {
  return getSetting('initialized', null) === '1';
}

/* ------------------------- generic entities ------------------------ */

function uid() {
  return 'r' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

function entityDef(type) {
  const def = ENTITIES[type];
  if (!def) throw new Error(`Unknown entity type: ${type}`);
  return def;
}

function rowToRecord(def, row) {
  const out = { id: row.id };
  Object.keys(def.fields).forEach((appKey) => {
    out[appKey] = row[def.fields[appKey]];
  });
  if (def.scope) out[def.scope] = row[def.scope];
  if (Object.prototype.hasOwnProperty.call(out, 'done')) out.done = !!out.done;
  return out;
}

function getEntity(type, id) {
  const def = entityDef(type);
  const rows = all(`SELECT * FROM ${def.table} WHERE id = ?`, [id]);
  return rows.length ? rowToRecord(def, rows[0]) : null;
}

function listEntities(type, scopeValue) {
  const def = entityDef(type);
  const rows = def.scope
    ? all(`SELECT * FROM ${def.table} WHERE ${def.scope} = ? ORDER BY sort_order`, [scopeValue])
    : all(`SELECT * FROM ${def.table} ORDER BY sort_order`);
  return rows.map((r) => rowToRecord(def, r));
}

function normalizeValue(appKey, value) {
  if (value === undefined) return null;
  if (appKey === 'done') return value ? 1 : 0;
  if (appKey === 'amount') {
    if (value === null || value === '') return null;
    const n = parseFloat(String(value).replace(/[$,\s]/g, ''));
    return isNaN(n) ? null : n;
  }
  if (appKey === 'size' || appKey === 'addedAt') {
    if (value === null || value === '') return null;
    const n = parseInt(value, 10);
    return isNaN(n) ? null : n;
  }
  return value === null ? null : String(value);
}

function addEntity(type, scopeValue, fields) {
  const def = entityDef(type);
  const id = (fields && fields.id) || uid();
  const maxRow = def.scope
    ? all(`SELECT MAX(sort_order) AS m FROM ${def.table} WHERE ${def.scope} = ?`, [scopeValue])
    : all(`SELECT MAX(sort_order) AS m FROM ${def.table}`);
  const sortOrder = ((maxRow[0] && maxRow[0].m) || 0) + 1;

  const cols = ['id'];
  const vals = [id];
  if (def.scope) {
    cols.push(def.scope);
    vals.push(scopeValue);
  }
  Object.keys(def.fields).forEach((appKey) => {
    cols.push(def.fields[appKey]);
    vals.push(normalizeValue(appKey, fields ? fields[appKey] : null));
  });
  cols.push('sort_order');
  vals.push(sortOrder);

  run(`INSERT INTO ${def.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals);

  const record = getEntity(type, id);
  logEvent(def.logCategory, `Added to ${where(type, record)}`, describe(record));
  return record;
}

/** Takes three arguments: type, id, patch. */
function updateEntity(type, id, patch) {
  const def = entityDef(type);
  const before = getEntity(type, id);
  if (!before) return null;

  const sets = [];
  const vals = [];
  Object.keys(patch || {}).forEach((appKey) => {
    if (!def.fields[appKey]) return;
    sets.push(`${def.fields[appKey]} = ?`);
    vals.push(normalizeValue(appKey, patch[appKey]));
  });
  if (!sets.length) return before;

  vals.push(id);
  run(`UPDATE ${def.table} SET ${sets.join(', ')} WHERE id = ?`, vals);

  const after = getEntity(type, id);
  const changed = Object.keys(patch).filter((k) => def.fields[k] && String(before[k]) !== String(after[k]));
  if (changed.length) {
    logEvent(def.logCategory, `Edited in ${where(type, after)}`, `${describe(after)} (${changed.join(', ')})`);
  }

  // A renamed document has to be renamed in the search index too, or a
  // search keeps showing the old name. The file on disk is never renamed.
  if (changed.includes('name') && after.filePath) {
    run('UPDATE document_text SET name = ? WHERE file_path = ?', [after.name || '', after.filePath]);
    run('UPDATE document_search SET name = ? WHERE file_path = ?', [after.name || '', after.filePath]);
  }
  return after;
}

function deleteEntity(type, id) {
  const def = entityDef(type);
  const before = getEntity(type, id);
  if (!before) return false;
  run(`DELETE FROM ${def.table} WHERE id = ?`, [id]);

  // A removed document must stop answering searches. The FILE is left
  // alone: removing a row is not permission to delete someone's paperwork,
  // and the backup keeps its own copy either way.
  if (before.filePath) clearDocumentText(before.filePath);

  logEvent(def.logCategory, `Removed from ${where(type, before)}`, describe(before));
  return true;
}

function reorderEntity(type, orderedIds) {
  const def = entityDef(type);
  transaction(() => {
    orderedIds.forEach((id, i) => {
      run(`UPDATE ${def.table} SET sort_order = ? WHERE id = ?`, [i, id]);
    });
  });
  return true;
}

function where(type, record) {
  if (type === 'libraryDocument') return 'Library';
  return config.describe(record && record.widget);
}

function describe(record) {
  if (!record) return '';
  return record.name || record.text || record.id;
}

/** Every item, grouped by the box it belongs to. */
function itemsByWidget() {
  const def = ENTITIES.item;
  const out = {};
  all('SELECT * FROM items ORDER BY widget, sort_order').forEach((row) => {
    const rec = rowToRecord(def, row);
    (out[rec.widget] = out[rec.widget] || []).push(rec);
  });
  return out;
}

/** Every "facts" value, grouped by box: { savings: { goal: '$5,000' } }. */
function fieldsByWidget() {
  const out = {};
  all("SELECT key, value FROM settings WHERE key LIKE 'field:%'").forEach((r) => {
    const m = /^field:([^:]+):(.+)$/.exec(r.key);
    if (!m) return;
    (out[m[1]] = out[m[1]] || {})[m[2]] = r.value;
  });
  return out;
}

/* ----------------------------- events ------------------------------ */

function logEvent(category, label, entity) {
  run('INSERT INTO event_log (ts, label, category, entity) VALUES (?,?,?,?)',
    [Date.now(), label, category || 'System', entity || null]);
  return true;
}

function getEvents(limit) {
  return all('SELECT ts, label, category, entity FROM event_log ORDER BY ts DESC, id DESC LIMIT ?',
    [limit || 200]);
}

function pruneEvents() {
  const cutoff = Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  run('DELETE FROM event_log WHERE ts < ?', [cutoff]);
}

/* ------------------------- notification log ------------------------ */

function wasNotified(key, localDay) {
  return all('SELECT 1 FROM notification_log WHERE key = ? AND day = ?', [key, localDay]).length > 0;
}

function markNotified(key, localDay) {
  run('INSERT OR IGNORE INTO notification_log (key, day, ts) VALUES (?,?,?)', [key, localDay, Date.now()]);
  return true;
}

/* -------------------------- conversations -------------------------- */

function addMessage(role, text) {
  run('INSERT INTO conversations (ts, role, text) VALUES (?,?,?)', [Date.now(), role, text]);
  return true;
}

function getMessages(limit) {
  const rows = all('SELECT ts, role, text FROM conversations ORDER BY id DESC LIMIT ?', [limit || 40]);
  return rows.reverse();
}

function clearMessages() {
  run('DELETE FROM conversations');
  return true;
}

/* ---------------------------- whole-tree --------------------------- */

/**
 * Everything the screen needs in one object.
 *
 *   items      — { [boxId]: [rows] }
 *   fields     — { [boxId]: { [fieldKey]: value } } for facts boxes
 *   documents  — every attached or imported document, for the library
 */
function loadAll() {
  if (!isInitialized()) return null;

  return {
    owner: config.owner(),
    items: itemsByWidget(),
    completedCoursework: getSetting('completed_coursework', ''),
    fields: fieldsByWidget(),
    libraryDocuments: listEntities('libraryDocument'),
    // Calendar events crossed off here. The calendar is only read, so a
    // tick is a local note, never a change to the owner's Google Calendar.
    completedEvents: getSetting('completed_events', ''),
    weatherPlace: getSetting('weather_place', ''),
    weatherLat: getSetting('weather_lat', ''),
    weatherLon: getSetting('weather_lon', ''),
    newsFeeds: getSetting('news_feeds', '')
  };
}

/* ------------------------- document text ------------------------- */

/**
 * The words out of one document, stored once. `state` is one of:
 *   'read'   — text came out
 *   'ocr'    — read from a picture of paper; words may be misread
 *   'photo'  — a picture with no readable words
 *   'failed' — the reader threw
 */
function putDocumentText(filePath, name, text, state) {
  const body = String(text || '');
  run(
    `INSERT INTO document_text (file_path, name, chars, state, read_at, text)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_path) DO UPDATE SET
       name = excluded.name, chars = excluded.chars, state = excluded.state,
       read_at = excluded.read_at, text = excluded.text`,
    [filePath, name || '', body.length, state || 'read', Date.now(), body]
  );
  run('DELETE FROM document_search WHERE file_path = ?', [filePath]);
  if (body) {
    run('INSERT INTO document_search (name, text, file_path) VALUES (?, ?, ?)',
      [name || '', body, filePath]);
  }
}

function getDocumentText(filePath) {
  return all('SELECT * FROM document_text WHERE file_path = ?', [filePath])[0] || null;
}

function clearDocumentText(filePath) {
  run('DELETE FROM document_text WHERE file_path = ?', [filePath]);
  run('DELETE FROM document_search WHERE file_path = ?', [filePath]);
}

function documentsWithoutText(filePaths) {
  return (filePaths || []).filter((p) => p && !getDocumentText(p));
}

/**
 * Documents containing the words asked about, with the words around each
 * hit. Passed to FTS5 as quoted words so an apostrophe is not a syntax
 * error.
 */
function searchDocuments(query, limit) {
  const words = String(query || '')
    .replace(/"/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];

  const phrase = words.map((w) => '"' + w + '"').join(' ');
  return all(
    `SELECT file_path AS filePath, name,
            snippet(document_search, 1, '[', ']', '…', 18) AS snippet
     FROM document_search
     WHERE document_search MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [phrase, limit || 20]
  );
}

module.exports = {
  init,
  flush,
  transaction,
  backupTo,
  putDocumentText, getDocumentText, clearDocumentText, documentsWithoutText, searchDocuments,
  getMemories, listMemories, addMemory, updateMemory, deleteMemory, touchMemories,
  addProposal, listProposals, getProposal, setProposalStatus, expireProposals,
  recordSpend, monthSpend,
  loadAll,
  itemsByWidget,
  fieldsByWidget,
  getSetting,
  setSetting,
  getSettings,
  isInitialized,
  addEntity,
  updateEntity,
  deleteEntity,
  getEntity,
  listEntities,
  reorderEntity,
  reloadIfChanged,
  logEvent,
  getEvents,
  wasNotified,
  markNotified,
  addMessage,
  getMessages,
  clearMessages,
  uid
};
