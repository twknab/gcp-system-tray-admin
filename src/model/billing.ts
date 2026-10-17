// PURE: billing sources → BillingSummary (FR-003, FR-021, FR-022, FR-015b).
import { isStale } from '../cache.js';
import type { AccountSummary, BillingAccountInfo, BillingSummary, Budget, BudgetLine, Config, Costs, MoneyByCurrency, Snapshot } from './types.js';

const DAY_MS = 24 * 3600 * 1000;

function add(m: MoneyByCurrency, currency: string, minor: number) {
  m[currency] = (m[currency] ?? 0) + minor;
}

function sumMonth(costs: Costs, month: string): MoneyByCurrency {
  const m: MoneyByCurrency = {};
  for (const r of costs.rows) if (r.month === month) add(m, r.currency, r.netMinor);
  return m;
}

function pickBudgets(budgets: Budget[]): Budget[] {
  const monthly = budgets.filter((b) => b.period === 'month');
  const account = monthly.filter((b) => b.scope === 'account');
  if (account.length) return account;
  if (monthly.length) return monthly;
  return budgets; // custom periods: shown, not used for "remaining"
}

function budgetLines(budgets: Budget[], mtd: MoneyByCurrency, lastMonth: MoneyByCurrency | null, fallbackCurrency: string | undefined): BudgetLine[] {
  return pickBudgets(budgets).map((b) => {
    if (b.period !== 'month') return { name: b.name, currency: b.amount.kind === 'specified' ? b.amount.currency : null, amountMinor: b.amount.kind === 'specified' ? b.amount.minor : null, remainingMinor: null, note: 'custom period' };
    const currency = b.amount.kind === 'specified' ? b.amount.currency : Object.keys(lastMonth ?? mtd)[0] ?? fallbackCurrency ?? null;
    let amount: number | null = null;
    let note: string | undefined;
    if (b.amount.kind === 'specified') amount = b.amount.minor;
    else if (lastMonth && currency && lastMonth[currency] !== undefined) {
      amount = lastMonth[currency]!;
      note = "last month's spend";
    } else note = 'Budget amount unavailable';
    const spent = currency ? mtd[currency] ?? 0 : 0;
    const line: BudgetLine = { name: b.name, currency, amountMinor: amount, remainingMinor: amount === null ? null : amount - spent };
    if (note) line.note = note;
    return line;
  });
}

export function buildBillingSummary(snapshot: Snapshot, config: Config, now: Date, months: { month: string; lastMonth: string }): BillingSummary {
  const base: BillingSummary = {
    available: false, mtd: {}, lastMonth: null, coveredAccounts: 0, visibleAccounts: 0, oldestExportTime: null,
    stale: false, budgetLines: [], overBudget: false, accounts: [], monthLabel: months.month, lastMonthLabel: months.lastMonth,
  };
  const acctResult = snapshot.sources.billingAccounts;
  const accounts = (acctResult?.ok ? acctResult.data : acctResult?.lastGood?.data) as BillingAccountInfo[] | undefined;
  if (!accounts) {
    base.unavailableReason = acctResult && !acctResult.ok ? `billing accounts unavailable: ${acctResult.reason}` : 'no billing data yet';
    return base;
  }
  const open = accounts.filter((a) => a.open);
  base.visibleAccounts = open.length;
  if (open.length === 0) {
    base.unavailableReason = 'no open billing accounts are visible to you';
    return base;
  }

  let anyLastMonth = false;
  let oldest: number | null = null;
  let fetchStale = false;
  for (const a of open) {
    const cr = snapshot.sources[`costs:${a.id}`];
    const costs = (cr?.ok ? cr.data : cr?.lastGood?.data) as Costs | undefined;
    const br = snapshot.sources[`budgets:${a.id}`];
    const budgets = (br?.ok ? br.data : br?.lastGood?.data) as Budget[] | undefined;
    const summary: AccountSummary = { id: a.id, displayName: a.displayName, ok: false, mtd: {}, lastMonth: null, budgetLines: [] };
    if (costs) {
      summary.ok = true;
      summary.mtd = sumMonth(costs, months.month);
      const lm = sumMonth(costs, months.lastMonth);
      summary.lastMonth = Object.keys(lm).length ? lm : null;
      base.coveredAccounts++;
      for (const [c, v] of Object.entries(summary.mtd)) add(base.mtd, c, v);
      if (summary.lastMonth) {
        anyLastMonth = true;
        base.lastMonth ??= {};
        for (const [c, v] of Object.entries(summary.lastMonth)) add(base.lastMonth, c, v);
      }
      if (costs.exportTime) {
        const t = Date.parse(costs.exportTime);
        oldest = oldest === null ? t : Math.min(oldest, t);
      }
      if (isStale(cr, config.ttl.costs, now)) fetchStale = true;
      if (cr && !cr.ok) summary.reason = `showing earlier data: ${cr.reason}`;
    } else {
      summary.reason = cr && !cr.ok ? cr.reason : 'not loaded yet';
    }
    if (budgets) summary.budgetLines = budgetLines(budgets, summary.mtd, summary.lastMonth, a.currencyCode);
    else if (br && !br.ok) summary.budgetsUnavailable = br.reason;
    base.accounts.push(summary);
  }

  base.available = base.coveredAccounts > 0;
  if (!base.available) base.unavailableReason = base.accounts.every((a) => a.reason === 'export not configured') ? 'export not set up' : base.accounts[0]?.reason ?? 'unavailable';
  if (!anyLastMonth) base.lastMonth = null;
  base.oldestExportTime = oldest === null ? null : new Date(oldest).toISOString();
  base.stale = fetchStale || (oldest !== null && now.getTime() - oldest > DAY_MS);
  base.budgetLines = base.accounts.flatMap((a) => (open.length > 1 ? a.budgetLines.map((l) => ({ ...l, name: `${l.name} (${a.displayName})` })) : a.budgetLines));
  base.overBudget = base.budgetLines.some((l) => l.remainingMinor !== null && l.remainingMinor < 0);
  return base;
}
