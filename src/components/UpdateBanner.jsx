import { useEffect, useState } from 'react';
import './UpdateBanner.css';

/**
 * "A new version is ready" — shown only once an update has finished
 * downloading in the background. One click closes the app, installs it and
 * opens it again. Their data is in a separate folder, so nothing is lost.
 */
export default function UpdateBanner() {
  const [status, setStatus] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!window.cc || !window.cc.updates) return undefined;
    window.cc.updates.status().then(setStatus).catch(() => {});
    return window.cc.updates.onChange(setStatus);
  }, []);

  if (!status || status.phase !== 'ready' || hidden) return null;

  const install = async () => {
    setBusy(true);
    const res = await window.cc.updates.install();
    if (!res || !res.ok) setBusy(false);
  };

  return (
    <div className="cc-update-banner" role="status">
      <span className="cc-update-text">
        A new version{status.version ? ` (${status.version})` : ''} is ready. Your information stays as it is.
      </span>
      <button type="button" className="cc-pill cc-pill--tiny cc-pill--solid" onClick={install} disabled={busy}>
        {busy ? 'Restarting…' : 'Update now'}
      </button>
      <button type="button" className="cc-pill cc-pill--tiny" onClick={() => setHidden(true)} disabled={busy}>
        Later
      </button>
    </div>
  );
}
