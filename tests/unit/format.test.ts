import { describe, expect, it } from 'vitest';
import { escapeText, formatAge, formatBytes, formatMoney, formatMoneyByCurrency, truncate } from '../../src/render/format.js';

describe('format', () => {
  it('formats money from minor units', () => {
    expect(formatMoney(2482, 'USD')).toBe('$24.82');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(-150, 'USD')).toBe('-$1.50');
    expect(formatMoney(123456, 'EUR')).toBe('€1,234.56');
    expect(formatMoney(500, 'JPY')).toBe('¥500');
    expect(formatMoney(100, 'CHF')).toBe('1.00 CHF');
  });
  it('keeps currencies separate', () => {
    expect(formatMoneyByCurrency({ USD: 100, EUR: 200 })).toBe('€2.00 + $1.00');
  });
  it('formats bytes in base 1000', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(412_000_000_000)).toBe('412 GB');
    expect(formatBytes(1_230_000_000_000)).toBe('1.2 TB');
  });
  it('formats relative time', () => {
    const now = '2026-10-17T12:00:00Z';
    expect(formatAge('2026-10-17T11:59:30Z', now)).toBe('just now');
    expect(formatAge('2026-10-17T11:57:00Z', now)).toBe('3m ago');
    expect(formatAge('2026-10-17T10:00:00Z', now)).toBe('2h ago');
    expect(formatAge('2026-10-14T12:00:00Z', now)).toBe('3d ago');
  });
  it('escapes the SwiftBar separator and truncates', () => {
    expect(escapeText('a | b\nc')).toBe('a │ b c');
    const long = 'x'.repeat(80);
    const t = truncate(long);
    expect(t.truncated).toBe(true);
    expect([...t.text].length).toBe(60);
    expect(truncate('short').truncated).toBe(false);
  });
});
