// Enough markdown to read the vault, and no more.
//
// The notes are documentation: headings, tables, bullets, quotes, the odd
// code block, and Obsidian's [[wikilinks]] between them. That is the whole
// list, so this parses that list rather than pulling in a library the app
// would then have to carry, update and package.
//
// It returns a flat array of blocks, which the panel renders. Splitting it
// this way keeps every decision about *what a line means* here, and every
// decision about *how it looks* in one CSS file.

/**
 * Inline spans: **bold**, *italic*, `code`, [[wikilink]] and [text](url).
 * Returns pieces rather than HTML — nothing built here is ever handed to
 * innerHTML, which is the bug V1 shipped.
 */
export function inline(text) {
  const pieces = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > last) pieces.push({ kind: 'text', text: text.slice(last, match.index) });
    const token = match[0];

    if (token.startsWith('**')) {
      pieces.push({ kind: 'strong', text: token.slice(2, -2) });
    } else if (token.startsWith('`')) {
      pieces.push({ kind: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('[[')) {
      // Obsidian allows [[note|shown as this]].
      const body = token.slice(2, -2);
      const bar = body.indexOf('|');
      const target = bar === -1 ? body : body.slice(0, bar);
      pieces.push({ kind: 'wikilink', text: bar === -1 ? body : body.slice(bar + 1), target: target.trim() });
    } else if (token.startsWith('[')) {
      const cut = token.indexOf('](');
      pieces.push({ kind: 'link', text: token.slice(1, cut), href: token.slice(cut + 2, -1) });
    } else {
      pieces.push({ kind: 'em', text: token.slice(1, -1) });
    }

    last = match.index + token.length;
    match = pattern.exec(text);
  }

  if (last < text.length) pieces.push({ kind: 'text', text: text.slice(last) });
  return pieces;
}

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Markdown text as blocks: heading, list, table, quote, code, rule, para. */
export function parse(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  // Obsidian's frontmatter is metadata, not reading material.
  if (lines[0] && lines[0].trim() === '---') {
    const close = lines.indexOf('---', 1);
    if (close !== -1) i = close + 1;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    if (line.trim().startsWith('```')) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { body.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    // A rule, but only the horizontal kind — a table's ---|--- looks
    // similar and is handled above it.
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (isTableRow(line)) {
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        if (!isTableRule(lines[i])) rows.push(cells(lines[i]));
        i += 1;
      }
      if (rows.length) blocks.push({ type: 'table', head: rows[0], rows: rows.slice(1) });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      // Obsidian callouts open with [!info]; the tag is markup, not text.
      const text = body.join(' ').replace(/^\[![a-z]+\]\s*/i, '').trim();
      blocks.push({ type: 'quote', text });
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push({
          text: lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''),
          // Two spaces or more means it sits under the item above it.
          nested: /^\s{2,}/.test(lines[i])
        });
        i += 1;

        // The vault wraps at 72 characters, so most items run onto an
        // indented second line. That is the same sentence continuing, not
        // a new bullet and not a stray paragraph underneath the list.
        while (
          i < lines.length && lines[i].trim()
          && /^\s{2,}/.test(lines[i])
          && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])
        ) {
          items[items.length - 1].text += ' ' + lines[i].trim();
          i += 1;
        }
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length && lines[i].trim()
      && !/^\s*(#{1,6}\s|>|```|[-*+]\s|\d+\.\s)/.test(lines[i])
      && !isTableRow(lines[i])
      && !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

/** First real sentence of a note, for a one-line preview. */
export function summarise(markdown, max = 120) {
  const first = parse(markdown).find((b) => b.type === 'paragraph' || b.type === 'quote');
  if (!first) return '';
  const text = first.text.replace(/[*`\[\]]/g, '');
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}
