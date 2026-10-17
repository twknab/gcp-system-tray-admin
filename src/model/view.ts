// PURE: Snapshot + Config → ViewModel. No I/O.
import { overallStatus } from './status.js';
import type { BillingSummary, Config, Snapshot, ViewModel } from './types.js';

export interface ViewPaths {
  node: string;
  cli: string;
  docs: string;
}

export function emptyBilling(now: Date): BillingSummary {
  const { month, lastMonth } = invoiceMonths(now);
  return {
    available: false,
    mtd: {},
    lastMonth: null,
    coveredAccounts: 0,
    visibleAccounts: 0,
    oldestExportTime: null,
    stale: false,
    budgetLines: [],
    overBudget: false,
    accounts: [],
    unavailableReason: 'no billing data yet',
    monthLabel: month,
    lastMonthLabel: lastMonth,
  };
}

/** Invoice months follow US Pacific time (research R10). */
export function invoiceMonths(now: Date): { month: string; lastMonth: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ly = m === 1 ? y - 1 : y;
  const lm = m === 1 ? 12 : m - 1;
  return { month: `${y}${pad(m)}`, lastMonth: `${ly}${pad(lm)}` };
}

export function buildView(snapshot: Snapshot, config: Config, now: Date, paths: ViewPaths, extra: { setupIssues?: ViewModel['setupIssues'] } = {}): ViewModel {
  const billing = emptyBilling(now);
  return {
    overall: overallStatus([], billing),
    titleAmount: null,
    billing,
    groups: [],
    alerts: null,
    projects: null,
    setupIssues: extra.setupIssues ?? [],
    updatedAt: snapshot.updatedAt || null,
    now: now.toISOString(),
    offline: !snapshot.updatedAt,
    paths: { ...paths, config: config.path },
  };
}
