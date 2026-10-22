// A school's calendar feed — coursework due dates, for the Coursework box.
//
// Most school systems (Brightspace/D2L, Canvas, Blackboard, Moodle) offer
// a private "calendar feed" or "iCal" link. Paste it in Settings and the
// box lists graded work with real deadlines. Tuned on Brightspace, whose
// feeds mark things "- Available" and "- Due"; other systems' feeds work
// with whatever shape they have.
//
// Fetched directly rather than routed through Google Calendar. Google
// refreshes subscribed iCal URLs on its own schedule, often 12–24 hours,
// and a due date that arrives a day late is worse than none. Polling it
// here means minutes.
//
// The feed URL is a bearer credential — anyone holding it can read the
// schedule without logging in — so it is stored encrypted with DPAPI
// alongside the other secrets, never in the database.
//
// A local .ics path is also accepted, for a snapshot exported by hand.
// That cannot update, and getFeed reports it as such.

const fs = require('fs');
const path = require('path');
const { app, safeStorage, net } = require('electron');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;

function sourceFile() {
  return path.join(app.getPath('userData'), 'school-feed.bin');
}

function saveSource(value) {
  const clean = String(value || '').trim();
  if (!clean) {
    if (fs.existsSync(sourceFile())) fs.unlinkSync(sourceFile());
    return;
  }
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(clean)
    : Buffer.from(clean, 'utf8');
  fs.writeFileSync(sourceFile(), data);
}

function loadSource() {
  const file = sourceFile();
  if (!fs.existsSync(file)) return null;
  try {
    const data = fs.readFileSync(file);
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(data)
      : data.toString('utf8');
  } catch (e) {
    return null;
  }
}

function hasSource() {
  return !!loadSource();
}

function isUrl(src) {
  return /^(https?|webcal):\/\//i.test(src);
}

async function readSource(src) {
  if (!isUrl(src)) return fs.readFileSync(src, 'utf8');
  // webcal:// is just https:// with a different label
  const url = src.replace(/^webcal:/i, 'https:');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await net.fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`feed returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Unfolds RFC 5545 continuation lines and undoes text escaping. */
function unescapeText(value) {
  return value
    .replace(/\\n/g, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw) {
  const m = raw.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  // Z-suffixed values are UTC; bare ones are already local to the school.
  if (/Z$/.test(raw) && hh) {
    return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
  }
  return new Date(+y, +mo - 1, +d, hh ? +hh : 0, mm ? +mm : 0);
}

// Brightspace appends "- Due" to assignments but not to discussions, so
// keying off that word alone demoted graded work to the quiet list purely
// because of how an instructor worded a title. These decide instead.
//
// Checked first: things with a date that are not work — a reading window
// closing, or the term ending.
const NOT_WORK = /availability\s+(ends|begins)|classes?\s+(end|begin)|holiday|no\s+class/i;
const IS_WORK = /\bdue\b|discussion|quiz|exam|journal|assignment|essay|paper|submit|presentation|lab\b|project/i;

function isCoursework(summary) {
  if (NOT_WORK.test(summary)) return false;
  return IS_WORK.test(summary);
}

/*
 * Graded work, and the material that merely supports it.
 *
 * The feed marks neither. A discussion topic is called "Introduce
 * Yourself" and a slide deck is called "Chapter 1- Introduction to
 * Computers and Programming" — nothing in either says which it is, so
 * keyword lists are the only handle there is.
 *
 * GRADED wins over MATERIAL on purpose: "Video Quiz 1" contains the word
 * video and is still a quiz.
 */
const GRADED = /quiz|exam|assignment|project|discussion|essay|paper|journal|presentation|lab\b|\bdue\b/i;

/*
 * Material that names the work it supports, and so reads as graded.
 *
 * "Introduce Yourself Instruction Video: See this before the 'Introduce
 * Yourself' Assignment" contains the word Assignment and survived a
 * GRADED-first rule. These win over that.
 */
const IS_MATERIAL = /instruction video|tutorial\b|powerpoint|video notes|syllabus|lecture|see this/i;

/*
 * Softer material markers, checked only when nothing graded matched.
 *
 * The chapter pattern is the textbook's own naming: "Chapter 2-
 * Introduction to C++" is the reading, while "Chapter 2 Quiz" is the work
 * on it. A number followed by a dash is the tell, and GRADED is tested
 * first so the quizzes are never caught by it.
 */
const MATERIAL = /slides?\b|setup|what is |^chapter\s*\d+\s*[-–—:]/i;

/**
 * Is this a thing they have to hand in, rather than a thing to read?
 *
 * Anything left unmatched by both lists is kept. A dated item inside a
 * course is more likely to be work than not, and the cost of the two
 * mistakes is not equal: a missing deadline is worse than a spare row.
 */
function isGradedWork(summary) {
  if (IS_MATERIAL.test(summary)) return false;
  if (GRADED.test(summary)) return true;
  return !MATERIAL.test(summary);
}

/**
 * Is this date the day the work opens, or the day it is owed?
 *
 * Brightspace puts both in the same calendar and distinguishes them only
 * in the title: "- Available" when a thing unlocks, "- Due" when it is
 * owed. Eleven course materials landed under "due today" on the first day
 * of the Fall term because nothing here read that word.
 */
function opensRatherThanDue(summary) {
  return /-\s*available\s*$/i.test(String(summary || '').trim());
}

/** The title without the word that classified it. */
function cleanTitle(summary) {
  return String(summary || '')
    .replace(/\s*-\s*(available|due)\s*$/i, '')
    .trim();
}

/**
 * "HIST-1301 2W01 1 United States History I" → "HIST 1301".
 *
 * The course code is the part they use to name a class, and the section
 * number and long title are noise on a one-line row.
 */
function courseFrom(location) {
  const m = String(location || '').match(/\b([A-Z]{2,5})-(\d{4})\b/);
  return m ? `${m[1]} ${m[2]}` : '';
}

/**
 * The closing half of an availability window.
 *
 * D2L emits every quiz twice on its due date — once as the quiz, once as
 * "X - Availability Ends" — so the list read as double-booked.
 */
function isWindowClosing(summary) {
  return /-\s*availability\s+ends\s*$/i.test(String(summary || '').trim());
}

function parse(text) {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  return unfolded.split('BEGIN:VEVENT').slice(1).map((block) => {
    const field = (name) => {
      const m = block.match(new RegExp(`^${name}[^:\\n]*:(.*)$`, 'm'));
      return m ? m[1].trim() : '';
    };
    const start = parseDate(field('DTSTART'));
    const uid = field('UID');
    const iso = start ? start.toISOString() : null;
    const summary = unescapeText(field('SUMMARY'));
    return {
      // Stable across refetches, so crossing something off survives the
      // next poll. UID alone repeats for recurring items, so the start
      // date is folded in.
      id: `${uid || summary}|${iso}`,
      title: cleanTitle(summary),
      start: iso,
      due: isCoursework(summary),
      // 'opens' rows are an invitation, not a deadline.
      kind: opensRatherThanDue(summary) ? 'opens' : 'due',
      // Which class it belongs to. D2L puts the course in LOCATION —
      // "HIST-1301 2W01 1 United States History I" — and nowhere in the
      // title, which is why every item read as belonging to nothing.
      course: courseFrom(unescapeText(field('LOCATION'))),
      // Campus-wide notices come through the same feed with a community
      // group in that field instead of a course.
      campusWide: /community group/i.test(field('LOCATION'))
    };
  }).filter((e) => e.title && e.start);
}

/**
 * Upcoming coursework, soonest first. Campus-wide events sit in the same
 * feed as real assignments, so anything already past is dropped and the
 * caller decides how much of the rest to show.
 */
async function get(days) {
  const src = loadSource();
  if (!src) return { ok: false, error: 'no_source' };

  try {
    const text = await readSource(src);
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (days || 30));
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const events = parse(text)
      .filter((e) => {
        const d = new Date(e.start);
        return d >= today && d <= cutoff;
      })
      /*
       * What survives is work with a deadline, and only that. Three
       * things go, because each reads like a deadline and is not one:
       *
       *   - anything whose date is only the day it unlocks
       *   - the "Availability Ends" twin Brightspace emits beside a quiz
       *   - campus notices, which arrive through the same feed
       *
       * The day something opens is never shown as the day it is due.
       */
      .filter((e) => e.kind !== 'opens'
        && !isWindowClosing(e.title)
        && !e.campusWide
        && isGradedWork(e.title))
      .sort((a, b) => a.start.localeCompare(b.start));

    return { ok: true, events, live: isUrl(src), fetchedAt: Date.now() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { get, saveSource, loadSource, hasSource, isUrl };
