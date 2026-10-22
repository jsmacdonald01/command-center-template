import { useEffect, useState } from 'react';
import './StatusBar.css';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function StatusBar({ weather, syncLabel = 'Syncing', syncing, onSync }) {
  const now = useClock();

  const date = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  });

  const weatherLabel = weather && weather.ok
    ? `${weather.current.temperature}° ${weather.current.condition}`
    : null;

  return (
    <header className="cc-statusbar">
      <div className="cc-statusbar-brand">
        <span className="cc-statusbar-dot" />
        <span className="cc-statusbar-name">Command Center</span>
      </div>

      <div className="cc-statusbar-meta">
        <span>{date}</span>
        <span className="cc-statusbar-clock">{time}</span>
        {weatherLabel && <span>{weatherLabel}</span>}
        <button
          type="button"
          className="cc-statusbar-sync"
          onClick={onSync}
          disabled={syncing}
          title="Check calendar, mail, weather and news now"
        >
          <span className="cc-statusbar-syncdot" />
          {syncing ? 'Syncing' : syncLabel}
        </button>
      </div>
    </header>
  );
}
