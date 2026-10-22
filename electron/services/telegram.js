// Telegram bot — remote access to Command Center from a phone.
//
// Long polling, not a webhook: a desktop machine behind a home router
// has no public URL and shouldn't open an inbound port. The trade-off is
// that the bot only answers while Command Center is running.
//
// Token resolution, in order:
//   1. CC_TELEGRAM_BOT_TOKEN in the environment (handy for development)
//   2. %APPDATA%\command-center\telegram-token.bin, encrypted with
//      Windows DPAPI via Electron safeStorage
// Never hardcoded, never logged, never written to the database.
//
// Access control: exactly one chat is ever answered. The chat is bound
// by sending a one-time code generated in the app, so no user ID has to
// be looked up by hand. Messages from anyone else are ignored and
// recorded, never replied to — a reply would confirm the bot exists.

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const db = require('./db');
const calendarService = require('./calendar-service');
const gmailService = require('./gmail-service');
const weather = require('./weather');
const config = require('./config');
const brief = require('./brief');

const API = 'https://api.telegram.org/bot';
const POLL_TIMEOUT_S = 30;
const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_REPLY = 3500; // Telegram's limit is 4096

let running = false;
let offset = 0;
let pairing = null;   // { code, expires }
let abort = null;

/* ----------------------------- token ------------------------------ */

function tokenFile() {
  return path.join(app.getPath('userData'), 'telegram-token.bin');
}

function saveToken(token) {
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token)
    : Buffer.from(token, 'utf8');
  fs.writeFileSync(tokenFile(), data);
}

function loadToken() {
  if (process.env.CC_TELEGRAM_BOT_TOKEN) return process.env.CC_TELEGRAM_BOT_TOKEN;
  const file = tokenFile();
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

function clearToken() {
  if (fs.existsSync(tokenFile())) fs.unlinkSync(tokenFile());
}

function hasToken() {
  return !!loadToken();
}

/* ---------------------------- pairing ----------------------------- */

function boundChatId() {
  return db.getSetting('telegram_chat_id', '') || '';
}

/** Six digits, from the crypto RNG rather than Math.random. */
function startPairing() {
  const n = require('crypto').randomInt(100000, 1000000);
  pairing = { code: String(n), expires: Date.now() + PAIR_CODE_TTL_MS };
  return pairing.code;
}

function unpair() {
  db.setSetting('telegram_chat_id', '');
  db.logEvent('System', 'Telegram unpaired');
  return true;
}

/* ------------------------------ api ------------------------------- */

async function call(method, body, signal) {
  const token = loadToken();
  if (!token) throw new Error('no_token');
  const res = await fetch(`${API}${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal
  });
  const json = await res.json();
  if (!json.ok) {
    // description can echo the request but never the token itself
    throw new Error(json.description || `telegram ${method} failed`);
  }
  return json.result;
}

async function send(chatId, text) {
  const body = String(text || '').slice(0, MAX_REPLY);
  try {
    await call('sendMessage', { chat_id: chatId, text: body });
  } catch (e) {
    console.error('Telegram send failed:', e.message);
  }
}

/** Confirms the token works and returns the bot's own username. */
async function verify() {
  try {
    const me = await call('getMe', {});
    return { ok: true, username: me.username };
  } catch (e) {
    return { ok: false, error: e.message === 'no_token' ? 'No token saved.' : e.message };
  }
}

/**
 * Sends one message to the paired chat without starting the poller.
 *
 * Used by the 8am brief. Starting the poller here would fight the running
 * app for the update stream.
 */
async function notifyOwner(text) {
  if (!hasToken()) return { ok: false, error: 'no token saved' };
  const chatId = boundChatId();
  if (!chatId) return { ok: false, error: 'no chat paired' };
  try {
    await call('sendMessage', { chat_id: chatId, text: String(text).slice(0, MAX_REPLY) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  saveToken, clearToken, hasToken, verify, notifyOwner,
  startPairing, unpair, boundChatId,
  // Exported so the 8am push sends exactly what /brief sends. Two
  // codepaths composing "the brief" is how they drift apart.
  buildBrief: () => briefReply(),
  start, stop, isRunning: () => running
};

/* ---------------------------- commands ---------------------------- */

function clock(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Today, in one message: weather, what's on, what's still open on each
 * checklist, and what's unread. Each source is fetched in parallel and any
 * that fails or is not set up is simply left out.
 */
async function briefReply() {
  const settings = db.getSettings(['weather_lat', 'weather_lon', 'weather_place']);
  const weatherOpts = settings.weather_lat && settings.weather_lon
    ? {
      lat: Number(settings.weather_lat),
      lon: Number(settings.weather_lon),
      place: settings.weather_place
    }
    : undefined;

  const googleOn = calendarService.isConnected();
  const [wx, day, mail] = await Promise.all([
    weather.get(weatherOpts).catch(() => null),
    googleOn ? calendarService.getDay().catch(() => ({ events: [] })) : null,
    gmailService.isConnected() ? gmailService.getRecent(10).catch(() => ({ emails: [] })) : null
  ]);

  const items = db.itemsByWidget();
  const checklists = config.widgets()
    .filter((w) => w.type === 'checklist')
    .map((w) => ({
      title: w.title,
      open: (items[w.id] || []).filter((i) => !i.done).map((i) => i.text).filter(Boolean)
    }));

  return brief.compose({
    owner: config.owner(),
    weather: wx,
    calendar: day ? day.events || [] : null,
    emails: mail ? mail.emails || [] : null,
    checklists
  });
}

/**
 * Which box `/add` writes into: `telegramInbox` in the config file if it
 * names a checklist, otherwise the first checklist on any page.
 */
function inboxWidget() {
  const lists = config.widgets().filter((w) => w.type === 'checklist');
  const named = config.load().telegramInbox;
  return lists.find((w) => w.id === named) || lists[0] || null;
}

// Deliberately narrow. Anything the bot says ends up stored on Telegram's
// servers, so it reports the day and takes quick notes — it never reads
// back money, documents or private boxes.
const HELP = [
  'Command Center',
  '',
  '/brief    weather, calendar, open to-dos and mail',
  '/agent    ask the agent anything (needs a Claude key)',
  '/add      add something to your list',
  '/help     this list'
].join('\n');

const UNKNOWN = `Not a command.\n\n${HELP}`;

/**
 * The agent, over Telegram. Same agent, memory and tools as in the app,
 * with three protections: sensitive memories are never loaded here, the
 * prompt tells it to reference rather than disclose, and the answer is
 * filtered before sending. Changes can be prepared from here but only
 * approved at the desk.
 */
async function atlasReply(question) {
  if (!question) {
    return 'Ask me something — "agent what do I need to know today".';
  }

  const atlas = require('../agent/atlas');
  const redact = require('../agent/redact');

  let cal = null;
  try {
    if (calendarService.isConnected()) cal = await calendarService.getUpcoming(3);
  } catch (e) { /* answer without it */ }

  const res = await atlas.run(question, {
    surface: 'telegram',
    history: [],
    live: { calendar: (cal && cal.events) || [] }
  });

  if (!res.ok) return res.error || 'I could not answer that just now.';

  const { text } = redact.forTelegram(res.text);

  if (res.proposals && res.proposals.length) {
    const lines = res.proposals.map((p) => '• ' + p.summary).join('\n');
    return `${text}\n\nPrepared, waiting for you at the desk:\n${lines}`
      + '\n\nApprove them in Command Center.';
  }
  return text;
}

/**
 * Catches a thought before it evaporates: one item on the inbox checklist.
 * One word back, because it is typed while walking away from something.
 */
function addReply(text) {
  if (!text) {
    return 'Send it after the word, like:\n  add call the dentist';
  }
  const box = inboxWidget();
  if (!box) return 'There is no checklist box to add to yet. Add one to a page first.';
  db.addEntity('item', box.id, { text: text.slice(0, 500), done: false });
  return `Saved to ${box.title}.`;
}

async function handleCommand(text) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
    case '/start':
      return HELP;

    case '/today':
    case '/brief':
      return await briefReply();

    case '/agent':
    case 'agent':
      return await atlasReply(parts.slice(1).join(' ').trim());

    case '/add':
    case 'add':
      return addReply(parts.slice(1).join(' ').trim());

    default:
      return null; // unrecognised — answered with the command list
  }
}

async function handleMessage(msg) {
  const chatId = String(msg.chat && msg.chat.id);
  const text = (msg.text || '').trim();
  if (!text) return;

  const bound = boundChatId();

  // -------- pairing --------
  if (!bound) {
    const code = text.replace(/^\/start\s*/i, '').trim();
    if (pairing && Date.now() < pairing.expires && code === pairing.code) {
      db.setSetting('telegram_chat_id', chatId);
      pairing = null;
      db.logEvent('System', 'Telegram paired');
      await send(chatId, `Paired.\n\n${HELP}`);
    }
    // Wrong or absent code gets no reply at all — an error message would
    // tell a stranger the bot is real and worth guessing at.
    return;
  }

  // -------- access control --------
  if (chatId !== bound) {
    db.logEvent('Alert', 'Telegram message from an unknown chat ignored', chatId);
    return;
  }

  // Commands only. Nothing here reaches an outside service beyond
  // Telegram itself — no question is forwarded anywhere to be answered,
  // so the bot cannot cost anything or send data to a third party.
  const reply = await handleCommand(text);
  await send(chatId, reply === null ? UNKNOWN : reply);
  db.logEvent('System', 'Telegram command', text.slice(0, 60));
}

/* ---------------------------- polling ----------------------------- */

async function loop() {
  while (running) {
    try {
      abort = new AbortController();
      const updates = await call(
        'getUpdates',
        { offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message'] },
        abort.signal
      );
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) {
          try {
            await handleMessage(u.message);
          } catch (e) {
            console.error('Telegram handler failed:', e.message);
          }
        }
      }
    } catch (e) {
      if (!running) return;              // stopped while waiting
      if (e.name === 'AbortError') continue;
      // Back off so a bad token or a network outage doesn't spin.
      console.error('Telegram poll failed:', e.message);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

function start() {
  if (running || !hasToken()) return false;
  running = true;
  loop();
  return true;
}

function stop() {
  running = false;
  if (abort) abort.abort();
  abort = null;
}
