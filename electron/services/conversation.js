// Anthropic API: the multi-turn chat behind the AI overlay, grounded in
// the full Command Center context so Claude reasons over real data
// rather than guessing.

const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const MODEL = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

/* ------------------------------ key ------------------------------- */

function keyFilePath() {
  return path.join(app.getPath('userData'), 'anthropic-key.bin');
}

function saveApiKey(key) {
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key)
    : Buffer.from(key, 'utf8');
  fs.writeFileSync(keyFilePath(), data);
}

function loadApiKey() {
  const file = keyFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    const data = fs.readFileSync(file);
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8');
  } catch (e) {
    return null;
  }
}

function clearApiKey() {
  const file = keyFilePath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function hasApiKey() {
  return !!loadApiKey();
}

/* ---------------------------- context ----------------------------- */

function money(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

/** Box types that are private enough to stay off Telegram entirely. */
const PRIVATE_TYPES = ['money', 'facts', 'documents', 'notes'];

/**
 * A short written summary of every box, for the agent's prompt.
 *
 * @param scope 'full' in the app, where the whole picture is the point.
 *              'limited' for Telegram: checklists, lists and the calendar
 *              only — no money, facts, documents or notes, so a question
 *              asked from a phone cannot pull private detail into a
 *              third-party chat log. A box can opt out of Telegram too, by
 *              setting "private": true on it in the config file.
 */
function buildContext(data, live, scope) {
  if (!data) return 'No Command Center data available.';
  const limited = scope === 'limited';
  const L = [];
  const today = new Date();

  L.push(`COMMAND CENTER CONTEXT — ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
  if (limited) {
    L.push('', 'SCOPE: limited. Money, facts, documents, notes and private boxes are');
    L.push('deliberately not included. If asked about them, say they are only');
    L.push('available in the app — do not guess.');
  }

  (config.load().pages || []).forEach((page) => {
    const lines = [];
    (page.widgets || []).forEach((w) => {
      if (limited && (PRIVATE_TYPES.includes(w.type) || w.private)) return;
      const rows = (data.items && data.items[w.id]) || [];
      const fields = (data.fields && data.fields[w.id]) || {};

      if (w.type === 'checklist') {
        const open = rows.filter((r) => !r.done);
        lines.push(`${w.title} (checklist, ${open.length} open of ${rows.length})`);
        open.slice(0, 15).forEach((r) => lines.push(`  - ${r.text}`));
      } else if (w.type === 'list') {
        lines.push(`${w.title} (list)`);
        rows.slice(0, 15).forEach((r) => lines.push(
          `  - ${r.text}${r.date ? ` [${r.date}]` : ''}${r.note ? ` — ${r.note}` : ''}`));
      } else if (w.type === 'money') {
        const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
        lines.push(`${w.title} (money, total ${money(total)})`);
        rows.forEach((r) => lines.push(`  - ${r.text}: ${money(r.amount)}`));
      } else if (w.type === 'facts') {
        lines.push(`${w.title} (facts)`);
        (w.fields || []).forEach((f) => lines.push(`  ${f.label}: ${fields[f.key] || '(blank)'}`));
      } else if (w.type === 'notes') {
        const text = String(fields.text || '').trim();
        if (text) lines.push(`${w.title} (notes): ${text.length > 400 ? `${text.slice(0, 397)}…` : text}`);
      } else if (w.type === 'documents') {
        lines.push(`${w.title} (documents): ${rows.map((r) => r.name).join(', ') || 'none'}`);
      }
    });
    if (lines.length) L.push('', `PAGE: ${page.title.toUpperCase()}`, ...lines);
  });

  if (live) {
    if (live.calendar && live.calendar.length) {
      L.push('', 'CALENDAR');
      live.calendar.forEach((e) => {
        const d = new Date(e.start);
        const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const when = e.allDay ? 'all day' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        L.push(`  ${day}, ${when} — ${e.title}`);
      });
    }
    if (!limited && live.email && live.email.length) {
      L.push('', 'RECENT EMAIL');
      live.email.forEach((m) => {
        L.push(`  [${m.unread ? 'unread' : 'read'}] ${m.from}: ${m.subject}`);
      });
    }
    if (live.weather && live.weather.ok) {
      L.push('', `WEATHER — ${live.weather.current.temperature}°, ${live.weather.current.condition}, ${live.weather.place}`);
    }
  }

  return L.join('\n');
}

/* ------------------------------ api ------------------------------- */

// Raw API errors are JSON blobs. Surface something a person can act on.
function friendlyError(status, body) {
  const message = (body && body.error && body.error.message) || '';
  if (/credit balance is too low/i.test(message)) {
    return 'Anthropic account is out of credits. Add credits at console.anthropic.com, '
      + 'or use the Claude Desktop button instead — that costs nothing extra.';
  }
  if (status === 401 || /invalid x-api-key/i.test(message)) {
    return 'API key was rejected. Replace it in Settings, at the bottom of History.';
  }
  if (status === 429) return 'Rate limited by the API. Try again shortly.';
  if (status >= 500) return 'The Anthropic API is having trouble. Try again shortly.';
  return message || `API error ${status}`;
}

async function callApi(key, body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(Object.assign({ model: MODEL }, body))
  });

  if (!res.ok) {
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { /* keep null */ }
    throw new Error(friendlyError(res.status, parsed));
  }

  const json = await res.json();
  return (json.content || []).map((c) => c.text || '').join('');
}

const CHAT_SYSTEM = `You are the intelligence layer of Command Center, the owner's personal dashboard.

You reason over their real data — lists, money, notes, documents, calendar and email — which is provided below. You do not own that data; Command Center does.

How to respond:
- Be direct and calm. Short paragraphs. No markdown headers, no bullet-point walls, no emoji.
- Ground every claim in the provided context. If something isn't there, say you don't have it rather than guessing.
- When they ask what to do, give a recommendation and the reason, not a list of options.
- You are talking to them about their own life. Skip the preamble and answer.`;

async function chat(messages, contextText) {
  const key = loadApiKey();
  if (!key) return { ok: false, error: 'no_api_key' };

  try {
    const text = await callApi(key, {
      max_tokens: 2000,
      system: `${CHAT_SYSTEM}\n\n--- CURRENT CONTEXT ---\n${contextText}`,
      messages: messages.map((m) => ({
        role: m.role === 'me' ? 'user' : 'assistant',
        content: m.text
      }))
    });
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * A single call on a named model, used for cheap background work like
 * memory extraction. Deliberately separate from chat(): no context, no
 * history, no tools — just a prompt and an answer.
 */
async function chatWith(modelId, system, content) {
  const key = loadApiKey();
  if (!key) return { ok: false, error: 'no_api_key' };
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId, max_tokens: 400, system,
        messages: [{ role: 'user', content }]
      })
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const json = await res.json();
    return { ok: true, text: (json.content || []).map((x) => x.text || '').join('') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  saveApiKey, loadApiKey, clearApiKey, hasApiKey,
  buildContext, chat, chatWith, MODEL
};
