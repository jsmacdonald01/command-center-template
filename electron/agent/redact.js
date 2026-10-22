// The last thing between the agent and Telegram's servers.
//
// The system prompt already tells the agent not to state sensitive values
// over Telegram, and it will almost always comply. Almost is not a
// security property. A prompt is a request; this is a filter.
//
// So this runs on the way out, over the real values pulled live from the
// database — every amount in every money box, and every value typed into a
// facts box. If one appears in the text, it does not leave the machine.

const db = require('../services/db');
const config = require('../services/config');

/** Escapes a literal string for use inside a regular expression. */
function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the list of things that must not be said, from live data.
 *
 * Deliberately narrow. Redacting every number would mangle dates, times
 * and counts — "3 items due" is not a leak. This targets formatted money,
 * the specific figures in the owner's records, identifiers, and contact
 * details.
 */
function sensitiveValues() {
  const out = [];
  const data = db.loadAll();
  if (!data) return out;

  const moneyBoxes = config.widgets().filter((w) => w.type === 'money').map((w) => w.id);
  moneyBoxes.forEach((id) => (data.items[id] || []).forEach((m) => {
    const n = Number(m.amount);
    if (!n) return;
    // Both "1900" and "1,900", with or without cents.
    const plain = String(Math.round(n));
    const grouped = Math.round(n).toLocaleString('en-US');
    out.push(new RegExp(`\\$\\s?${esc(grouped)}(\\.\\d{2})?\\b`, 'g'));
    out.push(new RegExp(`\\$\\s?${esc(plain)}(\\.\\d{2})?\\b`, 'g'));
  }));

  // Anything typed into a facts box that is long enough to be an
  // identifier — an account number, a policy number, a member ID.
  Object.values(data.fields || {}).forEach((fields) => {
    Object.values(fields).forEach((v) => {
      const s = String(v || '').trim();
      if (s.length >= 5 && /\d{4,}/.test(s)) out.push(new RegExp(esc(s), 'g'));
    });
  });

  return out;
}

/* Shapes that are sensitive whatever the database says. */
const PATTERNS = [
  { re: /\$\s?\d[\d,]*(\.\d{2})?/g, as: '[amount]' },
  { re: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, as: '[phone]' },
  { re: /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g, as: '[phone]' },
  { re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/g, as: '[email]' },
  { re: /\b\d{9,}\b/g, as: '[number]' }
];

/**
 * @returns {{ text: string, redacted: number }}
 */
function forTelegram(text) {
  let out = String(text || '');
  let count = 0;

  sensitiveValues().forEach((re) => {
    out = out.replace(re, () => { count += 1; return '[redacted]'; });
  });

  PATTERNS.forEach(({ re, as }) => {
    out = out.replace(re, () => { count += 1; return as; });
  });

  if (count) {
    out += '\n\n(Specific figures stay on your desktop — they are on the relevant page.)';
  }
  return { text: out, redacted: count };
}

module.exports = { forTelegram, sensitiveValues };
