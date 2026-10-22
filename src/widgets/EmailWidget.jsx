import Panel, { PanelLabel } from '../components/Panel.jsx';

/**
 * The newest Gmail messages, unread first in weight. Read-only — opening a
 * message opens Gmail in the browser.
 *
 * Config: { "type": "email", "title": "Email" }  (needs Google connected)
 */
export default function EmailWidget({ widget, live }) {
  const open = () => window.cc && window.cc.shell.openExternal('https://mail.google.com/');

  return (
    <Panel className="cc-w cc-w-email">
      <div className="cc-widget-head">
        <PanelLabel>{widget.title}</PanelLabel>
        {live.gmailConnected && (
          <span className="cc-field-note">{live.unreadCount || 0} unread</span>
        )}
      </div>

      {!live.gmailConnected && (
        <div className="cc-widget-empty">Connect Google in Settings to see your email here.</div>
      )}

      {live.gmailConnected && (live.email || []).length === 0 && (
        <div className="cc-widget-empty">Nothing in your inbox.</div>
      )}

      <div className="cc-w-rows">
        {(live.email || []).map((m) => (
          <button
            key={m.id}
            type="button"
            className={`cc-w-row cc-w-mail${m.unread ? ' is-unread' : ''}`}
            onClick={open}
            title="Open Gmail"
          >
            <span className="cc-w-main">
              <span className="cc-w-mail-from">{m.sender || m.from}</span>
              <span className="cc-field-note">{m.subject}</span>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}
