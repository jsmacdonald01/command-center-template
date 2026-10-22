import { useCallback, useEffect, useState } from 'react';
import Panel, { PanelLabel } from '../components/Panel.jsx';
import './LibraryPanel.css';

/**
 * The library.
 *
 * Every document the owner has — from every documents box on every page,
 * plus anything imported straight into the library — in one place, with a
 * search box that looks *inside* them rather than at their names.
 *
 * It reads the documents boxes rather than owning them. Those boxes stay as
 * they are on their own pages: each is the handful of documents that page
 * is about, and burying them under a few hundred imported files would cost
 * the page its point.
 *
 * Two states, and the difference matters. Browsing shows what is in the
 * library. Searching shows only what answers the question, with the words
 * around the hit and the place it came from, so an answer built on it can
 * be checked. A search that finds nothing says so — it does not quietly
 * fall back to showing everything, which would read as an answer.
 */

/** 'read' · 'photo' · 'failed' · 'unread', in their words rather than ours. */
const STATE_LABEL = {
  read: '',
  // Said on every row rather than hidden: these words were read off a
  // picture and can be wrong, and they should know which answers rest on a
  // machine's guess at someone's handwriting.
  ocr: 'read from a scan',
  photo: 'picture only',
  failed: 'could not read',
  unread: 'not read yet'
};

/**
 * Renaming here reaches every document, wherever it lives. The rename goes
 * through the app's ordinary update path rather than a call of its own, so
 * a document renamed here is renamed in its own box too, without waiting
 * for a reload.
 */
function Row({ doc, onRename }) {
  const label = STATE_LABEL[doc.state] || '';
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(doc.name);

  const commit = () => {
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== doc.name) onRename(doc, next);
  };

  if (renaming) {
    return (
      <div className="cc-lib-row">
        <input
          className="cc-lib-rename"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); setRenaming(false); }
          }}
          aria-label="Document name"
        />
        <span className="cc-lib-where">{doc.where}</span>
      </div>
    );
  }

  return (
    <div className={`cc-lib-row${doc.state === 'read' || doc.state === 'ocr' ? '' : ' is-quiet'}`}>
      <button
        type="button"
        className="cc-lib-name"
        title={`Open ${doc.name}`}
        onClick={() => window.cc.files.open(doc.filePath)}
      >
        {doc.name}
      </button>
      {onRename && (
        <button
          type="button"
          className="cc-lib-rename-btn"
          title="Rename"
          onClick={() => { setDraft(doc.name); setRenaming(true); }}
        >
          ✎
        </button>
      )}
      <span className="cc-lib-where">{doc.where}</span>
      {label && <span className="cc-lib-state">{label}</span>}
    </div>
  );
}

function Hit({ hit }) {
  return (
    <div className="cc-lib-hit">
      <div className="cc-lib-hit-head">
        <button
          type="button"
          className="cc-lib-name"
          title={`Open ${hit.name}`}
          onClick={() => window.cc.files.open(hit.filePath)}
        >
          {hit.name}
        </button>
        <span className="cc-lib-where">{hit.where}</span>
      </div>
      <div className="cc-lib-snippet">{hit.snippet}</div>
    </div>
  );
}

export default function LibraryPanel({ onUpdate, docsKey, title }) {
  const [docs, setDocs] = useState([]);
  const [counts, setCounts] = useState(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');

  const refresh = useCallback(async () => {
    if (!window.cc) return;
    const [list, summary] = await Promise.all([
      window.cc.library.list(),
      window.cc.library.summary()
    ]);
    setDocs(list || []);
    setCounts(summary || null);
  }, []);

  // Re-reads whenever a document is attached, renamed or removed anywhere
  // in the app, not just on mount.
  useEffect(() => { refresh(); }, [refresh, docsKey]);

  const runSearch = async (e) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) { setHits(null); return; }
    setBusy('Searching');
    const found = await window.cc.library.search(q);
    setHits(found || []);
    setBusy('');
  };

  const clear = () => { setQuery(''); setHits(null); };

  /** Both Add buttons report the same three numbers, because "47 added"
   *  hides the two things worth knowing: what cannot be searched, and what
   *  they already had. */
  const add = async (which) => {
    setBusy(which === 'folder' ? 'Reading the folder' : 'Reading');
    setSaid('');
    const res = which === 'folder'
      ? await window.cc.library.addFolder()
      : await window.cc.library.addFiles();
    setBusy('');
    if (!res || !res.ok) return;

    const parts = [`${res.added} added`];
    if (res.duplicates) parts.push(`${res.duplicates} already here`);
    if (res.photos) parts.push(`${res.photos} with no text in them`);
    if (res.failed) parts.push(`${res.failed} failed`);
    setSaid(parts.join(' · '));
    refresh();
  };

  const searching = hits !== null;

  return (
    <Panel className="cc-lib">
      <div className="cc-widget-head">
        <PanelLabel>{title || 'Library'}</PanelLabel>
        <span className="cc-lib-actions">
          <button type="button" className="cc-pill cc-pill--tiny" onClick={() => add('files')}>
            Add files
          </button>
          <button type="button" className="cc-pill cc-pill--tiny" onClick={() => add('folder')}>
            Add folder
          </button>
        </span>
      </div>

      <form className="cc-lib-searchbar" onSubmit={runSearch}>
        <input
          type="search"
          className="cc-lib-input"
          placeholder="Search inside every document"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && (
          <button type="button" className="cc-pill cc-pill--tiny" onClick={clear}>
            Clear
          </button>
        )}
      </form>

      {/* One line of truth about the pile. The picture-only count is here
          rather than hidden, because those documents cannot be searched and
          the owner should not have to wonder why an answer missed one. */}
      <div className="cc-lib-summary">
        {busy && <span className="cc-lib-busy">{busy}…</span>}
        {!busy && said && <span className="cc-lib-said">{said}</span>}
        {!busy && !said && counts && (
          <span>
            {counts.total} document{counts.total === 1 ? '' : 's'} · {counts.read} searchable
            {counts.ocr ? ` · ${counts.ocr} read from a scan` : ''}
            {counts.photos ? ` · ${counts.photos} picture only` : ''}
            {counts.unread ? ` · ${counts.unread} not read yet` : ''}
            {counts.failed ? ` · ${counts.failed} could not be read` : ''}
          </span>
        )}
      </div>

      <div className="cc-lib-body">
        {searching && hits.length === 0 && (
          <div className="cc-widget-empty">
            Nothing in any document says that.
          </div>
        )}
        {searching && hits.map((hit) => <Hit key={hit.filePath + hit.snippet} hit={hit} />)}

        {!searching && docs.length === 0 && (
          <div className="cc-widget-empty">
            Nothing yet. Add files, or point it at a folder.
          </div>
        )}
        {!searching && docs.map((doc) => (
          <Row
            key={doc.filePath}
            doc={doc}
            onRename={onUpdate && (async (d, name) => {
              await onUpdate(d.type, d.listPath, d.id, { name });
              refresh();
            })}
          />
        ))}
      </div>
    </Panel>
  );
}
