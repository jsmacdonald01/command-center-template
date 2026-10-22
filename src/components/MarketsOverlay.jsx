import { useEffect, useState } from 'react';
import './MarketsOverlay.css';

const SYMBOLS = [
  { label: 'S&P 500', symbol: 'SP:SPX' },
  { label: 'Nasdaq', symbol: 'NASDAQ:IXIC' },
  { label: 'Dow', symbol: 'DJ:DJI' },
  { label: 'Gold', symbol: 'TVC:GOLD' },
  { label: 'Bitcoin', symbol: 'CRYPTO:BTCUSD' }
];

/**
 * Full charting, on demand. TradingView is loaded in an iframe rather
 * than by injecting their script into the renderer — their code stays
 * sandboxed and can't touch the app.
 */
export default function MarketsOverlay({ onClose }) {
  const [active, setActive] = useState(SYMBOLS[0]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const src = 'https://s.tradingview.com/widgetembed/'
    + `?symbol=${encodeURIComponent(active.symbol)}`
    + '&interval=D&theme=dark&style=1&timezone=America%2FChicago'
    + '&hide_side_toolbar=1&withdateranges=1&save_image=0';

  return (
    <div className="cc-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cc-overlay-panel cc-markets-panel">
        <header className="cc-overlay-head">
          <div className="cc-markets-symbols">
            {SYMBOLS.map((s) => (
              <button
                key={s.symbol}
                type="button"
                className={`cc-range-pill${s.symbol === active.symbol ? ' is-active' : ''}`}
                onClick={() => setActive(s)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button type="button" className="cc-pill cc-pill--tiny" onClick={onClose}>
            Close · Esc
          </button>
        </header>

        <iframe
          key={active.symbol}
          className="cc-markets-frame"
          src={src}
          title={`${active.label} chart`}
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
