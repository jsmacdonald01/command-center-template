import { useCallback, useEffect, useState } from 'react';

/**
 * Google connection and, more importantly, what it is allowed to do.
 *
 * The connect buttons used to live on the Home page and disappear once
 * connected, which meant there was no way to reconnect — and no way to
 * grant the agent permission to create a calendar event without deleting the
 * token by hand. Connection state belongs in Settings for the same reason
 * every other switch here: something that changes what the app may do
 * on the owner's behalf should not be invisible once it is set.
 *
 * Read and write are shown separately on purpose. "Connected" was the
 * misleading word — it was true while every write was being refused.
 */
function Service({ label, status, onConnect, busy, writeLabel }) {
  if (!status) return null;

  const state = !status.connected
    ? 'Not connected'
    : status.canWrite ? 'Connected — the agent can read and make changes'
      : 'Connected for reading only';

  return (
    <div className="cc-google-row">
      <div>
        <div className="cc-field-label">{label}</div>
        <div className="cc-field-note">{state}</div>
      </div>
      <button
        type="button"
        className="cc-pill cc-pill--tiny"
        onClick={onConnect}
        disabled={busy || !status.hasConfig}
      >
        {busy ? 'Waiting for Google…'
          : !status.connected ? 'Connect'
            : status.canWrite ? 'Reconnect' : writeLabel}
      </button>
    </div>
  );
}

export default function GoogleSettings() {
  const [calendar, setCalendar] = useState(null);
  const [gmail, setGmail] = useState(null);
  const [busy, setBusy] = useState(null);

  const refresh = useCallback(async () => {
    if (!window.cc) return;
    setCalendar(await window.cc.calendar.status());
    setGmail(await window.cc.gmail.status());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = useCallback(async (which) => {
    setBusy(which);
    try {
      // Reconnecting re-runs consent, which is the only way to widen what
      // an existing token is allowed to do.
      await (which === 'calendar' ? window.cc.calendar.connect() : window.cc.gmail.connect());
    } catch (e) { /* the button state tells the story */ }
    setBusy(null);
    refresh();
  }, [refresh]);

  const anythingReadOnly = (calendar && calendar.connected && !calendar.canWrite)
    || (gmail && gmail.connected && !gmail.canWrite);

  return (
    <div className="cc-setting">
      <div className="cc-field-label">Google</div>
      <div className="cc-field-note">
        {calendar && !calendar.hasConfig
          ? 'Needs a one-time setup first — see docs/integrations/google.md.'
          : anythingReadOnly
            ? 'Reconnect to let the agent add calendar events and write drafts.'
            : 'What the agent may do with your calendar and mail.'}
      </div>

      <div className="cc-google-list">
        <Service
          label="Calendar" status={calendar} busy={busy === 'calendar'}
          writeLabel="Allow changes" onConnect={() => connect('calendar')}
        />
        <Service
          label="Gmail" status={gmail} busy={busy === 'gmail'}
          writeLabel="Allow drafts" onConnect={() => connect('gmail')}
        />
      </div>
    </div>
  );
}
