// Pure display helpers.

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$' };
const ZERO_DECIMAL = new Set(['JPY', 'KRW']);

/** Minor units → display string, e.g. (2482, 'USD') → "$24.82". */
export function formatMoney(minor: number, currency: string): string {
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const major = minor / 10 ** decimals;
  const sign = major < 0 ? '-' : '';
  const body = Math.abs(major).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const sym = SYMBOLS[currency];
  return sym ? `${sign}${sym}${body}` : `${sign}${body} ${currency}`;
}

/** Several currencies are shown side by side, never added. */
export function formatMoneyByCurrency(m: Record<string, number>): string {
  const entries = Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return formatMoney(0, 'USD');
  return entries.map(([c, v]) => formatMoney(v, c)).join(' + ');
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return i === 0 ? `${Math.round(v)} B` : `${v.toFixed(1).replace(/\.0$/, '')} ${units[i]}`;
}

export function formatAge(fromIso: string, nowIso: string): string {
  const sec = Math.max(0, (Date.parse(nowIso) - Date.parse(fromIso)) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** "|" separates SwiftBar parameters, so it must never appear in menu text. */
export function escapeText(s: string): string {
  return s.replace(/\|/g, '│').replace(/[\r\n]+/g, ' ').trim();
}

export const MAX_TEXT = 60;

export function truncate(s: string, max = MAX_TEXT): { text: string; truncated: boolean } {
  const t = escapeText(s);
  if ([...t].length <= max) return { text: t, truncated: false };
  return { text: [...t].slice(0, max - 1).join('') + '…', truncated: true };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthName(yyyymm: string): string {
  const m = Number(yyyymm.slice(4, 6));
  return MONTHS[m - 1] ?? yyyymm;
}
