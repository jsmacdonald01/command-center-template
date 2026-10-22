import { useEffect, useMemo, useState } from 'react';
import Panel, { PanelLabel } from '../components/Panel.jsx';
import { localDay, timeOfDay } from '../lib/format.js';

const DAYS = 3;

function dayLabel(key, todayKey, tomorrowKey) {
  if (key === todayKey) return 'Today';
  if (key === tomorrowKey) return 'Tomorrow';
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric'
  });
}

/**
 * Today and the next two days, drawn from Google Calendar.
 *
 * Crossing something off is a Command Center note, not a change to the
 * calendar — the calendar scope is read-only. Completions are stored
 * locally against the event id.
 */
export default function TodoPanel({ calendar, completedIds, onToggleEvent, expired, title }) {
  const todayKey = localDay();
  const tomorrowKey = localDay(new Date(Date.now() + 86400000));

  const horizon = useMemo(
    () => Array.from({ length: DAYS }, (_, i) => localDay(new Date(Date.now() + i * 86400000))),
    [todayKey]
  );

  const groups = useMemo(() => {
    const map = new Map(horizon.map((k) => [k, []]));
    (calendar || []).forEach((e) => {
      const key = localDay(new Date(e.start));
      if (map.has(key)) map.get(key).push(e);
    });
    return horizon.map((key) => ({ key, items: map.get(key) }));
  }, [calendar, horizon]);

  const done = useMemo(() => new Set(completedIds || []), [completedIds]);

  return (
    <Panel variant="primary" className="cc-todo">
      <div className="cc-widget-head">
        <PanelLabel>{title || 'Calendar'}</PanelLabel>
        <span className="cc-field-note">Next 3 days</span>
      </div>

      {/* Said once, at the top, rather than three days of "Nothing
          scheduled" — an empty day and a dead sign-in look identical, and
          only one of them is worth interrupting anyone about. */}
      {expired && (
        <div className="cc-todo-expired">
          Google sign-in expired — nothing here is current.
          Reconnect it in Settings, at the bottom of the Log page.
        </div>
      )}

      <div className="cc-todo-body">
        {groups.map((group) => (
          <div key={group.key} className="cc-todo-day">
            <div className="cc-label cc-todo-daylabel">
              {dayLabel(group.key, todayKey, tomorrowKey)}
            </div>

            {group.items.length === 0 && !expired && (
              <div className="cc-band-empty">Nothing scheduled.</div>
            )}

            {group.items.map((e) => {
              const isDone = done.has(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`cc-todo-row${isDone ? ' is-done' : ''}`}
                  onClick={() => onToggleEvent(e.id)}
                >
                  <span className={`cc-check${isDone ? ' is-checked' : ''}`} />
                  <span className="cc-mono cc-todo-time">
                    {e.allDay ? 'All day' : timeOfDay(e.start)}
                  </span>
                  <span className="cc-todo-body-text">
                    <span className="cc-todo-text">{e.title}</span>
                    {/* Whatever was typed into the calendar entry's notes.
                        The way to record work a course never dated. */}
                    {e.description && (
                      <span className="cc-todo-note">{e.description}</span>
                    )}
                    {/* Where, if the calendar entry carries one. Quieter
                        than the note — it answers a different question and
                        is usually the longer of the two. */}
                    {e.location && (
                      <span className="cc-todo-place">{e.location}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}
