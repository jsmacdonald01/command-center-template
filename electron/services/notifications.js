// Initiative layer: proactive nudges.
//
// Two V1 bugs fixed here. Dates are compared in LOCAL time (V1 used
// toISOString(), which rolls over at 7pm Central and fired a day early).
// Dedupe lives in notification_log, not the event log, so pruning history
// can never cause a notification to fire twice.

const { Notification } = require('electron');
const db = require('./db');
const calendarService = require('./calendar-service');

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
let timer = null;

function localDay(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fire(key, title, body) {
  const day = localDay();
  if (db.wasNotified(key, day)) return false;
  db.markNotified(key, day);

  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show();
    }
  } catch (e) {
    // A failed notification must not break the check loop.
  }
  db.logEvent('Alert', title, body);
  return true;
}

/**
 * A Windows notification half an hour before each timed calendar event
 * today. Only things visible in the app raise an alert — anything else
 * would announce something that cannot be found on screen.
 */
async function check() {
  if (!calendarService.isConnected()) return;
  try {
    const res = await calendarService.getDay();
    (res.events || []).forEach((e) => {
      if (e.allDay) return;
      const when = new Date(e.start);
      const mins = Math.round((when - Date.now()) / 60000);
      // Fire once, in the half hour before it starts.
      if (mins > 0 && mins <= 30) {
        fire(`cal:${e.id}`, e.title, `Starts at ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
      }
    });
  } catch (e) {
    // Calendar being unreachable must not stop the rest of the check.
  }
}

function start() {
  check();
  timer = setInterval(check, CHECK_INTERVAL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, check, localDay };
