import { useCallback, useEffect, useState } from 'react';
import Panel, { PanelLabel } from '../components/Panel.jsx';
import SourceMark from '../components/SourceMark.jsx';
import { parse, inline } from '../lib/markdown.js';

/**
 * The vault, on the page.
 *
 * Two halves: the folders on the left the way Obsidian lists them, and the
 * note itself on the right. It reads and never writes — "Edit" hands the
 * note to Obsidian, which is the thing that is actually good at it.
 *
 * The point is not to replace Obsidian. It is that a note they wrote about a
 * build should be readable while they are looking at the build, without
 * leaving the app and losing the thread.
 */

/** One row of the tree. Folders open and close; notes load on the right. */
function TreeNode({ node, depth, openFolders, onToggle, selected, onSelect }) {
  const pad = { paddingLeft: `${depth * 12}px` };

  if (node.type === 'folder') {
    const open = openFolders.has(node.path);
    return (
      <>
        <button
          type="button"
          className={`cc-vault-row cc-vault-folder${open ? ' is-open' : ''}`}
          style={pad}
          onClick={() => onToggle(node.path)}
        >
          <span className="cc-vault-caret" aria-hidden="true">{open ? '−' : '+'}</span>
          <span className="cc-vault-name">{node.name}</span>
        </button>
        {open && node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            openFolders={openFolders}
            onToggle={onToggle}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }

  return (
    <button
      type="button"
      className={`cc-vault-row cc-vault-note${selected === node.path ? ' is-selected' : ''}`}
      style={pad}
      onClick={() => onSelect(node.path)}
    >
      <span className="cc-vault-name">{node.name}</span>
    </button>
  );
}

/**
 * Inline spans. Wikilinks jump to the note; real links open in a browser.
 *
 * Bold and italic run through this again rather than printing their text,
 * because the vault writes **Keep [[Next Session]] under a page** — links
 * live inside emphasis constantly, and rendering the inside as plain text
 * put raw brackets on the page.
 */
function Inline({ text, onOpenNote }) {
  return inline(text).map((piece, i) => {
    if (piece.kind === 'strong') {
      return <strong key={i}><Inline text={piece.text} onOpenNote={onOpenNote} /></strong>;
    }
    if (piece.kind === 'em') {
      return <em key={i}><Inline text={piece.text} onOpenNote={onOpenNote} /></em>;
    }
    if (piece.kind === 'code') return <code key={i} className="cc-mono cc-vault-code">{piece.text}</code>;
    if (piece.kind === 'wikilink') {
      return (
        <button key={i} type="button" className="cc-vault-wikilink" onClick={() => onOpenNote(piece.target)}>
          {piece.text}
        </button>
      );
    }
    if (piece.kind === 'link') {
      return (
        <button
          key={i}
          type="button"
          className="cc-vault-wikilink"
          onClick={() => (/^https?:/i.test(piece.href)
            ? window.cc.shell.openExternal(piece.href)
            : onOpenNote(piece.href.replace(/\.md$/i, '')))}
        >
          {piece.text}
        </button>
      );
    }
    return <span key={i}>{piece.text}</span>;
  });
}

function Blocks({ body, onOpenNote }) {
  return parse(body).map((block, i) => {
    if (block.type === 'heading') {
      const level = Math.min(block.level, 4);
      return (
        <div key={i} className={`cc-vault-h cc-vault-h${level}`}>
          <Inline text={block.text} onOpenNote={onOpenNote} />
        </div>
      );
    }
    if (block.type === 'rule') return <div key={i} className="cc-vault-rule" />;
    if (block.type === 'code') return <pre key={i} className="cc-mono cc-vault-pre">{block.text}</pre>;
    if (block.type === 'quote') {
      return (
        <blockquote key={i} className="cc-vault-quote">
          <Inline text={block.text} onOpenNote={onOpenNote} />
        </blockquote>
      );
    }
    if (block.type === 'list') {
      return (
        <ul key={i} className="cc-vault-list">
          {block.items.map((item, n) => (
            <li key={n} className={item.nested ? 'is-nested' : ''}>
              <Inline text={item.text} onOpenNote={onOpenNote} />
            </li>
          ))}
        </ul>
      );
    }
    if (block.type === 'table') {
      return (
        <div key={i} className="cc-vault-tablewrap">
          <table className="cc-vault-table">
            <thead>
              <tr>{block.head.map((cell, n) => (
                <th key={n}><Inline text={cell} onOpenNote={onOpenNote} /></th>
              ))}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, n) => (
                <tr key={n}>{row.map((cell, m) => (
                  <td key={m}><Inline text={cell} onOpenNote={onOpenNote} /></td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <p key={i} className="cc-vault-p">
        <Inline text={block.text} onOpenNote={onOpenNote} />
      </p>
    );
  });
}

export default function VaultPanel({ requested, onRequestHandled, title }) {
  const [tree, setTree] = useState([]);
  const [openFolders, setOpenFolders] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState(null);
  const [error, setError] = useState('');

  // Re-read when the window regains focus, so notes written in Obsidian —
  // or a folder chosen in Settings — show up without a restart.
  useEffect(() => {
    let alive = true;
    const loadTree = () => window.cc.vault.tree().then((nodes) => {
      if (alive) setTree(Array.isArray(nodes) ? nodes : []);
    });
    loadTree();
    window.addEventListener('focus', loadTree);
    window.addEventListener('cc-vault-changed', loadTree);
    return () => {
      alive = false;
      window.removeEventListener('focus', loadTree);
      window.removeEventListener('cc-vault-changed', loadTree);
    };
  }, []);

  const load = useCallback(async (name) => {
    if (!name) return;
    const result = await window.cc.vault.read(name);
    if (result && result.ok) {
      setNote(result);
      setError('');
      // Highlight what was opened, not what was asked for: a link reads
      // [[Next Session]] and the note is Handoffs/Next Session.
      setSelected(result.name);
      // Opening a note from a link or a Future Build should also reveal
      // where it lives, or the tree and the reader disagree.
      const parts = result.name.split('/');
      if (parts.length > 1) {
        setOpenFolders((prev) => {
          const next = new Set(prev);
          parts.slice(0, -1).forEach((_, i) => next.add(parts.slice(0, i + 1).join('/')));
          return next;
        });
      }
    } else {
      setNote(null);
      setSelected(name);
      setError((result && result.error) || 'That note could not be read.');
    }
  }, []);

  // A build's Notes button asks for a note by name; this is where it lands.
  useEffect(() => {
    if (!requested) return;
    load(requested);
    if (onRequestHandled) onRequestHandled();
  }, [requested, load, onRequestHandled]);

  const toggle = (path) => setOpenFolders((prev) => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  return (
    <Panel variant="primary" className="cc-vault-panel">
      <div className="cc-widget-head">
        <PanelLabel>
          <SourceMark url="https://obsidian.md" />
          {title || 'Notebook'}
        </PanelLabel>
        {note && (
          <button
            type="button"
            className="cc-pill cc-pill--tiny"
            title="Open this note in Obsidian"
            onClick={() => window.cc.vault.open(note.name)}
          >
            Edit in Obsidian
          </button>
        )}
      </div>

      <div className="cc-vault-body">
        <div className="cc-vault-tree">
          {tree.length === 0 && (
            <div className="cc-band-empty">
              No notes found. Choose your Obsidian notebook folder in Settings.
            </div>
          )}
          {tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              openFolders={openFolders}
              onToggle={toggle}
              selected={selected}
              onSelect={load}
            />
          ))}
        </div>

        <div className="cc-vault-reader">
          {error && <div className="cc-band-empty">{error}</div>}
          {!error && !note && <div className="cc-band-empty">Pick a note.</div>}
          {!error && note && (
            <>
              <div className="cc-vault-readerhead cc-mono">{note.name}</div>
              <Blocks body={note.body} onOpenNote={load} />
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
