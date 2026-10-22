// The morning brief, composed rather than listed.
//
// Reads like something written for the owner rather than a count of
// things, and stays free: it is composed in code, not through the Claude
// API, so it never costs anything and cannot fail because an account ran
// dry. Asking the agent (/ask) is the paid path.
//
// Lives apart from telegram.js so the 8am push sends the same text as the
// /brief command.

const CLOCK = { hour: 'numeric', minute: '2-digit' };

function greeting(now, owner) {
  const h = now.getHours();
  const name = owner ? `, ${owner}` : '';
  if (h < 12) return `Good morning${name}.`;
  if (h < 17) return `Good afternoon${name}.`;
  return `Good evening${name}.`;
}

/** Temperature as a word. A number tells them nothing they can act on. */
function tempWord(f) {
  if (f >= 100) return 'Dangerously hot';
  if (f >= 95) return 'Very hot';
  if (f >= 90) return 'Hot';
  if (f >= 82) return 'Warm';
  if (f >= 70) return 'Mild';
  if (f >= 60) return 'Cool';
  if (f >= 50) return 'Chilly';
  return 'Cold';
}

function weatherLine(wx) {
  if (!wx || !wx.ok) return null;
  const condition = String(wx.current.condition || '').toLowerCase();
  const today = wx.daily && wx.daily[0];

  // The word describes the day, not the moment. Read at 7am, "cool and
  // clear" is true and useless when it reaches 99 by lunchtime.
  const word = tempWord(today ? today.high : wx.current.temperature);
  return `🌦 Weather — ${word} and ${condition}${today ? `, high ${today.high}` : ''}.`;
}

/** Long item text is cut at a word, so two of them still read as a sentence. */
function shorten(title, limit) {
  if (title.length <= limit) return title;
  const cut = title.slice(0, limit);
  const dash = Math.max(cut.lastIndexOf(' - '), cut.lastIndexOf(' – '));
  if (dash > 12) return title.slice(0, dash).trim();
  const space = cut.lastIndexOf(' ');
  return `${(space > 12 ? cut.slice(0, space) : cut).trim()}…`;
}

/** "a, b and c" — the way a person writes a list. */
function joinWords(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function scheduleLine(events, now) {
  if (!events || !events.length) return '📅 Schedule — clear today.';

  // Only what is still ahead. A brief read at 4pm listing a 9am meeting is
  // telling them about a morning they already lived.
  const ahead = events.filter((e) => e.allDay || new Date(e.start) >= now);
  if (!ahead.length) return '📅 Schedule — nothing left today.';

  // Three, then a count. A list long enough to scroll is the data dump
  // this was meant to replace.
  const shown = ahead.slice(0, 3).map((e) => (
    e.allDay ? e.title : `${e.title} at ${new Date(e.start).toLocaleTimeString('en-US', CLOCK)}`
  ));
  const more = ahead.length - shown.length;
  return `📅 Schedule — ${joinWords(shown)}${more > 0 ? `, plus ${more} more` : ''}.`;
}

function dayWord(iso, now) {
  const d = new Date(iso);
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate())
      - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `on ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
  return `on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * One line per checklist box that still has something open: its title,
 * how many, and the first two by name. A box with nothing open says
 * nothing — a brief listing every empty list is padding.
 *
 * @param checklists [{ title, open: [text, …] }]
 */
function checklistLines(checklists) {
  return (checklists || [])
    .filter((c) => c.open && c.open.length)
    .slice(0, 3)
    .map((c) => {
      const names = c.open.slice(0, 2).map((t) => shorten(String(t), 42));
      const more = c.open.length - names.length;
      return `✅ ${c.title} — ${joinWords(names)}${more > 0 ? `, plus ${more} more` : ''}.`;
    });
}

function emailLine(emails) {
  const unread = (emails || []).filter((m) => m.unread);
  if (!unread.length) return '📧 Email — nothing unread.';

  // Who it is from, not whether it matters. Guessing at importance from a
  // subject line would be a machine inventing urgency, and a brief that
  // cries wolf gets ignored.
  //
  // Automated senders are counted but not named — "from no-reply" tells
  // them nothing, and crowds out the name of an actual person.
  const senders = [...new Set(unread.map((m) => m.sender).filter(Boolean))]
    .filter((s) => !/^(no.?reply|do.?not.?reply|notifications?|mailer|auto)/i.test(s));

  if (!senders.length) return `📧 Email — ${unread.length} unread.`;
  const named = joinWords(senders.slice(0, 2));
  return `📧 Email — ${unread.length} unread, including ${named}`
    + `${senders.length > 2 ? ' and others' : ''}.`;
}

/**
 * @param sources { owner, weather, calendar, emails, checklists }
 *        Any of them may be missing — a source that is not set up simply
 *        leaves its line out (calendar and email say nothing until Google
 *        is connected).
 */
function compose(sources, now) {
  const at = now || new Date();
  const s = sources || {};

  const lines = [
    greeting(at, s.owner),
    `Here's what matters ${at.getHours() < 17 ? 'today' : 'tonight'}.`,
    ''
  ];

  [
    weatherLine(s.weather),
    s.calendar ? scheduleLine(s.calendar, at) : null,
    ...checklistLines(s.checklists),
    s.emails ? emailLine(s.emails) : null
  ].filter(Boolean).forEach((l) => lines.push(l));

  return lines.join('\n');
}

module.exports = { compose, tempWord, dayWord };
