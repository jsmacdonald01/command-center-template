// Google Calendar via the real API.
//
// V1 read a public .ics feed to avoid OAuth. That required the calendar to
// be publicly visible, and Google caches those feeds so hard that a new
// event could take hours to appear. This uses the same OAuth machinery
// Gmail already uses, so the calendar can stay private and events show up
// within seconds.
//
// Read-only scope: the app displays the calendar, it does not write to it.

const { google } = require('googleapis');
const googleOAuth = require('./google-oauth');

const SCOPE_KEY = 'calendar';
// calendar.events lets the agent create and change events. Deliberately not
// the full 'calendar' scope, which would also let it delete calendars.
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', WRITE_SCOPE];

async function connect() {
  return googleOAuth.connect(SCOPE_KEY, SCOPES);
}

function disconnect() {
  return googleOAuth.disconnect(SCOPE_KEY);
}

function isConnected() {
  return googleOAuth.isConnected(SCOPE_KEY);
}

function hasClientConfig() {
  return !!googleOAuth.loadClientConfig();
}

const { isAuthFailure } = googleOAuth;

function normalize(item) {
  const startRaw = item.start || {};
  const endRaw = item.end || {};
  const allDay = !!startRaw.date && !startRaw.dateTime;

  // All-day events come back as plain dates; parse them as local midnight
  // so they don't slide a day in a negative UTC offset.
  const toDate = (v) => {
    if (!v) return null;
    if (v.dateTime) return new Date(v.dateTime);
    const [y, m, d] = v.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const start = toDate(startRaw);
  const end = toDate(endRaw) || start;

  // Google allows basic HTML in descriptions. Strip it to plain text —
  // this is read in a list, not rendered, and injecting markup into the
  // renderer from an external source is not worth the risk.
  const description = String(item.description || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{2,}/g, '\n')
    .trim();

  return {
    id: item.id + ':' + (start ? start.toISOString() : ''),
    title: item.summary || '(untitled event)',
    location: item.location || '',
    description,
    start: start ? start.toISOString() : null,
    end: end ? end.toISOString() : null,
    allDay,
    calendar: item.organizer ? item.organizer.displayName || '' : ''
  };
}

async function listBetween(timeMin, timeMax) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) return { connected: false, events: [] };

  const calendar = google.calendar({ version: 'v3', auth });
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,      // expands recurring events into occurrences
      orderBy: 'startTime',
      maxResults: 250
    });
    const events = (res.data.items || [])
      .filter((i) => i.status !== 'cancelled')
      .map(normalize)
      .filter((e) => e.start);
    return { connected: true, events };
  } catch (e) {
    if (isAuthFailure(e)) return { connected: false, events: [], error: 'auth_expired' };
    return { connected: true, events: [], error: e.message };
  }
}

/** Events for a single local day. */
async function getDay(dateIso) {
  const base = dateIso ? new Date(dateIso + 'T12:00:00') : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  return listBetween(start, end);
}

/**
 * Events for a whole month grid, including the leading and trailing days
 * of adjacent months the grid displays.
 */
async function getMonth(year, month) {
  const now = new Date();
  const y = Number.isInteger(year) ? year : now.getFullYear();
  const m = Number.isInteger(month) ? month : now.getMonth();

  const firstOfMonth = new Date(y, m, 1);
  const gridStart = new Date(y, m, 1 - firstOfMonth.getDay());
  const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42);

  const result = await listBetween(gridStart, gridEnd);
  return Object.assign(result, { year: y, month: m });
}

/**
 * Upcoming events, optionally filtered to those whose title or location
 * mentions one of the given keywords — for a box that should only show,
 * say, appointments that are already on the calendar.
 */
async function getUpcoming(days, keywords) {
  // From midnight, not from now — otherwise anything earlier today is
  // missing and "Today" looks empty by mid-afternoon.
  const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (days || 60));
  const result = await listBetween(start, end);

  if (!keywords || !keywords.length || !result.events) return result;

  // Short keywords match whole words only, so "Dr" matches "Dr visit"
  // but not "Drive".
  const patterns = keywords.map((k) =>
    new RegExp(k.length <= 3 ? `\\b${k}\\b` : k, 'i')
  );
  const events = result.events.filter((e) => {
    const haystack = `${e.title} ${e.location}`;
    return patterns.some((p) => p.test(haystack));
  });

  return Object.assign({}, result, { events });
}

/**
 * Turns "2026-08-04", and optionally "2026-08-04 14:30", into a real local
 * Date.
 *
 * `new Date('2026-08-04')` is parsed as UTC midnight, which in Central time
 * is 7pm the evening before. That shifted every window by the offset, and
 * asking for a single day produced a zero-width range — so "what is on
 * today" reliably answered "nothing". Building the date from its parts
 * keeps it local, which is what the owner means when they say a date.
 */
function localDate(value, endOfDay) {
  const m = String(value || '').trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  if (hh !== undefined) return new Date(+y, +mo - 1, +d, +hh, +mm, 0, 0);
  return endOfDay
    ? new Date(+y, +mo - 1, +d, 23, 59, 59, 999)
    : new Date(+y, +mo - 1, +d, 0, 0, 0, 0);
}

/**
 * Any window, past or future. getUpcoming only looks forward from today,
 * which is fine for a dashboard and useless for "when did I last see my
 * VR&E counsellor".
 *
 * The end date is inclusive — asking for the 4th to the 4th means all of
 * that day, not the instant it begins.
 */
async function getRange(startIso, endIso) {
  const start = localDate(startIso, false);
  const end = localDate(endIso || startIso, true);
  if (!start || !end) throw new Error('Dates must be YYYY-MM-DD.');
  if (end < start) throw new Error('The end date is before the start date.');
  return listBetween(start, end);
}

/** Has the owner actually granted write access, or is this an older token? */
function canWrite() {
  return googleOAuth.hasScope(SCOPE_KEY, WRITE_SCOPE);
}

async function createEvent({ title, start, end, location, notes, allDay }) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) throw new Error('Google Calendar is not connected.');
  if (!canWrite()) {
    throw new Error('Calendar is connected for reading only. Reconnect it in Settings to allow changes.');
  }
  const calendar = google.calendar({ version: 'v3', auth });
  const from = localDate(start, false);
  if (!from) {
    throw new Error('I could not read "' + start + '" as a date. Use YYYY-MM-DD HH:MM.');
  }
  const to = end ? localDate(end, false) : new Date(from.getTime() + 3600000);
  if (!to) throw new Error('I could not read "' + end + '" as a date.');

  const body = {
    summary: title,
    location: location || undefined,
    description: notes || undefined,
    start: allDay ? { date: start.slice(0, 10) } : { dateTime: from.toISOString() },
    end: allDay ? { date: (end || start).slice(0, 10) } : { dateTime: to.toISOString() }
  };
  const res = await calendar.events.insert({ calendarId: 'primary', requestBody: body });
  return { id: res.data.id, title: res.data.summary, start: res.data.start };
}

async function updateEvent({ eventId, title, start, end, location, notes }) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) throw new Error('Google Calendar is not connected.');
  if (!canWrite()) {
    throw new Error('Calendar is connected for reading only. Reconnect it in Settings to allow changes.');
  }
  const calendar = google.calendar({ version: 'v3', auth });
  const patch = {};
  if (title) patch.summary = title;
  if (location !== undefined) patch.location = location;
  if (notes !== undefined) patch.description = notes;
  if (start) {
    const d = localDate(start, false);
    if (!d) throw new Error('I could not read "' + start + '" as a date.');
    patch.start = { dateTime: d.toISOString() };
  }
  if (end) {
    const d = localDate(end, false);
    if (!d) throw new Error('I could not read "' + end + '" as a date.');
    patch.end = { dateTime: d.toISOString() };
  }
  const res = await calendar.events.patch({ calendarId: 'primary', eventId, requestBody: patch });
  return { id: res.data.id, title: res.data.summary, start: res.data.start };
}

/** Reads one event back, so a write can be checked rather than assumed. */
async function getEvent(eventId) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) return null;
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    const res = await calendar.events.get({ calendarId: 'primary', eventId });
    return res.data && res.data.status !== 'cancelled' ? normalize(res.data) : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  connect, disconnect, isConnected, hasClientConfig, getRange,
  canWrite, createEvent, updateEvent, getEvent,
  getDay, getMonth, getUpcoming, SCOPES
};
