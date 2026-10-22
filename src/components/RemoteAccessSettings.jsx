import { useCallback, useEffect, useState } from 'react';

/**
 * Claude chat's access to Command Center — the "doorway" that lets the
 * Claude website and phone app read this dashboard. Off until turned on.
 *
 * Three things on screen: whether it is on, the public address it is
 * reached at (from Tailscale Funnel — see docs/integrations/claude-chat.md),
 * and buttons that copy the two things Claude's connector box asks for.
 * The key goes straight to the clipboard and is never shown.
 */
export default function RemoteAccessSettings() {
  const [state, setState] = useState(null);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState('');

  const refresh = useCallback(async () => {
    if (!window.cc) return;
    try { setState(await window.cc.remoteMcp.status()); } catch (e) { /* leave as is */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const running = !!(state && state.running);
  const reachable = !!(state && state.publicBase);

  const toggle = async () => setState(await window.cc.remoteMcp.setEnabled(!running));

  const saveAddress = async (e) => {
    e.preventDefault();
    const url = draft.trim();
    if (!/^https:\/\//i.test(url)) return;
    setState(await window.cc.remoteMcp.setPublicUrl(url));
    setDraft('');
  };

  const copyAddress = async () => {
    const got = await window.cc.remoteMcp.connectorUrl();
    if (!got.url) return;
    await navigator.clipboard.writeText(got.url);
    setCopied('address');
  };

  /** The Authorization header's value, key included. Straight to the
   *  clipboard, never on screen. */
  const copyKey = async () => {
    const got = await window.cc.remoteMcp.headerValue();
    await navigator.clipboard.writeText(got.value);
    setCopied('key');
  };

  return (
    <div className="cc-setting">
      <div className="cc-field-label">Claude chat access</div>

      <div className="cc-field-note">
        {!state
          ? 'Checking…'
          : running
            ? `On · ${state.tools} things it can read, none it can change`
            : 'Off · Claude chat cannot reach this computer'}
      </div>

      <div className="cc-field-note">
        {reachable
          ? `${state.publicBase.replace(/^https?:\/\//, '')}${state.addressCheck ? ' · Anthropic only' : ''}`
          : 'No public address yet'}
      </div>

      {!reachable && (
        <form className="cc-key-form" onSubmit={saveAddress}>
          <input
            className="cc-key-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://your-pc.your-tailnet.ts.net"
            autoComplete="off"
          />
          <button type="submit" className="cc-pill cc-pill--tiny" disabled={!/^https:\/\//i.test(draft.trim())}>
            Save
          </button>
        </form>
      )}

      <div className="cc-setting-actions">
        {reachable && (
          <button type="button" className="cc-pill cc-pill--tiny" onClick={copyAddress}>
            {copied === 'address' ? 'Copied' : 'Copy address'}
          </button>
        )}
        {reachable && (
          <button type="button" className="cc-pill cc-pill--tiny" onClick={copyKey}>
            {copied === 'key' ? 'Copied' : 'Copy key'}
          </button>
        )}
        <button type="button" className="cc-pill cc-pill--tiny" onClick={toggle} disabled={!state}>
          {running ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </div>
  );
}
