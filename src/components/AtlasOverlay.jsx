import { useEffect, useRef } from 'react';
import Sphere from './Sphere.jsx';
import './AIOverlay.css';
import './AtlasOverlay.css';

/**
 * The agent, on screen.
 *
 * Three things make this different from the chat box it replaces: it shows
 * which tools were actually used, it shows what the agent has prepared and is
 * waiting on, and it shows what the month has cost. All three exist for
 * the same reason — an assistant you cannot see working is one you have to
 * take on faith.
 */

function ToolTrace({ names }) {
  if (!names || !names.length) return null;
  return (
    <div className="cc-atlas-trace">
      looked at {Array.from(new Set(names)).join(', ').replace(/_/g, ' ')}
    </div>
  );
}

function ProposalCard({ proposal, onApprove, onReject }) {
  const hours = Math.max(0, Math.round((proposal.expires_at - Date.now()) / 3600000));
  return (
    <div className="cc-atlas-proposal">
      <div className="cc-label cc-atlas-proposal-label">Needs your approval</div>
      <div className="cc-atlas-proposal-summary">{proposal.summary}</div>
      <div className="cc-atlas-proposal-meta">
        Nothing has changed yet · expires in {hours}h
      </div>
      <div className="cc-atlas-proposal-actions">
        <button type="button" className="cc-pill cc-pill--tiny" onClick={() => onApprove(proposal.id)}>
          Approve
        </button>
        <button type="button" className="cc-pill cc-pill--tiny cc-atlas-reject" onClick={() => onReject(proposal.id)}>
          No
        </button>
      </div>
    </div>
  );
}

export default function AtlasOverlay({ atlas, onClose }) {
  const {
    messages, proposals, draft, setDraft, thinking, error, spend,
    send, approve, reject, clear
  } = atlas;

  const inputRef = useRef(null);
  const transcriptRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, error, proposals]);

  const submit = (e) => { e.preventDefault(); send(); };

  return (
    <div
      className="cc-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Agent"
    >
      <div className="cc-overlay-panel cc-ai-panel">
        <div className="cc-ai-head">
          <div className="cc-ai-identity">
            <Sphere size="mini" />
            <span className="cc-label cc-ai-mode">{thinking ? 'Thinking' : 'Agent'}</span>
          </div>
          <div className="cc-ai-head-actions">
            {spend && (
              <span className={`cc-atlas-spend${spend.warning ? ' is-warning' : ''}`}>
                ${spend.spent.toFixed(2)} of ${spend.ceiling} this month
              </span>
            )}
            <button type="button" className="cc-pill cc-pill--tiny" onClick={clear}>Clear</button>
            <button type="button" className="cc-pill cc-pill--tiny" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="cc-ai-transcript" ref={transcriptRef}>
          {messages.map((m, i) => (
            <div key={i} className={`cc-ai-turn cc-ai-turn--${m.role}`}>
              <div className="cc-label cc-ai-role">{m.role === 'me' ? 'You' : 'Agent'}</div>
              <div className="cc-ai-bubble">{m.text}</div>
              {m.role === 'ai' && <ToolTrace names={m.toolsUsed} />}
              {m.hitLimit && (
                <div className="cc-atlas-trace">stopped at the step limit rather than guessing</div>
              )}
            </div>
          ))}

          {thinking && (
            <div className="cc-ai-turn cc-ai-turn--ai">
              <div className="cc-label cc-ai-role">Agent</div>
              {/* Three dots and no word. The label above already says
                  Thinking, and saying it twice was saying it twice. */}
              <div className="cc-ai-bubble cc-ai-bubble--pending">...</div>
            </div>
          )}

          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} onApprove={approve} onReject={reject} />
          ))}

          {error && <div className="cc-ai-error">{error}</div>}
        </div>

        <form className="cc-composer" onSubmit={submit}>
          <input
            ref={inputRef}
            className="cc-composer-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Chat with agent"
            aria-label="Ask the agent"
            disabled={thinking}
          />
          <button type="submit" className="cc-pill cc-pill--tiny" disabled={thinking || !draft.trim()}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
