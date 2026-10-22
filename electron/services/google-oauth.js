const { shell, safeStorage, app } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

const CLIENT_CONFIG_PATH = path.join(__dirname, 'google-oauth-client.json');

function tokenFilePath(scopeKey) {
  return path.join(app.getPath('userData'), `google-tokens-${scopeKey}.bin`);
}

function loadClientConfig() {
  if (!fs.existsSync(CLIENT_CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(CLIENT_CONFIG_PATH, 'utf8'));
    const cfg = raw.installed || raw.web;
    if (!cfg || !cfg.client_id || !cfg.client_secret) return null;
    return { clientId: cfg.client_id, clientSecret: cfg.client_secret };
  } catch (e) {
    return null;
  }
}

function saveTokens(scopeKey, tokens) {
  const json = JSON.stringify(tokens);
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
  fs.writeFileSync(tokenFilePath(scopeKey), data);
}

function loadTokens(scopeKey) {
  const file = tokenFilePath(scopeKey);
  if (!fs.existsSync(file)) return null;
  try {
    const data = fs.readFileSync(file);
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8');
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function clearTokens(scopeKey) {
  const file = tokenFilePath(scopeKey);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

async function buildOAuth2Client() {
  const { google } = require('googleapis');
  const cfg = loadClientConfig();
  if (!cfg) {
    const err = new Error('missing-client-config');
    err.code = 'missing-client-config';
    throw err;
  }
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
}

function startLoopbackServer() {
  return new Promise((resolve, reject) => {
    let resolveCode, rejectCode;
    const codePromise = new Promise((res2, rej2) => { resolveCode = res2; rejectCode = rej2; });

    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://127.0.0.1');
        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (code) {
          res.end('<html><body style="font-family:sans-serif;padding:40px;">Command Center connected. You can close this tab.</body></html>');
        } else {
          res.end('<html><body style="font-family:sans-serif;padding:40px;">Connection failed' + (error ? ': ' + error : '') + '. Close this tab and try again in Command Center.</body></html>');
        }
        server.close();
        if (code) resolveCode(code); else rejectCode(new Error(error || 'no_code'));
      } catch (e) {
        server.close();
        rejectCode(e);
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: server.address().port, codePromise });
    });
  });
}

async function connect(scopeKey, scopes) {
  const oAuth2Client = await buildOAuth2Client();
  const { port, codePromise } = await startLoopbackServer();
  const redirectUri = `http://127.0.0.1:${port}`;

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    redirect_uri: redirectUri
  });

  await shell.openExternal(authUrl);
  const code = await codePromise;
  const { tokens } = await oAuth2Client.getToken({ code, redirect_uri: redirectUri });
  // Record what this token was granted. Without it a token issued before
  // a scope was added still reads as "connected", and every write fails
  // with a 403 that nothing in the app can explain.
  saveTokens(scopeKey, Object.assign({}, tokens, { cc_scopes: scopes }));
  return true;
}

/**
 * What the stored token is actually allowed to do.
 *
 * Tokens issued before this was recorded have no list, and those were all
 * read-only — so an unknown token is treated as read-only rather than
 * assumed capable.
 */
function grantedScopes(scopeKey) {
  const tokens = loadTokens(scopeKey);
  if (!tokens) return [];
  if (Array.isArray(tokens.cc_scopes)) return tokens.cc_scopes;
  return String(tokens.scope || '').split(/\s+/).filter(Boolean);
}

function hasScope(scopeKey, scope) {
  return grantedScopes(scopeKey).includes(scope);
}

async function getAuthorizedClient(scopeKey) {
  const tokens = loadTokens(scopeKey);
  if (!tokens) return null;
  const oAuth2Client = await buildOAuth2Client();
  oAuth2Client.setCredentials(tokens);
  oAuth2Client.on('tokens', (newTokens) => {
    saveTokens(scopeKey, Object.assign({}, tokens, newTokens));
  });
  return oAuth2Client;
}

function isConnected(scopeKey) {
  return !!loadTokens(scopeKey);
}

/**
 * Did this fail because Google will not accept the sign-in any more?
 *
 * There are two shapes and only one was being caught. An expired *access*
 * token comes back from the API itself as 401 or 403. A dead *refresh*
 * token fails earlier, at the token endpoint, and arrives as the string
 * `invalid_grant` carrying no HTTP status at all — so it fell past the
 * status check, was reported as a working connection with a strange
 * message, and the app showed an empty calendar rather than saying the
 * sign-in was gone.
 *
 * That is what 7 to 14 August 2026 looked like: "Nothing scheduled" for
 * three days running, under a status bar claiming a fresh sync.
 *
 * `isConnected` above is not the answer to this question — it only says a
 * token file exists on disk, and a rejected token is still a file.
 */
function isAuthFailure(e) {
  const status = (e && e.code) || (e && e.response && e.response.status);
  if (status === 401 || status === 403) return true;
  const message = String((e && e.message) || '');
  return /invalid_grant|invalid_token|unauthorized_client|expired or revoked/i.test(message);
}

function disconnect(scopeKey) {
  clearTokens(scopeKey);
}

module.exports = {
  connect, getAuthorizedClient, isConnected, disconnect, loadClientConfig,
  grantedScopes, hasScope, isAuthFailure
};
