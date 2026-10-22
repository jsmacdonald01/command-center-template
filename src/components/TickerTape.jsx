import { useMemo } from 'react';
import './TickerTape.css';

/**
 * TradingView's ticker tape, carried over from V1.
 *
 * Embedded as an iframe with the config in the fragment — the same URL
 * their loader script builds — rather than injecting their script into
 * the renderer. Their code stays sandboxed and cannot touch the app.
 */
const SYMBOLS = [
  { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
  { proName: 'FOREXCOM:NSXUSD', title: 'Nasdaq 100' },
  { proName: 'FOREXCOM:DJI', title: 'Dow 30' },
  { proName: 'TVC:GOLD', title: 'Gold' },
  { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' }
];

export default function TickerTape() {
  const src = useMemo(() => {
    const config = {
      symbols: SYMBOLS,
      showSymbolLogo: false,
      isTransparent: true,
      displayMode: 'adaptive',
      colorTheme: 'dark',
      locale: 'en'
    };
    return 'https://s.tradingview.com/embed-widget/ticker-tape/?locale=en#'
      + encodeURIComponent(JSON.stringify(config));
  }, []);

  return (
    <div className="cc-ticker">
      <iframe
        className="cc-ticker-frame"
        src={src}
        title="Market ticker"
        scrolling="no"
        frameBorder="0"
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
