import { useCallback, useEffect, useState } from 'react';

/**
 * The agent, from the renderer's side.
 *
 * Deliberately thin. All the reasoning, tool use and approval logic lives
 * in the main process — this only sends a question, shows what came back,
 * and keeps the pending-approval list fresh. Putting any of the decisions
 * here would mean the phone and the desk could disagree about them.
 */
export default function useAtlas({ open, live }) {
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const [spend, setSpend] = useState(null);

  const refresh = useCallback(async () => {
    if (!window.cc || !window.cc.atlas) return;
    const [p, s] = await Promise.all([
      window.cc.atlas.proposals(),
      window.cc.atlas.spend()
    ]);
    setProposals(Array.isArray(p) ? p : []);
    setSpend(s && !s.error ? s : null);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!messages.length && window.cc) {
      window.cc.ai.history(20).then((rows) => {
        if (Array.isArray(rows)) setMessages(rows.map((r) => ({ role: r.role, text: r.text })));
      });
    }
    refresh();
  }, [open, refresh]);

  /**
   * Only the data, never the helpers.
   *
   * `live` also carries refreshCalendar/refreshEmail/refreshAll, and a
   * function cannot cross to the main process — Electron throws "An
   * object could not be cloned" and the question dies on the way out with
   * nothing shown on screen. Sending an explicit payload means adding a
   * helper to the hook can never break asking a question again.
   */
  const payload = useCallback(() => ({
    calendar: live && live.calendar ? live.calendar : [],
    email: live && live.email ? live.email : [],
    weather: live && live.weather ? live.weather : null
  }), [live]);

  const send = useCallback(async (override) => {
    const question = String(override ?? draft).trim();
    if (!question || thinking) return;

    setDraft('');
    setError(null);
    setMessages((m) => [...m, { role: 'me', text: question }]);
    setThinking(true);

    const res = await window.cc.atlas.ask(question, payload());
    setThinking(false);

    if (!res || !res.ok) {
      setError((res && res.error) || 'the agent could not answer that.');
      return;
    }
    setMessages((m) => [...m, {
      role: 'ai', text: res.text, toolsUsed: res.toolsUsed, hitLimit: res.hitLimit
    }]);
    // A proposal may have been prepared during that turn.
    if (res.proposals && res.proposals.length) refresh();
    else refresh();
  }, [draft, thinking, payload, refresh]);

  const approve = useCallback(async (id) => {
    const res = await window.cc.atlas.approve(id);
    setMessages((m) => [...m, {
      role: 'ai',
      text: res.ok
        ? `Done — ${res.summary}. I checked afterwards and it is there.`
        : `That did not work. ${res.error}`
    }]);
    refresh();
  }, [refresh]);

  const reject = useCallback(async (id) => {
    await window.cc.atlas.reject(id);
    refresh();
  }, [refresh]);

  const clear = useCallback(() => {
    window.cc.ai.clearHistory();
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages, proposals, draft, setDraft, thinking, error, spend,
    send, approve, reject, clear
  };
}
