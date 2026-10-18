// Cloud Billing Budget API v1 (research R9). Read only; never creates or edits budgets (FR-021).
import type { Http } from '../http.js';
import type { Budget } from '../model/types.js';

interface RawBudget {
  displayName?: string;
  name: string;
  amount?: { specifiedAmount?: { currencyCode?: string; units?: string; nanos?: number }; lastPeriodAmount?: Record<string, never> };
  budgetFilter?: { projects?: string[]; services?: string[]; resourceAncestors?: string[]; calendarPeriod?: string; customPeriod?: unknown };
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW']);

export function toBudget(b: RawBudget): Budget | undefined {
  const f = b.budgetFilter ?? {};
  const filtered = (f.projects?.length ?? 0) + (f.services?.length ?? 0) + (f.resourceAncestors?.length ?? 0) > 0;
  const period: Budget['period'] = f.customPeriod ? 'other' : !f.calendarPeriod || f.calendarPeriod === 'MONTH' ? 'month' : 'other';
  const name = b.displayName || b.name.split('/').pop() || 'Budget';
  let amount: Budget['amount'];
  if (b.amount?.specifiedAmount) {
    const s = b.amount.specifiedAmount;
    const currency = s.currencyCode ?? 'USD';
    const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
    const major = Number(s.units ?? 0) + (s.nanos ?? 0) / 1e9;
    amount = { kind: 'specified', minor: Math.round(major * 10 ** decimals), currency };
  } else if (b.amount?.lastPeriodAmount) {
    amount = { kind: 'lastPeriod' };
  } else return undefined;
  return { name, scope: filtered ? 'filtered' : 'account', amount, period };
}

export async function listBudgets(http: Http, accountId: string): Promise<Budget[]> {
  const raw = await http.getAllPages<RawBudget>(`https://billingbudgets.googleapis.com/v1/billingAccounts/${accountId}/budgets?pageSize=100`, 'budgets');
  return raw.map(toBudget).filter((b): b is Budget => b !== undefined);
}
