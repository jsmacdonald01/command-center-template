import { useEffect, useRef, useState } from 'react';
import SourceMark from './SourceMark.jsx';
import './EmailPeek.css';

/**
 * A quiet count of what's waiting, and a list you can drop open.
 *
 * Opening a row goes straight to that message in Gmail rather than the
 * inbox — if you already know which mail you want, landing on a list and
 * hunting for it again is a step for nothing. "Open Gmail" at the foot
 * covers the times you do want the whole inbox.
 */
function timeAgo(dateStr) {
  const ts = Date.parse(dateStr);
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function EmailPeek({ email, unreadCount, connected, onConnect }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Click-away and Escape, so it behaves like a menu rather than a panel
  // that has to be dismissed by its own button.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // u/0 — the account index, which is the form Gmail itself uses. Putting
  // the address in that slot was rejected with "account temporarily
  // unavailable", encoded or not.
  const base = 'https://mail.google.com/mail/u/0';
  const openUrl = (url) => window.cc && window.cc.shell.openExternal(url);

  const items = email || [];

  return (
    <div className="cc-peek" ref={wrapRef}>
      <button
        type="button"
        className="cc-pill cc-pill--tiny"
        onClick={() => (connected ? setOpen((v) => !v) : onConnect())}
        title={connected ? 'Recent mail' : 'Connect Gmail'}
      >
        <SourceMark url="https://mail.google.com" size={12} />
        Email
        {connected && unreadCount > 0 && <span className="cc-peek-count">{unreadCount}</span>}
      </button>

      {open && (
        <div className="cc-peek-menu">
          {items.length === 0 && <div className="cc-peek-empty">Nothing in the inbox.</div>}

          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`cc-peek-item${m.unread ? ' is-unread' : ''}`}
              onClick={() => { openUrl(`${base}/#inbox/${m.id}`); setOpen(false); }}
              title={m.subject}
            >
              <span className="cc-peek-row">
                <span className="cc-peek-sender">{m.sender || m.from}</span>
                <span className="cc-mono cc-peek-age">{timeAgo(m.date)}</span>
              </span>
              <span className="cc-peek-subject">{m.subject}</span>
            </button>
          ))}

          <button
            type="button"
            className="cc-peek-all"
            onClick={() => { openUrl(`${base}/#inbox`); setOpen(false); }}
          >
            Open Gmail ↗
          </button>
        </div>
      )}
    </div>
  );
}
