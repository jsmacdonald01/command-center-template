import { useEffect, useState } from 'react';
import Panel, { PanelLabel } from '../components/Panel.jsx';

const RANGES = ['1D', '1W', '1M', '1Y'];

function sparklinePath(series, width, height) {
  if (!series || series.length < 2) return { line: '', area: '' };
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const step = width / (series.length - 1);

  const points = series.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return {
    line: `M${points.join(' L')}`,
    area: `M0,${height} L${points.join(' L')} L${width},${height} Z`
  };
}

export default function MarketsWidget({ onExpand, title }) {
  const [range, setRange] = useState('1D');
  const [quotes, setQuotes] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!window.cc) return undefined;
    setFailed(false);
    window.cc.markets.get(range, []).then((res) => {
      if (cancelled) return;
      if (res && res.ok) setQuotes(res.quotes);
      else setFailed(true);
    }).catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [range]);

  const lead = quotes && quotes[0];
  const { line, area } = sparklinePath(lead ? lead.series : null, 300, 74);

  return (
    <Panel className="cc-widget">
      <div className="cc-widget-head">
        <PanelLabel>{title || 'Markets'}</PanelLabel>
        <div className="cc-range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`cc-range-pill${r === range ? ' is-active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {failed && <div className="cc-widget-empty">Market data unavailable</div>}

      {!failed && (
        <>
          <button
            type="button"
            className="cc-sparkline"
            onClick={onExpand}
            aria-label="Open full chart"
          >
            <svg viewBox="0 0 300 74" preserveAspectRatio="none" width="100%" height="74">
              {area && <path d={area} fill="rgba(203,213,225,.1)" />}
              {line && (
                <path
                  d={line}
                  fill="none"
                  stroke="rgba(226,232,240,.85)"
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          </button>

          <div className="cc-market-rows">
            {(quotes || []).map((q) => (
              <div key={q.symbol} className="cc-market-row">
                <span className="cc-market-name">{q.name}</span>
                <span className="cc-mono cc-market-value">
                  {q.price != null ? q.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
                </span>
                <span className={`cc-mono cc-market-change${q.change >= 0 ? ' is-up' : ' is-down'}`}>
                  {q.change >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
