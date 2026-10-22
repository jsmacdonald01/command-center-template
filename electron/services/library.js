// The library: every document the owner has, in one place, searchable —
// so they, the agent and Claude chat can answer questions from what their
// paperwork actually says.
//
// The library **reads** every documents box rather than owning them. A
// documents box on a page keeps the handful of files that page is about;
// the library is one more list for everything that belongs to no page, plus
// a view across all of them. Nothing is moved and nothing is copied twice.
//
// Text is pulled out once, when a document arrives, and kept in
// `document_text`, so searching five hundred files is instant.

const fs = require('fs');
const path = require('path');
const db = require('./db');
const config = require('./config');
const attachments = require('./attachments');
const pdfText = require('./pdf-text');
const ocr = require('./ocr');

// Everything worth trying to read. Other files can be imported and kept,
// they simply have no words behind them.
const READABLE = ['.pdf', '.txt', '.md', '.csv', '.json', '.log'];

function isReadable(name) {
  return READABLE.includes(path.extname(String(name || '')).toLowerCase());
}

/**
 * Every document the library can see: its own list, plus every documents
 * box on every page.
 *
 * `where` is what the owner would call the place it lives — "Paperwork
 * (Money)" — because a search result saying only "lease.pdf" is half an
 * answer.
 */
function sources(data) {
  const out = [];
  // `type` and `listPath` ride along so the library panel can rename a
  // document through the app's ordinary update path.
  const add = (list, where, type, listPath) => {
    (list || []).forEach((f) => {
      if (!f.filePath) return;
      out.push({
        id: f.id,
        name: f.name,
        filePath: f.filePath,
        size: f.size,
        where,
        type,
        listPath,
        note: f.note || '',
        addedAt: f.addedAt || null,
        inLibraryList: where === 'Library'
      });
    });
  };

  add(data.libraryDocuments, 'Library', 'libraryDocument', 'libraryDocuments');
  Object.entries(data.items || {}).forEach(([widgetId, rows]) => {
    add(rows, config.describe(widgetId), 'item', `items.${widgetId}`);
  });
  return out;
}

/**
 * Reads one document and stores its words.
 *
 * Returns which of three things happened rather than a bare string —
 * 'read', 'photo' or 'failed'. A file with no text and a file that broke
 * the reader both come back empty, and only one of those is worth anyone's
 * attention.
 */
async function indexOne(doc) {
  if (!doc || !doc.filePath) return { state: 'failed', error: 'no path' };
  if (!fs.existsSync(doc.filePath)) {
    db.putDocumentText(doc.filePath, doc.name, '', 'failed');
    return { state: 'failed', error: 'file is gone' };
  }

  const ext = path.extname(doc.filePath).toLowerCase();

  try {
    let text = '';
    if (ext === '.pdf') {
      text = await pdfText.extract(doc.filePath);
      // Judged on the file, never on the name. The name is a label they can
      // rename to anything — "Lease agreement" with no extension on it —
      // and reading it as the file type would make a renamed text file
      // look like a photograph.
    } else if (isReadable(doc.filePath)) {
      text = fs.readFileSync(doc.filePath, 'utf8');
    } else {
      db.putDocumentText(doc.filePath, doc.name, '', 'photo');
      return { state: 'photo' };
    }

    // No text in it means a picture of paper, and a picture can still be
    // read — by OCR, which is slow enough that it is only ever the second
    // thing tried. Marked 'ocr' rather than 'read' because the difference
    // matters to them: these words were guessed at from an image and can be
    // wrong, and an answer built on them should say so.
    if ((!text || !text.trim()) && ext === '.pdf' && ocr.available()) {
      try {
        const scanned = await ocr.extract(doc.filePath);
        if (scanned && scanned.trim()) {
          db.putDocumentText(doc.filePath, doc.name, scanned, 'ocr');
          return { state: 'ocr', chars: scanned.length };
        }
      } catch (e) {
        // A failed read is not a blank page. Say which it was.
        db.putDocumentText(doc.filePath, doc.name, '', 'failed');
        return { state: 'failed', error: 'OCR failed: ' + e.message };
      }
    }

    const state = text && text.trim() ? 'read' : 'photo';
    db.putDocumentText(doc.filePath, doc.name, text, state);
    return { state, chars: (text || '').length };
  } catch (e) {
    db.putDocumentText(doc.filePath, doc.name, '', 'failed');
    return { state: 'failed', error: e.message };
  }
}

/**
 * Reads anything that has never been read.
 *
 * Runs at startup, so their existing documents are searchable without them
 * doing anything. Only the unread ones, so it costs nothing on every later
 * launch — and `force` re-reads everything, which is what to use after the
 * reader itself changes.
 */
async function indexMissing(data, force) {
  const docs = sources(data);
  // Anything never read, plus anything previously written off as a
  // photograph. That second part is what let OCR reach documents already
  // on file: they had a row saying 'photo, 0 characters' from before OCR
  // existed, and "has a row" was enough to skip them forever.
  //
  // It costs a second or so per genuinely unreadable document on each
  // launch, which is the right trade — it is bounded by how many of those
  // they have, it needs no flag to remember, and it heals itself if reading
  // ever gets better again.
  const todo = force ? docs : docs.filter((d) => {
    const stored = db.getDocumentText(d.filePath);
    return !stored || stored.state === 'photo';
  });
  const result = { looked: docs.length, read: 0, ocr: 0, photos: 0, failed: 0 };

  for (const doc of todo) {
    const got = await indexOne(doc);
    if (got.state === 'read') result.read++;
    else if (got.state === 'ocr') result.ocr++;
    else if (got.state === 'photo') result.photos++;
    else result.failed++;
  }
  return result;
}

/** Is this file already in the library, by content size and name? */
function alreadyHave(docs, name, size) {
  return docs.some((d) => d.name === name && Number(d.size) === Number(size));
}

/**
 * Brings files into the library: copies each one in, reads it, records it.
 *
 * Reports three numbers rather than one, because "47 files" hides what the owner
 * needs to know — how many are photographs they cannot search, and how many
 * they already had. Importing the same paper twice is easy to do without
 * noticing.
 */
async function importPaths(paths) {
  const data = db.loadAll();
  const existing = sources(data);

  const report = { added: 0, duplicates: 0, photos: 0, failed: 0, names: [] };

  for (const source of paths || []) {
    let stat;
    try {
      stat = fs.statSync(source);
    } catch (e) {
      report.failed++;
      continue;
    }
    if (stat.isDirectory()) continue;

    const name = path.basename(source);
    if (alreadyHave(existing, name, stat.size)) {
      report.duplicates++;
      continue;
    }

    let stored;
    try {
      stored = attachments.store(source);
    } catch (e) {
      report.failed++;
      continue;
    }

    const record = db.addEntity('libraryDocument', 'libraryDocuments', {
      name: stored.name,
      filePath: stored.filePath,
      size: stored.size,
      note: '',
      addedAt: Date.now()
    });

    const got = await indexOne({
      name: stored.name, filePath: stored.filePath, size: stored.size
    });
    if (got.state === 'photo') report.photos++;
    if (got.state === 'failed') report.failed++;

    report.added++;
    report.names.push(stored.name);
    existing.push({ name: stored.name, size: stored.size });
    if (!record) report.failed++;
  }

  if (report.added) {
    db.logEvent('Document', 'Added to library',
      `${report.added} file${report.added === 1 ? '' : 's'}`);
  }
  return report;
}

/** Every file directly inside a folder, and inside its subfolders. */
function filesUnder(dir, depth) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  const out = [];
  names.forEach((name) => {
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch (e) { return; }
    // Ten deep is far past anything real and stops a folder that links to
    // its own parent from walking forever.
    if (stat.isDirectory()) {
      if ((depth || 0) < 10) out.push(...filesUnder(full, (depth || 0) + 1));
    } else {
      out.push(full);
    }
  });
  return out;
}

async function importFolder(dir) {
  return importPaths(filesUnder(dir, 0));
}

/**
 * What they asked about, and which documents say it.
 *
 * Every hit carries the place it came from and the words around it, so an
 * answer can be checked rather than taken on trust.
 */
function search(query, limit) {
  const data = db.loadAll();
  const byPath = new Map(sources(data).map((d) => [d.filePath, d]));

  return db.searchDocuments(query, limit).map((hit) => {
    const doc = byPath.get(hit.filePath) || {};
    return {
      name: doc.name || hit.name,
      where: doc.where || 'Unknown',
      filePath: hit.filePath,
      snippet: String(hit.snippet || '').replace(/\s+/g, ' ').trim()
    };
  });
}

/** The library as the panel shows it: every document, with its read state. */
function list() {
  const data = db.loadAll();
  return sources(data).map((doc) => {
    const stored = db.getDocumentText(doc.filePath);
    return Object.assign({}, doc, {
      state: stored ? stored.state : 'unread',
      chars: stored ? stored.chars : 0,
      missing: !attachments.exists(doc.filePath)
    });
  });
}

/** Counts for the panel's one-line summary. */
function summary() {
  const docs = list();
  return {
    total: docs.length,
    // 'read' is the searchable count, so text recovered from a scan belongs
    // in it. `ocr` is reported alongside rather than instead, because the owner
    // should be able to see how much of what the agent knows was guessed
    // at from a picture.
    read: docs.filter((d) => d.state === 'read' || d.state === 'ocr').length,
    ocr: docs.filter((d) => d.state === 'ocr').length,
    photos: docs.filter((d) => d.state === 'photo').length,
    unread: docs.filter((d) => d.state === 'unread').length,
    failed: docs.filter((d) => d.state === 'failed').length
  };
}

module.exports = {
  sources, indexOne, indexMissing, importPaths, importFolder,
  search, list, summary, filesUnder
};
