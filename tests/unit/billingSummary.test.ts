import { describe, expect, it } from 'vitest';
import { buildBillingSummary } from '../../src/model/billing.js';
import { invoiceMonths } from '../../src/model/view.js';
import type { Snapshot } from '../../src/model/types.js';
import { loadFixture } from '../render/invariants.js';

function summary(name: string, mutate?: (s: Snapshot) => void) {
  const f = loadFixture(name);
  mutate?.(f.snapshot);
  return buildBillingSummary(f.snapshot, f.config, f.now, invoiceMonths(f.now));
}

describe('billing summary', () => {
  it('uses Pacific-time invoice months', () => {
    expect(invoiceMonths(new Date('2026-11-01T05:00:00Z'))).toEqual({ month: '202610', lastMonth: '202609' });
    expect(invoiceMonths(new Date('2026-01-15T12:00:00Z'))).toEqual({ month: '202601', lastMonth: '202512' });
  });
  it('sums per currency across open accounts, excluding closed ones', () => {
    const s = summary('billing');
    expect(s.visibleAccounts).toBe(2);
    expect(s.coveredAccounts).toBe(2);
    expect(s.mtd).toEqual({ USD: 2482 });
    expect(s.lastMonth).toEqual({ USD: 3145 });
  });
  it('keeps currencies separate', () => {
    expect(summary('billing-multicurrency').mtd).toEqual({ USD: 2482, EUR: 1250 });
  });
  it('marks a partial total', () => {
    const s = summary('billing-partial');
    expect([s.coveredAccounts, s.visibleAccounts]).toEqual([2, 3]);
    expect(s.available).toBe(true);
  });
  it('prefers account-scoped budgets and computes remaining', () => {
    const s = summary('billing');
    expect(s.budgetLines.map((l) => [l.name, l.amountMinor, l.remainingMinor])).toEqual([['Monthly cap (Personal)', 5000, 2990]]);
    expect(s.overBudget).toBe(false);
  });
  it('flags overspend', () => {
    const s = summary('over-budget');
    expect(s.budgetLines[0]!.remainingMinor).toBe(-300);
    expect(s.overBudget).toBe(true);
  });
  it('resolves a last-period budget from last month, or says unavailable', () => {
    const lp = (s: Snapshot) => { s.sources['budgets:000000-000000-000000'] = { ok: true, fetchedAt: s.updatedAt, data: [{ name: 'Same as last', scope: 'account', period: 'month', amount: { kind: 'lastPeriod' } }] }; };
    expect(summary('no-budget', lp).budgetLines[0]).toMatchObject({ amountMinor: 3145, remainingMinor: 663, note: "last month's spend" });
    const noLast = summary('no-budget', (s) => {
      lp(s);
      const c = s.sources['costs:000000-000000-000000'] as { data: { rows: { month: string }[] } };
      c.data.rows = c.data.rows.filter((r) => r.month !== '202609');
    });
    expect(noLast.budgetLines[0]).toMatchObject({ amountMinor: null, note: 'Budget amount unavailable' });
    expect(noLast.lastMonth).toBeNull();
  });
  it('labels cost data older than 24h as stale', () => {
    expect(summary('stale-costs').stale).toBe(true);
    expect(summary('billing').stale).toBe(false);
  });
  it('shows negative and zero net spend as reported', () => {
    const s = summary('no-budget', (snap) => {
      const c = snap.sources['costs:000000-000000-000000'] as { data: { rows: { month: string; netMinor: number }[] } };
      c.data.rows[0]!.netMinor = -125;
    });
    expect(s.mtd).toEqual({ USD: -125 });
  });
  it('reports export not set up', () => {
    const s = summary('no-export');
    expect(s.available).toBe(false);
    expect(s.unavailableReason).toBe('export not set up');
  });
});
