import { useEffect, useRef, useState } from 'react';
import { money, moneyInput, parseMoney } from '../lib/format.js';
import './EditableValue.css';

/**
 * Click a value, type, blur or Enter to save. Escape cancels.
 *
 * Uses a real <input> rather than contenteditable so the native
 * cut/copy/paste context menu works — V1 used contenteditable and paste
 * appearing broken cost two separate bug reports.
 *
 * Saves immediately on commit; the main process logs the change.
 */
export default function EditableValue({
  value,
  onCommit,
  type = 'text',
  placeholder = '—',
  className = '',
  label
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const display = type === 'money'
    ? money(value)
    : (value === '' || value == null ? placeholder : String(value));

  const start = () => {
    setDraft(type === 'money' ? moneyInput(value) : (value == null ? '' : String(value)));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = type === 'money' ? parseMoney(draft) : draft.trim();
    const unchanged = type === 'money'
      ? Number(next) === Number(value || 0)
      : next === (value == null ? '' : String(value));
    if (!unchanged) onCommit(next);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`cc-editable cc-editable--input ${className}`.trim()}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        inputMode={type === 'money' ? 'decimal' : undefined}
        aria-label={label}
      />
    );
  }

  return (
    <button
      type="button"
      className={`cc-editable ${className}`.trim()}
      onClick={start}
      title="Click to edit"
      aria-label={label ? `${label}: ${display}. Click to edit.` : undefined}
    >
      {display}
    </button>
  );
}
