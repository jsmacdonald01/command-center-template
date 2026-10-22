// The 8am brief, pushed rather than asked for.
//
// `/brief` still works and is unchanged — this sends the same text, from
// the same function, so the two can never drift into saying different
// things about the same morning.
//
// Costs nothing. brief.js composes in code, so a pushed brief is as free
// as a pulled one and cannot fail because an account ran dry.

const db = require('./db');
const telegram = require('./telegram');

const SEND_HOUR = 8;

// After this hour the morning has gone. If the machine was asleep at 8
// and wakes at half nine, the brief is still useful; at three in the
// afternoon it is a list of things that already happened, and sending it
// would be worse than sending nothing.
const STALE_AFTER_HOUR = 12;

const CHECK_INTERVAL_MS = 60 * 1000;
const KEY = 'morning-brief';

let timer = null;

function localDay(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function check() {
  const now = new Date();
  const hour = now.getHours();
  if (hour < SEND_HOUR || hour >= STALE_AFTER_HOUR) return false;

  const day = localDay(now);
  if (db.wasNotified(KEY, day)) return false;

  // Nothing to send it to. Not an error — they may not have paired a phone.
  if (!telegram.hasToken() || !telegram.boundChatId()) return false;

  let text;
  try {
    text = await telegram.buildBrief();
  } catch (e) {
    return false; // a feed being down is a reason to retry, not to give up
  }

  const res = await telegram.notifyOwner(text);
  if (!res || !res.ok) return false;

  // Marked only on a send that actually landed, so a dropped connection
  // at 8:00 becomes another attempt at 8:01 rather than a missed day.
  db.markNotified(KEY, day);
  db.logEvent('System', 'Morning brief sent');
  return true;
}

function start() {
  check();
  timer = setInterval(check, CHECK_INTERVAL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, check, SEND_HOUR };
