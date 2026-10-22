import { useCallback, useEffect, useMemo, useState } from 'react';
import Panel from './Panel.jsx';
import { localDay } from '../lib/format.js';
import './CalendarPanel.css';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function buildGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: d, key: localDay(d), inMonth: d.getMonth() === month };
  });
}

/** Just the calendar. Days with events carry a dot; the label opens the
 *  real Google Calendar in the browser. */
export default function CalendarPanel({ onConnected }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!window.cc) return;
    const status = await window.cc.calendar.status();
    const isOn = !!(status && status.connected);
    setConnected(isOn);
    if (!isOn) { setEvents([]); return; }
    const res = await window.cc.calendar.month(cursor.year, cursor.month);
    setEvents((res && res.events) || []);
  }, [cursor]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 5 * 60 * 1000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map();
    events.forEach((e) => {
      const key = localDay(new Date(e.start));
      if (!map.has(key)) map.set(key, 0);
      map.set(key, map.get(key) + 1);
    });
    return map;
  }, [events]);

  const connect = async () => {
    setBusy(true);
    const res = await window.cc.calendar.connect();
    setBusy(false);
    if (res && res.ok) { await load(); if (onConnected) onConnected(); }
  };

  const shift = (delta) => setCursor((c) => {
    const d = new Date(c.year, c.month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const monthLabel = new Date(cursor.year, cursor.month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const grid = buildGrid(cursor.year, cursor.month);
  const todayKey = localDay();

  return (
    <Panel variant="primary" className="cc-calendar">
      <div className="cc-widget-head">
        <button
          type="button"
          className="cc-cal-open cc-label"
          onClick={() => window.cc && window.cc.shell.openGoogleCalendar()}
          title="Open Google Calendar in your browser"
        >
          Calendar <span className="cc-cal-open-arrow">↗</span>
        </button>
        {connected && (
          <div className="cc-cal-nav">
            <button type="button" className="cc-cal-arrow" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
            <span className="cc-mono cc-cal-month">{monthLabel}</span>
            <button type="button" className="cc-cal-arrow" onClick={() => shift(1)} aria-label="Next month">›</button>
          </div>
        )}
      </div>

      {connected === false && (
        <div className="cc-cal-connect">
          <p className="cc-cal-connect-copy">
            Connect your Google account to show your calendar here. It reads only —
            nothing is changed — and your calendar can stay private.
          </p>
          <button type="button" className="cc-pill" onClick={connect} disabled={busy}>
            {busy ? 'Waiting for Google…' : 'Connect Google Calendar'}
          </button>
        </div>
      )}

      {connected && (
        <div className="cc-cal-grid">
          {DOW.map((d, i) => <div key={i} className="cc-cal-dow">{d}</div>)}
          {grid.map((cell) => {
            const n = byDay.get(cell.key) || 0;
            const classes = [
              'cc-cal-day',
              cell.inMonth ? '' : 'is-outside',
              cell.key === todayKey ? 'is-today' : ''
            ].filter(Boolean).join(' ');
            return (
              <div key={cell.key} className={classes}>
                <span className="cc-cal-daynum">{cell.date.getDate()}</span>
                {n > 0 && (
                  <span className="cc-cal-dots">
                    {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                      <span key={i} className="cc-cal-dot" />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
