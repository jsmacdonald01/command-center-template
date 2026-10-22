const { google } = require('googleapis');
const googleOAuth = require('./google-oauth');

const { isAuthFailure } = googleOAuth;

const SCOPE_KEY = 'gmail';
// gmail.compose creates drafts. Sending is a separate capability and is
// deliberately not built yet — the owner's own sequence was "draft emails,
// eventually send with my approval". A draft can be read and deleted; a
// sent message cannot be recalled.
const WRITE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', WRITE_SCOPE];

// The Gmail API is free at any personal volume — the daily quota is
// orders of magnitude above what polling every few minutes uses.

function decodeHeader(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

/** "the owner <a@b.com>" → "the owner". Bare addresses keep the part before the @. */
function senderName(from) {
  if (!from) return '';
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1].trim();
  const bare = from.match(/([^@\s<>]+)@/);
  return bare ? bare[1] : from;
}

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

async function hydrate(gmail, ids, unreadIds) {
  return Promise.all(ids.map(async (id) => {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date']
    });
    const headers = msg.data.payload && msg.data.payload.headers;
    const from = decodeHeader(headers, 'From');
    return {
      id,
      threadId: msg.data.threadId,
      from,
      sender: senderName(from),
      subject: decodeHeader(headers, 'Subject') || '(no subject)',
      snippet: msg.data.snippet || '',
      date: decodeHeader(headers, 'Date'),
      unread: unreadIds.has(id)
    };
  }));
}

/**
 * Unread inbox mail first, topped up with the most recent inbox messages
 * so the list is never empty just because everything has been read.
 */
async function getRecent(maxResults) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) return { connected: false, emails: [] };

  const limit = maxResults || 10;
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const unreadList = await gmail.users.messages.list({
      userId: 'me', q: 'is:unread in:inbox', maxResults: limit
    });
    const unreadIds = (unreadList.data.messages || []).map((m) => m.id);
    const unreadSet = new Set(unreadIds);

    let ids = unreadIds.slice();
    if (ids.length < limit) {
      const recentList = await gmail.users.messages.list({
        userId: 'me', q: 'in:inbox', maxResults: limit
      });
      (recentList.data.messages || []).forEach((m) => {
        if (!unreadSet.has(m.id) && ids.length < limit) ids.push(m.id);
      });
    }

    const emails = await hydrate(gmail, ids, unreadSet);

    return { connected: true, emails, unreadCount: unreadIds.length };

  } catch (e) {
    // Same two shapes as the calendar: an expired access token arrives as
    // 401/403, a dead refresh token as `invalid_grant` with no status.
    if (isAuthFailure(e)) return { connected: false, emails: [], error: 'auth_expired' };
    return { connected: true, emails: [], error: e.message };
  }
}

/**
 * Search the whole mailbox, not just the inbox, using Gmail's own query
 * syntax — "from:va.gov", "subject:invoice", "after:2026/01/01".
 *
 * Read-only, on the scope already granted. Bodies are not fetched; the
 * snippet Gmail returns is enough to decide what matters and keeps the
 * response small enough to hand a model.
 */
async function search(query, maxResults) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) return { connected: false, emails: [] };
  const gmail = google.gmail({ version: 'v1', auth });
  const limit = Math.min(maxResults || 15, 25);

  try {
    const list = await gmail.users.messages.list({
      userId: 'me', q: String(query || '').trim() || 'in:inbox', maxResults: limit
    });
    const ids = (list.data.messages || []).map((m) => m.id);
    const emails = [];
    for (const id of ids) {
      const full = await gmail.users.messages.get({
        userId: 'me', id, format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });
      const headers = {};
      (full.data.payload.headers || []).forEach((h) => { headers[h.name] = h.value; });
      emails.push({
        id,
        from: headers.From || '',
        subject: headers.Subject || '(no subject)',
        date: headers.Date || '',
        snippet: full.data.snippet || '',
        unread: (full.data.labelIds || []).includes('UNREAD')
      });
    }
    return { connected: true, emails };
  } catch (e) {
    return { connected: true, emails: [], error: e.message };
  }
}

/**
 * An HTML email read back as plain text.
 *
 * Many senders no longer include a plain-text copy at all, so looking only
 * for text/plain finds nothing and returns silence. This turns the markup
 * into text with the same shape: the line breaks the markup happens to be
 * typed with are flattened first, and real ones put back only where a
 * block actually ends. Links are kept as [title](url).
 */
function htmlToText(html) {
  const decode = (s) => String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    // Ampersand last. Undoing it first would turn &amp;lt; into a <.
    .replace(/&amp;/gi, '&');

  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    // How the markup was laid out is not content.
    .replace(/[\r\n\t]+/g, ' ')
    .replace(
      /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (m, href, label) => '[' + label.replace(/<[^>]*>/g, '').trim() + '](' + href + ')'
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '');

  return decode(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * One message as plain text, for reading rather than listing.
 *
 * `search` above asks for metadata only, which keeps the mail panel
 * cheap; this is the opposite trade, for when the body is the point.
 */
async function getPlainBody(messageId) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) return null;
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });

    // The body can sit at the top level or inside any number of nested
    // parts, so walk it for the kind wanted.
    const find = (part, mimeType) => {
      if (!part) return null;
      if (part.mimeType === mimeType && part.body && part.body.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf8');
      }
      for (const child of part.parts || []) {
        const found = find(child, mimeType);
        if (found) return found;
      }
      return null;
    };

    // Plain text wherever a sender still offers it. Converting markup is
    // guesswork; the real thing is not.
    const plain = find(res.data.payload, 'text/plain');
    if (plain) return plain;

    const html = find(res.data.payload, 'text/html');
    return html ? htmlToText(html) : null;
  } catch (e) {
    return null;
  }
}

function canWrite() {
  return googleOAuth.hasScope(SCOPE_KEY, WRITE_SCOPE);
}

/**
 * Creates a draft. Never sends. It lands in Gmail's Drafts folder for
 * The owner to read, change and send themselves.
 */
async function createDraft({ to, subject, body }) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) throw new Error('Gmail is not connected.');
  if (!canWrite()) {
    throw new Error('Gmail is connected for reading only. Reconnect it in Settings to allow drafts.');
  }
  const gmail = google.gmail({ version: 'v1', auth });
  const lines = [
    'To: ' + to,
    'Subject: ' + subject,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body
  ].join('\r\n');
  const raw = Buffer.from(lines).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
  return { draftId: res.data.id, to, subject };
}

/** Reads a draft back so the write can be verified. */
async function getDraft(draftId) {
  const auth = await googleOAuth.getAuthorizedClient(SCOPE_KEY);
  if (!auth) return null;
  const gmail = google.gmail({ version: 'v1', auth });
  try {
    const res = await gmail.users.drafts.get({ userId: 'me', id: draftId });
    return res.data ? { id: res.data.id } : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  getPlainBody,
  connect, disconnect, isConnected, hasClientConfig, getRecent, search,
  canWrite, createDraft, getDraft,
  // kept for the MCP server and any older caller
  getRecentImportant: getRecent
};
