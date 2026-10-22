// The one place a Command Center tool is defined.
//
// Three callers use this list, and they must not get the same permissions:
//
//   Claude Desktop (mcp/mcp-server.js) — the owner at the desk. Runs
//                 anything directly.
//   The agent    — the in-app assistant. May run `read` tools freely and
//                 may NEVER run a `write` tool. All it can do with a write
//                 is prepare a proposal for the owner to approve.
//   Claude chat  — the website and phone, through the doorway
//                 (services/remote-mcp.js). Offered `read` tools only.
//
// So: a tool declares what it *is*. The caller decides what it may *do*.
//
// The tools speak in boxes ("widgets") from config/command-center.json, so
// they work for any layout. get_overview is how a model learns which boxes
// exist and what they are called.

const { z } = require('zod');
const db = require('../../services/db');
const config = require('../../services/config');
const pdfText = require('../../services/pdf-text');
const library = require('../../services/library');
const vault = require('../../services/vault');

/* ----------------------------- helpers ----------------------------- */

function requireData() {
  const data = db.loadAll();
  if (!data) throw new Error('Command Center has no data yet — open the desktop app once first.');
  return data;
}

/** Box types that hold rows in the items table. */
const ROW_TYPES = ['checklist', 'list', 'money', 'documents'];

/**
 * Finds a box by id or by title, case-insensitively, so a model can say
 * "Bills" without knowing the id is "bills".
 */
function findWidget(nameOrId) {
  const wanted = String(nameOrId || '').trim().toLowerCase();
  const all = config.widgets();
  return all.find((w) => w.id.toLowerCase() === wanted)
    || all.find((w) => String(w.title || '').toLowerCase() === wanted)
    || all.find((w) => String(w.title || '').toLowerCase().includes(wanted))
    || null;
}

function requireWidget(nameOrId, types) {
  const w = findWidget(nameOrId);
  if (!w) throw new Error(`No box called "${nameOrId}". Use get_overview to see the boxes.`);
  if (types && !types.includes(w.type)) {
    throw new Error(`"${w.title}" is a ${w.type} box, which does not hold rows.`);
  }
  return w;
}

/** A row as a model should see it: only the fields that box type uses. */
function present(type, row) {
  if (type === 'checklist') return { id: row.id, text: row.text, done: !!row.done };
  if (type === 'money') return { id: row.id, name: row.text, amount: row.amount };
  if (type === 'documents') return { id: row.id, name: row.name };
  return {
    id: row.id,
    text: row.text,
    note: row.note || undefined,
    date: row.date || undefined
  };
}

/**
 * Drops fields the owner never gave. A model asked for a location it was
 * not told will sometimes write "TBD" — worse than blank, because it looks
 * like information.
 */
const PLACEHOLDER = /^(tbd|tba|n\/?a|none|unknown|not specified|unspecified|-+|\?+)$/i;

function omitPlaceholders(args, fields) {
  const out = { ...args };
  fields.forEach((f) => {
    const v = out[f];
    if (v === undefined || v === null) { delete out[f]; return; }
    const s = String(v).trim();
    if (!s || PLACEHOLDER.test(s)) delete out[f];
  });
  return out;
}

/** Models sometimes send the *string* "false", which is truthy. */
function asBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^(true|yes|1)$/i.test(v.trim());
  return !!v;
}

/**
 * Is there a real Electron app around us? The Claude Desktop connection
 * runs Electron as plain Node, which can open the database but cannot
 * decrypt the Google sign-in — so the calendar and mail tools only work
 * inside the app, and say so in words anywhere else.
 */
function insideApp() {
  try {
    const electron = require('electron');
    return !!(electron && electron.app && typeof electron.app.getPath === 'function');
  } catch (e) {
    return false;
  }
}

/* ------------------------------ tools ------------------------------ *
 *
 * risk: 'read'  — returns information, changes nothing
 * risk: 'write' — changes stored data. The agent proposes, never runs.
 * needsApp     — reaches Google, so it only works inside Command Center.
 * surfaces     — where a tool may run; omitted means everywhere.
 *
 * `summarise` is the one line the owner reads on an approval card.
 * ------------------------------------------------------------------ */

const TOOLS = [
  /* ------------------------------ read ----------------------------- */
  {
    name: 'get_overview',
    risk: 'read',
    description:
      'Start here. Lists every page and every box on it — its id, title and type — with '
      + 'how many rows each holds and the values of any facts boxes. Use the titles or ids '
      + 'it returns with read_box and add_to_box.',
    schema: {},
    handler: async () => {
      const data = requireData();
      return {
        owner: data.owner || undefined,
        pages: (config.load().pages || []).map((p) => ({
          page: p.title,
          boxes: (p.widgets || []).map((w) => {
            const rows = (data.items[w.id] || []);
            const out = { id: w.id, title: w.title, type: w.type };
            if (ROW_TYPES.includes(w.type)) out.rows = rows.length;
            if (w.type === 'checklist') out.open = rows.filter((r) => !r.done).length;
            if (w.type === 'money') out.total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
            if (w.type === 'facts') out.values = data.fields[w.id] || {};
            if (w.type === 'notes') out.text = (data.fields[w.id] || {}).text || '';
            return out;
          })
        }))
      };
    }
  },
  {
    name: 'read_box',
    risk: 'read',
    description:
      'Read everything in one box by its title or id, e.g. "Bills" or "To do". Checklists '
      + 'return items and whether each is done; money boxes return names, amounts and a total; '
      + 'facts boxes return their labelled values; documents boxes return file names.',
    schema: { box: z.string().describe('The box title or id, from get_overview') },
    handler: async ({ box }) => {
      const data = requireData();
      const w = requireWidget(box);
      const fields = data.fields[w.id] || {};
      if (w.type === 'facts') {
        return {
          box: w.title,
          values: (w.fields || []).map((f) => ({ label: f.label, value: fields[f.key] || '' }))
        };
      }
      if (w.type === 'notes') return { box: w.title, text: fields.text || '' };
      if (!ROW_TYPES.includes(w.type)) {
        return { box: w.title, type: w.type, note: 'This box shows live information and stores nothing to read.' };
      }
      const rows = (data.items[w.id] || []).map((r) => present(w.type, r));
      const out = { box: w.title, type: w.type, rows };
      if (w.type === 'money') out.total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
      return out;
    }
  },
  {
    name: 'get_recent_events',
    risk: 'read',
    description: 'Recent entries from the Log — what changed in Command Center and when.',
    schema: { limit: z.number().optional().describe('How many entries, default 50') },
    handler: async ({ limit }) => db.getEvents(limit || 50)
  },

  /* ------------------------ calendar & email ----------------------- *
   * In the app only. Email is raw text from anyone, so it never goes to
   * Telegram, where it would rest on someone else's servers.
   * ----------------------------------------------------------------- */
  {
    name: 'search_calendar',
    risk: 'read',
    surfaces: ['app'],
    needsApp: true,
    description:
      'Look at any window of the Google Calendar, past or future. Use for "what did I do '
      + 'in June" or "anything in October".',
    schema: {
      start: z.string().describe('YYYY-MM-DD'),
      end: z.string().describe('YYYY-MM-DD')
    },
    handler: async ({ start, end }) => {
      const calendar = require('../../services/calendar-service');
      if (!calendar.isConnected()) throw new Error('Google Calendar is not connected.');
      const res = await calendar.getRange(start, end);
      // Local time, spelled out — handed a UTC timestamp, a model gets the
      // conversion wrong.
      const when = (iso, allDay) => {
        const d = new Date(iso);
        return allDay
          ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' (all day)'
          : d.toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit'
          });
      };
      return (res.events || []).map((e) => ({
        id: e.id.split(':')[0],
        title: e.title,
        when: when(e.start, e.allDay),
        location: e.location || undefined,
        notes: e.description || undefined
      }));
    }
  },
  {
    name: 'search_email',
    risk: 'read',
    surfaces: ['app'],
    needsApp: true,
    description:
      'Search the Gmail mailbox with Gmail search syntax — "from:bank.com", "is:unread", '
      + '"after:2026/06/01 invoice". Returns sender, subject, date and the opening line. '
      + 'Read-only: you cannot send, reply or delete.',
    schema: {
      query: z.string().describe('A Gmail search query'),
      limit: z.number().optional().describe('How many, default 15, max 25')
    },
    handler: async ({ query, limit }) => {
      const gmail = require('../../services/gmail-service');
      if (!gmail.isConnected()) throw new Error('Gmail is not connected.');
      const res = await gmail.search(query, limit);
      if (res.error) throw new Error(res.error);
      return res.emails;
    }
  },

  /* --------------------------- notebook ---------------------------- */
  {
    name: 'list_notes',
    risk: 'read',
    description: 'List the notes in the Obsidian notebook. Use first, then read the one you need.',
    schema: {},
    handler: async () => (vault.configured() ? vault.list() : [])
  },
  {
    name: 'read_note',
    risk: 'read',
    description: 'Read one notebook note by the name list_notes gave.',
    schema: { name: z.string().describe('e.g. "Handoffs/Next Session"') },
    handler: async ({ name }) => vault.read(name, 8000)
  },
  {
    name: 'search_notes',
    risk: 'read',
    description: 'Search the notebook for a word or phrase. Returns matching notes and lines.',
    schema: { query: z.string() },
    handler: async ({ query }) => (vault.configured() ? vault.search(query) : [])
  },

  /* --------------------------- documents --------------------------- */
  {
    name: 'search_documents',
    risk: 'read',
    description:
      'Search inside every attached document — every documents box and the library — for '
      + 'words in the text. Returns the document, where it lives, and the words around each hit. '
      + 'Use this FIRST for any question about what paperwork says, then read_document for the '
      + 'whole thing. Plain word matching, so try more than one wording before concluding '
      + 'nothing is there. Scanned pages are searchable through text read from the picture, '
      + 'which can misspell words.',
    schema: { query: z.string().describe('Words to look for') },
    handler: async ({ query }) => {
      const hits = library.search(query, 15);
      if (!hits.length) {
        return {
          query,
          hits: [],
          note: 'No document contains those words. They may be worded differently, or the '
            + 'document may be a picture with no text in it.'
        };
      }
      return { query, hits };
    }
  },
  {
    name: 'list_documents',
    risk: 'read',
    description:
      'List every attached document and where it lives, and whether its text can be read. '
      + 'Prefer search_documents when looking for what a document says.',
    schema: {},
    handler: async () => library.list().map((d) => ({
      name: d.name,
      where: d.where,
      readable: d.state === 'read' || d.state === 'ocr',
      note: d.state === 'ocr' ? 'read from a scan — words may be misread'
        : d.state === 'photo' ? 'a picture of paper — no text in it'
          : d.state === 'failed' ? 'could not be read'
            : d.state === 'unread' ? 'not read yet' : undefined
    }))
  },
  {
    name: 'read_document',
    risk: 'read',
    description:
      'Read the text of one document by the name list_documents gave. A long document comes '
      + 'back in parts — when `parts` is more than 1, call again with the next `part` until you '
      + 'have read all of it before answering from it.',
    schema: {
      name: z.string(),
      part: z.number().int().min(1).optional().describe('Which part of a long document, starting at 1')
    },
    handler: async ({ name, part }) => {
      const docs = library.list();
      const wanted = String(name || '').toLowerCase();
      const file = docs.find((f) => String(f.name || '').toLowerCase() === wanted)
        || docs.find((f) => String(f.name || '').toLowerCase().includes(wanted));
      if (!file) throw new Error('No document called "' + name + '".');

      // The stored copy first: read once when the document arrived. A scan's
      // words are stored as 'ocr', and re-reading the PDF would find nothing.
      const stored = db.getDocumentText(file.filePath);
      const fromScan = !!(stored && stored.state === 'ocr' && stored.text);
      const text = (stored && (stored.state === 'read' || fromScan) && stored.text)
        ? stored.text
        : await pdfText.extract(file.filePath);

      if (!text) {
        return {
          document: file.name,
          text: '',
          note: 'No text in this file — it is a picture, so the words cannot be read. '
            + 'Say that rather than guessing at what it says.'
        };
      }
      const PART = 12000;
      const parts = Math.max(1, Math.ceil(text.length / PART));
      const n = Math.min(Math.max(1, part || 1), parts);
      const notes = [];
      if (n < parts) notes.push(`Part ${n} of ${parts}. Call read_document again with part: ${n + 1} for the rest.`);
      if (fromScan) notes.push('Read from a scan. Words, names and numbers may be misread.');
      return {
        document: file.name,
        part: n,
        parts,
        text: text.slice((n - 1) * PART, n * PART),
        note: notes.join(' ') || undefined
      };
    }
  },

  /* -------------------- Google: create and change ------------------ *
   * Approval like every write, and no send: a draft can be read and
   * deleted, a sent email cannot.
   * ----------------------------------------------------------------- */
  {
    name: 'create_calendar_event',
    risk: 'write',
    needsApp: true,
    description:
      'Put a new event on the Google Calendar. Times are local. Only fill in what the owner '
      + 'actually said — leave location and notes out rather than writing "TBD" or a guess.',
    schema: {
      title: z.string(),
      start: z.string().describe('YYYY-MM-DD HH:MM, or YYYY-MM-DD for an all-day event'),
      end: z.string().optional().describe('Defaults to one hour after the start'),
      location: z.string().optional(),
      notes: z.string().optional(),
      allDay: z.boolean().optional()
    },
    summarise: ({ title, start, location }) => {
      const place = location && !PLACEHOLDER.test(String(location).trim()) ? ` at ${location}` : '';
      return `Add to calendar: "${title}" on ${start}${place}`;
    },
    handler: async (args) => {
      const calendar = require('../../services/calendar-service');
      const clean = omitPlaceholders(args, ['location', 'notes', 'end']);
      return calendar.createEvent({ ...clean, allDay: asBool(args.allDay) });
    },
    verify: async (args, result) => {
      const calendar = require('../../services/calendar-service');
      const found = await calendar.getEvent(result.id);
      return !!found && found.title === args.title;
    }
  },
  {
    name: 'update_calendar_event',
    risk: 'write',
    needsApp: true,
    description:
      'Change an existing calendar event. Find it with search_calendar first to get its id.',
    schema: {
      eventId: z.string().describe('From search_calendar'),
      title: z.string().optional(),
      start: z.string().optional().describe('YYYY-MM-DD HH:MM'),
      end: z.string().optional(),
      location: z.string().optional(),
      notes: z.string().optional()
    },
    summarise: ({ title, start }) =>
      `Change calendar event${title ? `: "${title}"` : ''}${start ? ` to ${start}` : ''}`,
    handler: async (args) => {
      const calendar = require('../../services/calendar-service');
      return calendar.updateEvent(omitPlaceholders(args, ['location', 'notes', 'title', 'start', 'end']));
    },
    verify: async (args, result) => {
      const calendar = require('../../services/calendar-service');
      return !!(await calendar.getEvent(result.id));
    }
  },
  {
    name: 'draft_email',
    risk: 'write',
    surfaces: ['app'],
    needsApp: true,
    description:
      'Write an email and leave it in the Gmail Drafts folder. It is NOT sent — the owner '
      + 'reads it and sends it themselves. Say so plainly. You cannot send email.',
    schema: {
      to: z.string().describe('Recipient address'),
      subject: z.string(),
      body: z.string().describe('Plain text, direct, no filler.')
    },
    summarise: ({ to, subject }) => `Draft an email to ${to} — "${subject}" (not sent)`,
    handler: async (args) => {
      const gmail = require('../../services/gmail-service');
      return gmail.createDraft(args);
    },
    verify: async (args, result) => {
      const gmail = require('../../services/gmail-service');
      return !!(await gmail.getDraft(result.draftId));
    }
  },

  /* ------------------------------ write ---------------------------- */
  {
    name: 'add_to_box',
    risk: 'write',
    description:
      'Add a row to a checklist, list or money box, by its title or id. For money boxes give '
      + '`amount`; for lists, `note` and `date` are optional.',
    schema: {
      box: z.string().describe('The box title or id, from get_overview'),
      text: z.string().describe('The item, or for money boxes its name'),
      amount: z.number().optional().describe('Money boxes only'),
      note: z.string().optional(),
      date: z.string().optional().describe('YYYY-MM-DD')
    },
    summarise: ({ box, text, amount }) =>
      `Add to ${box}: "${text}"${amount !== undefined ? ` — $${amount}` : ''}`,
    handler: async ({ box, text, amount, note, date }) => {
      const w = requireWidget(box, ['checklist', 'list', 'money']);
      const clean = omitPlaceholders({ note, date }, ['note', 'date']);
      const rec = db.addEntity('item', w.id, {
        text, done: false, amount: w.type === 'money' ? amount : undefined, ...clean
      });
      return { id: rec.id, box: w.title, text };
    },
    verify: async (args, result) => !!db.getEntity('item', result.id)
  },
  {
    name: 'update_row',
    risk: 'write',
    description:
      'Change one row in a box — its text, amount, note, date, or tick it done. Use read_box '
      + 'first to get the row id.',
    schema: {
      box: z.string(),
      id: z.string().describe('The row id from read_box'),
      text: z.string().optional(),
      amount: z.number().optional(),
      note: z.string().optional(),
      date: z.string().optional(),
      done: z.boolean().optional()
    },
    summarise: ({ box, text, amount, done }) => {
      const what = [text && `"${text}"`, amount !== undefined && `$${amount}`,
        done !== undefined && (asBool(done) ? 'done' : 'not done')].filter(Boolean).join(', ');
      return `Change a row in ${box}${what ? ` to ${what}` : ''}`;
    },
    handler: async ({ box, id, ...patch }) => {
      const w = requireWidget(box, ['checklist', 'list', 'money']);
      const row = db.getEntity('item', id);
      if (!row || row.widget !== w.id) throw new Error(`No row ${id} in ${w.title}.`);
      if (patch.done !== undefined) patch.done = asBool(patch.done);
      return db.updateEntity('item', id, patch);
    },
    verify: async (args, result) => !!result && !!db.getEntity('item', args.id)
  },
  {
    name: 'set_fact',
    risk: 'write',
    description:
      'Set one labelled value in a facts box, e.g. box "Savings", field "Savings goal", '
      + 'value "$5,000". Use read_box to see the field labels.',
    schema: {
      box: z.string(),
      field: z.string().describe('The field label or key'),
      value: z.string()
    },
    summarise: ({ box, field, value }) => `Set ${field} in ${box} to "${value}"`,
    handler: async ({ box, field, value }) => {
      const w = requireWidget(box, ['facts']);
      const wanted = String(field).toLowerCase();
      const def = (w.fields || []).find((f) => f.key.toLowerCase() === wanted
        || String(f.label || '').toLowerCase() === wanted);
      if (!def) throw new Error(`"${w.title}" has no field called "${field}".`);
      db.setSetting(`field:${w.id}:${def.key}`, value);
      return { box: w.title, field: def.label || def.key, value, key: `field:${w.id}:${def.key}` };
    },
    verify: async (args, result) => db.getSetting(result.key, null) === args.value
  },
  {
    name: 'log_event',
    risk: 'write',
    description: 'Write an entry to the Log.',
    schema: { label: z.string().describe('Short event label') },
    summarise: ({ label }) => `Log: "${label}"`,
    handler: async ({ label }) => {
      db.logEvent('AI', label, 'via Claude');
      return { label };
    },
    verify: async () => true
  }
];

/* ---------------------------- accessors ---------------------------- */

const byName = new Map(TOOLS.map((t) => [t.name, t]));

function get(name) {
  return byName.get(name) || null;
}

function list(risk) {
  return risk ? TOOLS.filter((t) => t.risk === risk) : TOOLS.slice();
}

/**
 * Runs a tool and, for writes, checks the change actually landed. Whether
 * a tool *may* run is the caller's decision — see the top of this file.
 */
async function execute(name, args) {
  const tool = get(name);
  if (!tool) throw new Error('Unknown tool: ' + name);

  if (tool.needsApp && !insideApp()) {
    throw new Error(
      'Calendar and mail are only reachable from inside Command Center, which holds '
      + 'the Google sign-in. Ask the agent in the app instead.'
    );
  }

  const result = await tool.handler(args || {});

  if (tool.risk === 'write') {
    db.flush();
    let verified = false;
    try {
      verified = tool.verify ? await tool.verify(args || {}, result) : true;
    } catch (e) {
      verified = false;
    }
    return { result, verified };
  }

  return { result, verified: true };
}

module.exports = { TOOLS, get, list, execute, insideApp };
