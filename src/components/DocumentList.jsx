import { useEffect, useRef, useState } from 'react';
import { bytes } from '../lib/format.js';
import './DocumentList.css';

/**
 * Attached files open from disk; reference-only rows just record where a
 * document lives. Attachments are stored as real files, not base64 rows.
 *
 * The name is a label, not the file. Renaming a row changes what they read
 * on screen and what a library search result shows; the file on disk keeps
 * the name it arrived with, so opening it, the nightly backup mirror and
 * the stored text all keep working.
 *
 * The row itself stays a single button that opens the file — that is the
 * thing they want nine times in ten. Renaming is the pencil, and it swaps
 * the row for a text box rather than making the name separately clickable,
 * because a name you can click means two targets in one row and a file that
 * opens when they meant to type.
 */
function RenameRow({ value, onSave, onCancel }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    if (ref.current) { ref.current.focus(); ref.current.select(); }
  }, []);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next); else onCancel();
  };

  return (
    <input
      ref={ref}
      className="cc-doc-rename"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      aria-label="Document name"
    />
  );
}

export default function DocumentList({
  items, entityType, onRemove, onAttach, onRename, emptyLabel
}) {
  const [renaming, setRenaming] = useState(null);

  const open = (item) => {
    if (item.filePath) window.cc.files.open(item.filePath);
  };

  return (
    <>
      {items.length === 0 && <div className="cc-hint">{emptyLabel}</div>}

      {items.map((item) => (
        <div key={item.id} className="cc-doc">
          {renaming === item.id ? (
            <RenameRow
              value={item.name}
              onSave={(name) => { setRenaming(null); onRename(entityType, item.id, name); }}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <button
              type="button"
              className="cc-doc-main"
              onClick={() => open(item)}
              disabled={!item.filePath}
              title={item.filePath ? 'Open file' : (item.link || 'No file attached')}
            >
              <span className="cc-doc-name">{item.name}</span>
              <span className="cc-doc-meta">
                {item.filePath ? bytes(item.size) || 'Attached' : (item.link || 'Reference')}
              </span>
            </button>
          )}
          {onRename && renaming !== item.id && (
            <button
              type="button"
              className="cc-doc-rename-btn"
              title="Rename"
              onClick={() => setRenaming(item.id)}
            >
              ✎
            </button>
          )}
          <button
            type="button"
            className="cc-row-remove is-always"
            title="Remove"
            onClick={() => onRemove(entityType, item.id)}
          >
            ×
          </button>
        </div>
      ))}

      <button type="button" className="cc-pill cc-pill--tiny" onClick={() => onAttach(entityType)}>
        Attach file
      </button>
    </>
  );
}
