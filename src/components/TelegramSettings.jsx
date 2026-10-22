import { useCallback, useEffect, useState } from 'react';
import SourceMark from './SourceMark.jsx';

/**
 * Bot token and phone pairing.
 *
 * The token is write-only from here — it is stored encrypted by Windows
 * and never read back into the interface, so it cannot be shoulder-read
 * or copied out of the app once saved.
 */
export default function TelegramSettings() {
  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [code, setCode] = useState(null);

  const refresh = useCallback(async () => {
    if (!window.cc) return;
    try { setStatus(await window.cc.telegram.status()); } catch (e) { /* leave as is */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // While a pairing code is live, watch for the phone binding itself.
  useEffect(() => {
    if (!code) return undefined;
    const id = setInterval(async () => {
      const s = await window.cc.telegram.status();
      setStatus(s);
      if (s && s.paired) { setCode(null); setMessage('Paired.'); }
    }, 2000);
    return () => clearInterval(id);
  }, [code]);

  const saveToken = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await window.cc.telegram.setToken(draft.trim());
    setBusy(false);
    setDraft('');
    setMessage(res && res.ok ? `Connected to @${res.username}` : `Rejected: ${res && res.error}`);
    refresh();
  };

  const pair = async () => {
    const res = await window.cc.telegram.pair();
    setCode(res.code);
    setMessage(null);
  };

  const unpair = async () => {
    await window.cc.telegram.unpair();
    setCode(null);
    setMessage('Unpaired.');
    refresh();
  };

  const disconnect = async () => {
    await window.cc.telegram.clearToken();
    setCode(null);
    setMessage('Token removed.');
    refresh();
  };

  const state = status || {};

  return (
    <div className="cc-setting">
      <div className="cc-field-label">
        <SourceMark url="https://telegram.org" size={13} />
        Telegram bot
      </div>
      <div className="cc-field-note">
        {!state.hasToken && 'No token saved — the bot is off.'}
        {state.hasToken && !state.paired && 'Connected, waiting to be paired with your phone.'}
        {state.hasToken && state.paired && 'Connected and paired. Answers only your chat.'}
        {state.fromEnv && ' Using CC_TELEGRAM_BOT_TOKEN from the environment.'}
      </div>

      {!state.hasToken && (
        <form className="cc-key-form" onSubmit={saveToken}>
          <input
            type="password"
            className="cc-key-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Bot token from @BotFather"
            autoComplete="off"
          />
          <button type="submit" className="cc-pill cc-pill--tiny" disabled={busy || !draft.trim()}>
            {busy ? 'Checking…' : 'Save'}
          </button>
        </form>
      )}

      {state.hasToken && !state.paired && (
        <>
          {code
            ? (
              <div className="cc-pair">
                <span className="cc-mono cc-pair-code">{code}</span>
                <span className="cc-field-note">
                  Send this to your bot as a message. Expires in 10 minutes.
                </span>
              </div>
            )
            : <button type="button" className="cc-pill cc-pill--tiny" onClick={pair}>Pair my phone</button>}
        </>
      )}

      <div className="cc-setting-actions">
        {state.paired && (
          <button type="button" className="cc-pill cc-pill--tiny" onClick={unpair}>Unpair</button>
        )}
        {state.hasToken && !state.fromEnv && (
          <button type="button" className="cc-pill cc-pill--tiny" onClick={disconnect}>Remove token</button>
        )}
      </div>

      {message && <div className="cc-field-note">{message}</div>}
    </div>
  );
}
