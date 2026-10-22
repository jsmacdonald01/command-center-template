// What the agent keeps, and what it is not allowed to keep quietly.
//
// The owner's rule: remember low-risk preferences automatically, but anything
// sensitive has to be confirmed before it sticks. So extraction runs on
// the cheap model after a conversation, proposes short facts, and each one
// is screened here before it is stored.
//
// The screening is a pattern check rather than a judgement call. A model
// deciding what counts as sensitive would be wrong occasionally, and
// occasionally is too often for a case number.

const db = require('../services/db');

/* Anything matching these is stored unconfirmed and shows up in the
 * Memory panel awaiting their yes. Money, case and account numbers, phone
 * numbers, emails, medical words, and family. */
const SENSITIVE = [
  /\$\s?[\d,]+/,
  /\b\d{6,}\b/,
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /\b(diagnos|medication|prescription|disability rating|therapy|treatment)\w*/i,
  /\b(case|warrant|account|social security|ssn)\s*(number|#|no\.?)/i,
  /\b(custody|daughter|child support)\b/i
];

function looksSensitive(text) {
  return SENSITIVE.some((re) => re.test(text));
}

/** Near-duplicate check, so the same preference does not accumulate. */
function alreadyKnown(text) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const t = norm(text);
  return db.listMemories().some((m) => {
    const e = norm(m.text);
    return e === t || e.includes(t) || t.includes(e);
  });
}

/**
 * Stores a candidate memory.
 * Low-risk goes straight in. Sensitive goes in unconfirmed, which means it
 * is visible in the Memory panel but never loaded into a prompt.
 */
function remember(text, kind = 'preference', source = 'conversation') {
  const clean = String(text || '').trim();
  if (clean.length < 8 || clean.length > 300) return null;
  if (alreadyKnown(clean)) return null;

  const sensitive = looksSensitive(clean);
  const id = db.addMemory({
    kind, text: clean, source, sensitive, confirmed: !sensitive
  });
  return { id, text: clean, sensitive, confirmed: !sensitive };
}

const EXTRACT_PROMPT = `Read this exchange and pull out anything worth remembering about how the owner likes things done.

Only durable things: preferences, how they want information presented, how they handle a recurring situation, a standing decision.

Not: anything that will be out of date next week, anything already obvious from their data, anything they only mentioned once in passing, and never a number or amount you could just look up.

Reply with one short line per memory, no bullets, no preamble. If there is nothing worth keeping, reply with exactly: NONE`;

/**
 * Runs after a conversation, on the cheap model. Returns what it stored.
 * Failure here is silent by design — losing a memory is a small thing and
 * it must never break the answer the owner was actually waiting for.
 */
async function extract(exchange, callModel) {
  try {
    const reply = await callModel(EXTRACT_PROMPT, exchange);
    if (!reply || /^NONE/i.test(reply.trim())) return [];
    return reply.split('\n')
      .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
      .filter((l) => l.length > 8)
      .slice(0, 3)
      .map((l) => remember(l))
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

module.exports = { remember, extract, looksSensitive };
