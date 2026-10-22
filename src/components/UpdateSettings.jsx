import { useEffect, useState } from 'react';

/** What the update check is doing, in plain words. */
function describe(s) {
  if (!s) return 'Checking…';
  switch (s.phase) {
    case 'checking': return 'Looking for a new version…';
    case 'none': return 'You have the newest version.';
    case 'downloading': return `Downloading version ${s.version || ''}… ${s.percent || 0}%`;
    case 'ready': return `Version ${s.version || ''} is ready to install.`;
    case 'error':
    case 'unavailable': return s.error || 'Could not check for updates.';
    default: return 'Checks on its own when the app starts, and every few hours.';
  }
}

/**
 * Settings → Updates. New versions download on their own; this shows which
 * version is here, lets them look now, and installs one that is waiting.
 * Their information is kept in a separate folder, so updating never touches it.
 */
export default function UpdateSettings() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!window.cc || !window.cc.updates) return undefined;
    window.cc.updates.status().then(setStatus).catch(() => {});
    return window.cc.updates.onChange(setStatus);
  }, []);

  const check = async () => {
    setStatus((s) => ({ ...(s || {}), phase: 'checking' }));
    setStatus(await window.cc.updates.check());
  };

  const busy = status && (status.phase === 'checking' || status.phase === 'downloading');

  return (
    <div className="cc-setting">
      <div className="cc-field-label">Updates</div>
      <div className="cc-field-note">This is version {status ? status.current : '…'}.</div>
      <div className="cc-field-note">{describe(status)}</div>
      <div className="cc-field-note">Updating never changes your information or your own pages.</div>
      <div className="cc-setting-actions">
        {status && status.phase === 'ready' ? (
          <button type="button" className="cc-pill cc-pill--tiny" onClick={() => window.cc.updates.install()}>
            Update now
          </button>
        ) : (
          <button type="button" className="cc-pill cc-pill--tiny" onClick={check} disabled={busy}>
            Check for updates
          </button>
        )}
      </div>
    </div>
  );
}
