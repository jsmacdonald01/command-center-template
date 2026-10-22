// Yahoo Finance chart endpoint — free and keyless, but undocumented.
// Every failure degrades to { ok:false } so the widget can show a quiet
// unavailable state instead of breaking the section. If Yahoo ever
// changes shape, this file is the only thing that needs replacing.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const RANGES = {
  '1D': { range: '1d', interval: '5m' },
  '1W': { range: '5d', interval: '30m' },
  '1M': { range: '1mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1wk' }
};

const TARGET_POINTS = 40;

function downsample(points, target) {
  if (points.length <= target) return points;
  const step = points.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(points[Math.floor(i * step)]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

async function fetchSeries(symbol, rangeKey) {
  const spec = RANGES[rangeKey] || RANGES['1M'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?range=${spec.range}&interval=${spec.interval}`;

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`quote service returned ${res.status}`);
  const json = await res.json();

  const result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('unexpected response shape');

  const meta = result.meta || {};
  const closes = (result.indicators
    && result.indicators.quote
    && result.indicators.quote[0]
    && result.indicators.quote[0].close) || [];

  const series = downsample(closes.filter((v) => typeof v === 'number'), TARGET_POINTS);
  const price = meta.regularMarketPrice;
  const previous = meta.chartPreviousClose != null ? meta.chartPreviousClose : (series[0] || price);
  const change = price - previous;

  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price,
    change,
    changePercent: previous ? (change / previous) * 100 : 0,
    series
  };
}

async function get(rangeKey, watchlistSymbols) {
  const symbols = ['^GSPC', '^IXIC'].concat(watchlistSymbols || []);
  try {
    const quotes = await Promise.all(symbols.map((s) =>
      fetchSeries(s, rangeKey).catch(() => null)
    ));
    const ok = quotes.filter(Boolean);
    if (!ok.length) return { ok: false, error: 'No market data available' };
    return { ok: true, range: rangeKey, quotes: ok, fetchedAt: Date.now() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { get, RANGES };
