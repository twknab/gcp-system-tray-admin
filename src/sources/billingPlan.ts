// US1 sources: billing accounts, costs per account, budgets per account.
import type { BillingAccountInfo, Costs } from '../model/types.js';
import type { SourceDef } from '../refresh.js';
import { listBillingAccounts } from './billingAccounts.js';
import { listBudgets } from './budgets.js';
import { fetchCosts, jobProjectFor } from './costs.js';
import { dataOf, type PlanPart } from './index.js';

export const billingPlan: PlanPart = (snapshot, ctx) => {
  const defs: SourceDef[] = [{ key: 'billingAccounts', ttl: ctx.config.ttl.projects, run: () => listBillingAccounts(ctx.http) }];
  const accounts = dataOf<BillingAccountInfo[]>(snapshot, 'billingAccounts') ?? [];
  for (const a of accounts.filter((x) => x.open)) {
    const table = ctx.config.billingExports[a.id];
    const prev = dataOf<Costs & { table?: string }>(snapshot, `costs:${a.id}`);
    const costs: SourceDef = {
      key: `costs:${a.id}`,
      ttl: ctx.config.ttl.costs,
      run: () =>
        fetchCosts(ctx.http, {
          table: table!,
          jobProject: jobProjectFor(table!, ctx.jobProject),
          maxBytesBilled: ctx.config.maxBytesBilled,
          previous: prev?.table && prev.dryRunBytes !== undefined ? { table: prev.table, dryRunBytes: prev.dryRunBytes } : undefined,
        }),
    };
    if (!table) costs.skip = { kind: 'other', reason: 'export not configured' };
    defs.push(costs, { key: `budgets:${a.id}`, ttl: ctx.config.ttl.budgets, run: () => listBudgets(ctx.http, a.id) });
  }
  return defs;
};
