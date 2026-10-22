import { useEffect, useState } from 'react';
import Panel, { PanelLabel } from '../components/Panel.jsx';
import { localDay, timeOfDay } from '../lib/format.js';
import './log.css';

/** Groups history by Today, Yesterday, Earlier this week, then month. */
function groupByDay(events) {
  const today = localDay();
  const yesterday = localDay(new Date(Date.now() - 86400000));
  const weekAgo = localDay(new Date(Date.now() - 7 * 86400000));

  const groups = new Map();
  events.forEach((e) => {
    const day = localDay(new Date(e.ts));
    let label;
    if (day === today) label = 'Today';
    else if (day === yesterday) label = 'Yesterday';
    else if (day >= weekAgo) label = 'Earlier this week';
    else label = new Date(e.ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(e);
  });
  return [...groups.entries()];
}

/**
 * The Log: everything that has changed in Command Center, newest first —
 * a personal history, not a developer console.
 *
 * Config: { "type": "log", "title": "Log" }
 */
export default function LogWidget({ widget, data }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!window.cc) return;
    window.cc.data.events(200).then((rows) => setEvents(rows || [])).catch(() => setEvents([]));
  }, [data]);

  const groups = groupByDay(events);

  return (
    <Panel variant="primary" className="cc-w cc-history">
      <PanelLabel>{widget.title}</PanelLabel>
      {events.length === 0 && <div className="cc-widget-empty">No history recorded yet.</div>}

      {groups.map(([label, rows], gi) => (
        <div key={label} className="cc-history-group">
          {gi > 0 && <div className="cc-divider" />}
          <div className="cc-label cc-history-day">{label}</div>
          {rows.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="cc-history-row">
              <span className="cc-mono cc-history-time">{timeOfDay(e.ts)}</span>
              <span className="cc-history-text">
                {e.label}
                {e.entity && <span className="cc-history-entity"> · {e.entity}</span>}
              </span>
              <span className={`cc-history-tag is-${String(e.category || 'system').toLowerCase()}`}>
                {e.category || 'System'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}
