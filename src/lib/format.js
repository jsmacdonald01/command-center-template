/**
 * Money display.
 *
 * V1 rounded to whole dollars here, and because the same rounded string
 * was fed back into the editable field, editing any row silently
 * destroyed its cents. Whole amounts still render clean; cents only
 * appear when they exist.
 */
export function money(value) {
  const n = Number(value) || 0;
  const hasCents = Math.abs(n % 1) > 0.0001;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2
  });
}

/** The exact editable representation — never lossy. */
export function moneyInput(value) {
  const n = Number(value) || 0;
  return Math.abs(n % 1) > 0.0001 ? n.toFixed(2) : String(Math.round(n));
}

export function parseMoney(text) {
  const n = parseFloat(String(text).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

export function bytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** 12-hour throughout — no military time anywhere in the product. */
export function timeOfDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export const clockTime = timeOfDay;

/** Local YYYY-MM-DD. Never toISOString() — that rolls over at 7pm Central. */
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function senderName(from) {
  if (!from) return '';
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1].trim();
  return from.replace(/[<>]/g, '').split('@')[0];
}
