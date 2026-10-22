import { useCallback, useEffect, useMemo, useState } from 'react';
import Panel, { PanelLabel } from '../components/Panel.jsx';

/**
 * Coursework due dates, straight from the school's calendar feed (the
 * link is pasted in Settings). Fetched here rather than through Google,
 * which refreshes external calendars on its own schedule — often a day
 * late, which for a deadline is worse than nothing.
 *
 * Submitting work does not remove its due date from the feed, so items
 * stay until the date passes. Crossing one off is a note kept here; the
 * feed is read-only and nothing is ever sent back to the school.
 */
const REFRESH_MS = 30 * 60 * 1000;

function daysAway(iso) {
  const d = new Date(iso);
  const now = new Date();
  return Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate())
      - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
}

function dayLabel(iso) {
  const days = daysAway(iso);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function urgency(iso) {
  const days = daysAway(iso);
  if (days <= 1) return 'is-now';
  if (days <= 3) return 'is-soon';
  return '';
}

export default function CourseworkWidget({ completed, onToggle, title }) {
  const [state, setState] = useState(null);

  const load = useCallback(async () => {
    if (!window.cc) return;
    try { setState(await window.cc.school.upcoming(45)); } catch (e) { /* keep last good */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const done = useMemo(() => new Set(completed || []), [completed]);
  const events = (state && state.events) || [];

  // One list, earliest at the top. This used to run graded work first and
  // everything else below a divider, which meant the lower group started
  // the calendar over — a date next week could sit under one a month out,
  // and reading down the panel no longer told you what came next. Graded
  // work still reads as graded work: everything else keeps the quiet
  // styling, so the distinction survives without reordering the dates.
  const ordered = useMemo(
    () => [...events].sort((a, b) => String(a.start).localeCompare(String(b.start))),
    [events]
  );
  const openCount = ordered.filter((e) => e.due && e.kind !== 'opens' && !done.has(e.id)).length;

  const row = (e, quiet) => {
    const isDone = done.has(e.id);
    return (
      <button
        key={e.id}
        type="button"
        className={[
          'cc-due-row',
          quiet || e.kind === 'opens' ? 'is-quiet' : urgency(e.start),
          isDone ? 'is-done' : ''
        ].filter(Boolean).join(' ')}
        onClick={() => onToggle(e.id)}
        title={isDone ? 'Mark as not done' : 'Mark as done'}
      >
        <span className={`cc-check${isDone ? ' is-checked' : ''}`} />
        <span className="cc-mono cc-due-when">{dayLabel(e.start)}</span>
        {e.course && <span className="cc-mono cc-due-course">{e.course}</span>}
        <span className="cc-due-title">{e.title.replace(/\s*-?\s*due\s*$/i, '')}</span>
        {/* Says which question the date answers. Without it, the day a
            thing unlocks looks exactly like the day it is owed. */}
        {e.kind === 'opens' && <span className="cc-due-kind">opens</span>}
      </button>
    );
  };

  return (
    <Panel variant="primary" className="cc-coursework">
      <div className="cc-widget-head">
        <PanelLabel>{title || 'Coursework'}</PanelLabel>
        <span className="cc-field-note">
          {state && state.ok ? `${openCount} open` : ''}
          {state && state.ok && !state.live ? ' · snapshot' : ''}
        </span>
      </div>

      <div className="cc-coursework-body">
        {(!state || !state.ok) && (
          <div className="cc-widget-empty">
            {state && state.error === 'no_source' ? 'Add your school calendar link in Settings to see what is due.' : 'Feed unavailable.'}
          </div>
        )}

        {state && state.ok && events.length === 0 && (
          <div className="cc-widget-empty">Nothing due in the next 45 days.</div>
        )}

        {ordered.map((e) => row(e, !e.due))}
      </div>
    </Panel>
  );
}
