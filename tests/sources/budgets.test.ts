import { describe, expect, it } from 'vitest';
import { createHttp } from '../../src/http.js';
import { listBudgets, toBudget } from '../../src/sources/budgets.js';
import { fakeFetch, token } from '../helpers.js';

describe('Budget API source (R9)', () => {
  it('converts specified amounts to minor units', () => {
    expect(toBudget({ name: 'b/1', displayName: 'Cap', amount: { specifiedAmount: { currencyCode: 'USD', units: '50', nanos: 250000000 } } })).toEqual({
      name: 'Cap', scope: 'account', period: 'month', amount: { kind: 'specified', minor: 5025, currency: 'USD' },
    });
  });
  it('recognises last-period amounts, filters and custom periods', () => {
    expect(toBudget({ name: 'b/2', amount: { lastPeriodAmount: {} } })?.amount).toEqual({ kind: 'lastPeriod' });
    expect(toBudget({ name: 'b/3', amount: { specifiedAmount: { units: '1' } }, budgetFilter: { projects: ['projects/123'] } })?.scope).toBe('filtered');
    expect(toBudget({ name: 'b/4', amount: { specifiedAmount: { units: '1' } }, budgetFilter: { customPeriod: {} } })?.period).toBe('other');
    expect(toBudget({ name: 'b/5', amount: { specifiedAmount: { units: '1' } }, budgetFilter: { calendarPeriod: 'QUARTER' } })?.period).toBe('other');
  });
  it('returns an empty list when there are no budgets', async () => {
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: 'https://billingbudgets.googleapis.com/v1/billingAccounts/000000-000000-000000/budgets', body: {} }]) });
    expect(await listBudgets(http, '000000-000000-000000')).toEqual([]);
  });
});
