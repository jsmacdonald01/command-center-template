// Site icons for the finance quick links.
//
// Fetched from each institution's own site and cached on disk, so there
// is no third-party icon service in the middle learning which banks the
// user visits. A miss falls back to the monogram tile.
//
// Standard paths are tried first, then the homepage's declared <link
// rel="icon">, because plenty of real sites (tsp.gov) keep their icons
// under a custom path and serve 404 at /favicon.ico.

const fs = require('fs');
const path = require('path');
const { app, net } = require('electron');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_BYTES = 400 * 1024;
const TIMEOUT_MS = 10000;

const CANDIDATES = ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/favicon.ico'];

const MIME = {
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

function cacheDir() {
  const dir = path.join(app.getPath('userData'), 'favicons');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function toDataUrl(buffer, ext) {
  return `data:${MIME[ext] || 'image/png'};base64,${buffer.toString('base64')}`;
}

async function request(url, expectImage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Electron's net goes through Chromium's stack. Node's own fetch has
    // a distinct TLS fingerprint that bot protection (Cloudflare) turns
    // away even when the same request succeeds from a browser or curl.
    const res = await net.fetch(url, {
      headers: { 'User-Agent': UA, Accept: expectImage ? 'image/*' : 'text/html' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (expectImage) {
      if (!/image|icon|octet-stream/i.test(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return (buf.length && buf.length <= MAX_BYTES) ? buf : null;
    }
    return await res.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Icon URLs declared in the page head, largest declared size first. */
function iconsFromHtml(html, baseUrl) {
  const found = [];
  const tags = html.match(/<link[^>]+>/gi) || [];

  tags.forEach((tag) => {
    if (!/rel\s*=\s*["'][^"']*icon/i.test(tag)) return;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!href) return;
    const sizes = tag.match(/sizes\s*=\s*["'](\d+)/i);
    try {
      found.push({ url: new URL(href[1], baseUrl).toString(), size: sizes ? Number(sizes[1]) : 0 });
    } catch (e) { /* skip unparseable href */ }
  });

  return found.sort((a, b) => b.size - a.size).map((i) => i.url);
}

function extensionFor(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return MIME[ext] ? ext : '.png';
}

/**
 * Returns a data URL, or null when the site offers nothing usable.
 * `directUrl` skips discovery for sites that block automated requests.
 */
async function get(siteUrl, directUrl) {
  let origin;
  let host;
  try {
    const parsed = new URL(siteUrl);
    origin = parsed.origin;
    host = parsed.host;
  } catch (e) {
    return null;
  }

  const dir = cacheDir();
  const existing = fs.readdirSync(dir).find((f) => f.startsWith(`${host}.`));
  if (existing) {
    // A zero-byte marker records "this site has no icon", so a failure
    // isn't retried on every launch.
    const buf = fs.readFileSync(path.join(dir, existing));
    return buf.length ? toDataUrl(buf, path.extname(existing)) : null;
  }

  const attempts = directUrl ? [directUrl] : CANDIDATES.map((c) => origin + c);

  if (!directUrl) {
    const html = await request(origin + '/', false);
    if (html) attempts.push(...iconsFromHtml(html, origin));
  }

  for (const url of attempts) {
    const buf = await request(url, true);
    if (buf) {
      const ext = extensionFor(url);
      fs.writeFileSync(path.join(dir, host + ext), buf);
      return toDataUrl(buf, ext);
    }
  }

  fs.writeFileSync(path.join(dir, `${host}.none`), Buffer.alloc(0));
  return null;
}

module.exports = { get };
