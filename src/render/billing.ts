// Billing section (Story 1). PURE.
import type { BudgetLine, ViewModel } from '../model/types.js';
import { formatAge, formatMoney, formatMoneyByCurrency, monthName } from './format.js';
import { STATUS_STYLE, ln } from './swiftbar.js';

const MUTED = '#6E6E73,#98989D';
const BUDGETS_URL = 'https://console.cloud.google.com/billing/budgets';
const DOCS_URL = 'https://github.com/twknab/gcp-system-tray-admin/blob/main/docs/billing-export-setup.md';

function budgetText(l: BudgetLine): string {
  if (l.amountMinor === null || !l.currency) return `Budget “${l.name}”: ${l.note ?? 'amount unavailable'}`;
  const amount = formatMoney(l.amountMinor, l.currency);
  const suffix = l.note ? ` (${l.note})` : '';
  if (l.remainingMinor === null) return `Budget “${l.name}” ${amount}${suffix}`;
  const rest = l.remainingMinor >= 0 ? `${formatMoney(l.remainingMinor, l.currency)} left` : `${formatMoney(-l.remainingMinor, l.currency)} over`;
  return `Budget “${l.name}” ${amount} · ${rest}${suffix}`;
}

export function renderBilling(v: ViewModel): string[] {
  const b = v.billing;
  const out = [ln('Billing', { sfimage: 'creditcard' })];
  if (!b.available) {
    if (b.unavailableReason === 'export not set up') {
      out.push(ln('Costs unavailable — export not set up', { sfimage: 'questionmark.circle', sfcolor: STATUS_STYLE.unknown.sfcolor, bash: '/usr/bin/open', param0: v.paths.docs, terminal: false }));
      out.push(ln('Costs unavailable — export not set up (open guide online)', { href: DOCS_URL, alternate: true }));
    } else {
      out.push(ln(`Costs unavailable — ${b.unavailableReason ?? 'unknown reason'}`, { sfimage: 'questionmark.circle', sfcolor: STATUS_STYLE.unknown.sfcolor }));
    }
  } else {
    const partial = b.coveredAccounts < b.visibleAccounts ? ` (partial ${b.coveredAccounts} of ${b.visibleAccounts} accounts)` : '';
    out.push(ln(`${monthName(b.monthLabel)} to date  ${formatMoneyByCurrency(b.mtd)}${partial}`));
    out.push(ln(`${monthName(b.lastMonthLabel)}  ${b.lastMonth ? formatMoneyByCurrency(b.lastMonth) : 'not available'}`));
  }
  const lines = b.budgetLines;
  const anyBudgetsUnavailable = b.accounts.find((a) => a.budgetsUnavailable);
  if (lines.length) {
    for (const l of lines) {
      const over = l.remainingMinor !== null && l.remainingMinor < 0;
      out.push(ln(budgetText(l), over ? { sfimage: STATUS_STYLE.degraded.sfimage, sfcolor: STATUS_STYLE.degraded.sfcolor } : {}));
    }
  } else if (anyBudgetsUnavailable) {
    out.push(ln(`Budget unavailable — ${anyBudgetsUnavailable.budgetsUnavailable}`, { color: MUTED }));
  } else if (b.visibleAccounts > 0) {
    out.push(ln('No budget set', { href: BUDGETS_URL }));
  }
  if (b.available) {
    const asOf = b.oldestExportTime ? `Cost data as of ${formatAge(b.oldestExportTime, v.now)}` : 'Cost data time unknown';
    out.push(ln(b.stale ? `${asOf} · stale` : asOf, { color: MUTED, size: 11 }));
  }
  if (b.accounts.length > 1 || b.accounts.some((a) => !a.ok)) {
    out.push(ln(`Billing accounts (${b.accounts.length})`, { sfimage: 'building.columns' }));
    for (const a of b.accounts) {
      const url = `https://console.cloud.google.com/billing/${a.id}`;
      if (!a.ok) {
        const reason = a.reason === 'export not configured' ? 'Costs unavailable — export not set up' : `Costs unavailable — ${a.reason}`;
        out.push(ln(`${a.displayName}: ${reason}`, { href: url }, 1));
      } else {
        const lm = a.lastMonth ? ` · ${formatMoneyByCurrency(a.lastMonth)} last month` : '';
        out.push(ln(`${a.displayName}  ${formatMoneyByCurrency(a.mtd)} to date${lm}`, { href: url }, 1));
      }
    }
  }
  return out;
}
