// Top stories from public RSS. No API key, no signup, no quota, nothing
// that can expire. Feed URLs live in settings so they can be swapped
// without touching code.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_FEEDS = [
  { source: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
  { source: 'BBC', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { source: 'CBS', url: 'https://www.cbsnews.com/latest/rss/main' }
];

const HEADLINE_COUNT = 6;

function decodeEntities(str) {
  return String(str)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

// RSS <item> and Atom <entry> only — enough for public news feeds, and it
// avoids pulling in an XML parser dependency.
function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.map((block) => {
    let link = tag(block, 'link');
    if (!link) {
      const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (href) link = href[1];
    }
    const published = tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'published');
    return {
      title: tag(block, 'title'),
      link,
      published,
      ts: published ? Date.parse(published) || 0 : 0
    };
  }).filter((i) => i.title && i.link);
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    return parseFeed(await res.text())
      .slice(0, 8)
      .map((i) => Object.assign(i, { source: feed.source }));
  } catch (e) {
    return [];
  }
}

/** Merged top headlines, newest first, one source never dominating. */
async function get(feeds) {
  const list = (feeds && feeds.length) ? feeds : DEFAULT_FEEDS;
  const results = await Promise.all(list.map(fetchFeed));
  const live = results.filter((r) => r.length);
  if (!live.length) return { ok: false, error: 'No feeds reachable' };

  // Round-robin across sources so one fast feed doesn't fill the widget.
  const merged = [];
  for (let i = 0; merged.length < HEADLINE_COUNT; i++) {
    let added = false;
    for (const source of live) {
      if (source[i]) { merged.push(source[i]); added = true; }
      if (merged.length >= HEADLINE_COUNT) break;
    }
    if (!added) break;
  }

  return { ok: true, items: merged, fetchedAt: Date.now() };
}

module.exports = { get, DEFAULT_FEEDS };
