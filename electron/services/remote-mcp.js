// The doorway: Command Center, answerable from Claude chat.
//
// Asked for on 25 September 2026, and it was the reason the app was built —
// "so Claude chat would have access to all my important info to reference
// when I prompt it". Claude Desktop on this machine has had that since
// August through the stdio server in `mcp/`. The website and the phone
// cannot use that one, because they connect from Anthropic's servers
// rather than from this PC, so what they need is a server reachable over
// the internet.
//
// Three decisions, all deliberate:
//
// 1. **It lives inside the app**, not in a second process. The database is
//    already open here, the Google tokens are already decrypted here, and
//    a separate process would mean two of everything. The cost is that it
//    only answers while Command Center is running — which was true of any
//    design, since the machine has to be awake regardless.
//
// 2. **Read-only.** Only tools marked `risk: 'read'` are offered. Anything
//    reaching this surface has crossed the internet, and nothing crossing
//    the internet gets to change their records. The in-app agent and Claude
//    Code keep their write tools; this one is a window, not a door.
//
// 3. **Bound to localhost until a tunnel is put in front of it.** Nothing
//    is exposed by installing this. Exposure is a separate, deliberate
//    step.

const http = require('http');
const crypto = require('crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const db = require('./db');
const tools = require('../agent/tools/registry');

// Chosen high and out of the way of the usual development ports. The
// override exists so a test harness can run its own copy beside the
// installed app instead of silently talking to it — which is exactly what
// happened the first time these locks were tested.
const PORT = Number(process.env.CC_REMOTE_PORT) || 8787;
const HOST = '127.0.0.1';

// Anthropic's outbound range, published at
// platform.claude.com/docs/en/api/ip-addresses and read on 25 September
// 2026: 160.79.104.0/21. Their servers are what call this, so anything
// else asking is not Claude.
//
// **This only works if the tunnel tells us who really called.** A tunnel
// terminates the connection itself, so the socket says 127.0.0.1 and the
// real caller arrives in a header — CF-Connecting-IP from Cloudflare,
// X-Forwarded-For from most others. If no tunnel passes one along, this
// check cannot see past the tunnel and says so rather than pretending.
const ANTHROPIC_RANGE = { base: '160.79.104.0', bits: 21 };

let server = null;

/**
 * The shared secret every request must carry.
 *
 * Generated once and kept in the database rather than a file, so it rides
 * along in the nightly backup with everything else. It is shown to them in
 * Settings; it is never logged, and a request that gets it wrong is told
 * only that it was refused.
 */
function token() {
  let value = db.getSetting('remote_mcp_token', '');
  if (!value) {
    value = crypto.randomBytes(32).toString('base64url');
    db.setSetting('remote_mcp_token', value);
    db.logEvent('System', 'Remote access key created');
  }
  return value;
}

/* --------------------------- who is calling -------------------------- */

function ipv4ToNumber(ip) {
  const parts = String(ip || '').split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const byte = Number(part);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    n = (n * 256) + byte;
  }
  return n;
}

function inAnthropicRange(ip) {
  // ::ffff:1.2.3.4 is how an IPv4 caller looks on a dual-stack socket.
  const plain = String(ip || '').replace(/^::ffff:/i, '');
  const asNumber = ipv4ToNumber(plain);
  const base = ipv4ToNumber(ANTHROPIC_RANGE.base);
  if (asNumber === null || base === null) return false;
  const mask = ANTHROPIC_RANGE.bits === 0 ? 0 : (-1 << (32 - ANTHROPIC_RANGE.bits)) >>> 0;
  return ((asNumber & mask) >>> 0) === ((base & mask) >>> 0);
}

function isLocal(ip) {
  const plain = String(ip || '').replace(/^::ffff:/i, '');
  return plain === '127.0.0.1' || plain === '::1' || plain === 'localhost';
}

/**
 * Who actually asked, as best as can be known.
 *
 * A tunnel connects from this machine, so the socket address is useless on
 * its own; the real caller rides in a header the tunnel sets. Those headers
 * are only worth believing when the connection itself came from this
 * machine — otherwise anyone on the internet could simply claim to be
 * Anthropic by setting one.
 */
function callerOf(req) {
  const socketIp = req.socket.remoteAddress;
  if (!isLocal(socketIp)) return { ip: socketIp, throughTunnel: false };

  // Addresses only. `Tailscale-User-Login` was in this list for about an
  // hour on 25 September and it is an email, not an address — so the range
  // check could never match it and would have refused everyone, Anthropic
  // included. An identity header answers a different question than "where
  // did this come from".
  const forwarded = String(req.headers['cf-connecting-ip'] || '').trim()
    || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();

  if (forwarded) return { ip: forwarded, throughTunnel: true };
  return { ip: socketIp, throughTunnel: false };
}

/** Constant-time, so a wrong key cannot be guessed a character at a time. */
function sameSecret(offeredText, expectedText) {
  const expected = Buffer.from(expectedText);
  const offered = Buffer.from(String(offeredText || ''));
  if (offered.length !== expected.length) return false;
  return crypto.timingSafeEqual(offered, expected);
}

/**
 * Replaces the key. Every connector holding the old one stops working at
 * once, which is the point: this is what to do when a key may have been
 * seen by someone it was not meant for.
 */
function rotateToken() {
  db.setSetting('remote_mcp_token', crypto.randomBytes(32).toString('base64url'));
  db.logEvent('Remote', 'Key replaced', 'the old key no longer works');
  return status();
}

/** The key in an Authorization header. */
function keyMatches(given) {
  return sameSecret(given, 'Bearer ' + token());
}

function text(payload) {
  return {
    content: [{
      type: 'text',
      text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    }]
  };
}

/**
 * A fresh server per request.
 *
 * Stateless on purpose: each call from Anthropic's side is independent, and
 * holding sessions open across the internet would mean holding state for a
 * client this machine cannot see.
 */
function buildServer() {
  const mcp = new McpServer({ name: 'command-center', version: '2.0.0' });

  const offered = tools.TOOLS.filter((tool) =>
    tool.risk === 'read' && (!tool.needsApp || tools.insideApp()));

  offered.forEach((tool) => {
    mcp.tool(tool.name, tool.description, tool.schema, async (args) => {
      // Lock three: every question shows up on their Log page. Prevention
      // stops what it can; this is the part that tells them if prevention
      // failed. It records what was read and when — never the answer,
      // which would put their records in the log twice.
      db.logEvent('Remote', 'Claude chat read', tool.name);
      try {
        const { result } = await tools.execute(tool.name, args);
        return text(result);
      } catch (e) {
        return text('Error: ' + e.message);
      }
    });
  });

  return { mcp, count: offered.length };
}

/* ------------------------------ switches ----------------------------- */

// Lock two: the owner can close the doorway without closing the app. Off
// until switched on in Settings — nothing listens until someone asks it to.
function enabled() {
  return db.getSetting('remote_mcp_enabled', 'no') === 'yes';
}

function addressCheckOn() {
  return db.getSetting('remote_mcp_ip_check', 'yes') !== 'no';
}

/** Opens or closes the doorway, and says so in the Log either way. */
function setEnabled(on) {
  db.setSetting('remote_mcp_enabled', on ? 'yes' : 'no');
  db.logEvent('Remote', on ? 'Claude chat access opened' : 'Claude chat access closed');
  if (on) start(); else stop();
  return status();
}

function setAddressCheck(on) {
  db.setSetting('remote_mcp_ip_check', on ? 'yes' : 'no');
  db.logEvent('Remote', on
    ? 'Restricted to Anthropic addresses'
    : 'Address check turned off — any address may ask');
  return status();
}

function start() {
  if (server) return { running: true, port: PORT };
  if (!enabled()) return { running: false, port: PORT };

  server = http.createServer(async (req, res) => {
    // Health check, so a tunnel can be pointed at this and confirmed
    // without a key. Says nothing about them — only who the caller appears
    // to be, which the caller already knows.
    //
    // `seenAs` and `forwarded` are here because the address lock depends
    // entirely on the tunnel passing the real caller along, and a lock that
    // looks on but is not is worse than no lock. This is how that gets
    // checked from outside rather than assumed.
    const route = String(req.url || '').split('?')[0];

    if (req.method === 'GET' && route === '/health') {
      const caller = callerOf(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'command-center',
        seenAs: caller.ip,
        forwarded: caller.throughTunnel,
        addressCheck: addressCheckOn(),
        // Which address-bearing headers the tunnel actually sets. The
        // names only, plus the caller's own address, which the caller
        // already knows. This is how it can be told from outside whether
        // the address lock can see anything at all.
        sawHeaders: ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'forwarded']
          .filter((h) => req.headers[h])
      }));
      return;
    }

    // The key arrives in the Authorization header and nowhere else.
    //
    // For a day it could also ride in the path, `/mcp/<key>`, because
    // claude.ai seemed to have no way to hold a key: given a 401 it went
    // hunting for a sign-in service instead. Its connector dialog turned out
    // to take custom request headers after all — found only once the
    // path version was working — and an address is the worst place for a
    // secret. Addresses end up in browser history, in logs, and in
    // screenshots; the first key was visible in a screenshot taken while
    // setting the connector up. So the path form is gone, and the key it
    // exposed was replaced the same day.
    //
    // Anything without a good key gets a flat 404 — not a 401. A 401 says
    // "there is something here, bring credentials", which invites both the
    // sign-in hunt and a stranger's curiosity. 404 says nothing at all.
    if (route !== '/mcp') {
      res.writeHead(404).end();
      return;
    }

    const authorised = keyMatches(req.headers.authorization);

    const caller = callerOf(req);

    // Lock one: only Anthropic's servers may ask at all. Their own machine is
    // always allowed, so they can test without going out to the internet and
    // back. A refusal here is logged, because a stranger finding this
    // address is exactly the thing they would want to know about.
    if (addressCheckOn() && !isLocal(caller.ip) && !inAnthropicRange(caller.ip)) {
      db.logEvent('Remote', 'Refused: not Anthropic', caller.ip);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }

    if (!authorised) {
      // Logged with the address that tried: either a misconfiguration or
      // somebody having a go, and both are worth them seeing.
      db.logEvent('Remote', 'Refused: wrong key', caller.ip);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    try {
      const body = await readJson(req);
      const { mcp } = buildServer();
      const transport = new StreamableHTTPServerTransport({
        // Stateless: no session ids to keep, nothing to leak between calls.
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });

      res.on('close', () => {
        transport.close();
        mcp.close();
      });

      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error('Command Center: remote MCP request failed —', e.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'request failed' }));
      }
    }
  });

  server.listen(PORT, HOST, () => {
    const { count } = buildServer();
    console.log('Command Center: remote access listening on '
      + HOST + ':' + PORT + ' with ' + count + ' read-only tools');
  });

  server.on('error', (e) => {
    console.error('Command Center: remote access could not start —', e.message);
    server = null;
  });

  return { running: true, port: PORT };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // A request this large is not a question about their calendar.
      if (raw.length > 1024 * 1024) {
        reject(new Error('request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('bad JSON')); }
    });
    req.on('error', reject);
  });
}

function stop() {
  if (!server) return;
  server.close();
  server = null;
}

/**
 * The public address of this machine, without the key on it.
 *
 * Set when a tunnel is put in front of the app. Kept as a setting rather
 * than worked out from Tailscale, so the app does not need to know or care
 * which tunnel is in use.
 */
function publicBase() {
  return db.getSetting('remote_mcp_public_url', '').replace(/\/+$/, '');
}

function setPublicBase(url) {
  db.setSetting('remote_mcp_public_url', String(url || '').trim().replace(/\/+$/, ''));
  return status();
}

/**
 * The address for Claude's connector box. No key on it — that goes in a
 * header — so this one is safe to see, copy and paste anywhere.
 */
function connectorUrl() {
  const base = publicBase();
  if (!base) return '';
  return base + '/mcp';
}

/**
 * The value for the connector's Authorization header, key included.
 * Built here so the key travels to the clipboard and never sits in the
 * page's data waiting to be looked at.
 */
function headerValue() {
  return 'Bearer ' + token();
}

function status() {
  return {
    running: !!server,
    enabled: enabled(),
    addressCheck: addressCheckOn(),
    port: PORT,
    host: HOST,
    publicBase: publicBase(),
    tools: buildServer().count
  };
}

module.exports = {
  start, stop, status, token,
  setEnabled, setAddressCheck,
  connectorUrl, headerValue, rotateToken, setPublicBase, publicBase,
  PORT, HOST
};
