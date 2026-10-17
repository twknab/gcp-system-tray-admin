#!/usr/bin/env node
// Generates tests/fixtures/*.json (Snapshot documents with fake IDs). Run: node scripts/build-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../tests/fixtures/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const NOW = '2026-10-17T12:00:00Z';
const at = (hoursAgo) => new Date(Date.parse(NOW) - hoursAgo * 3600_000).toISOString();
const ok = (data, hoursAgo = 0.05) => ({ ok: true, data, fetchedAt: at(hoursAgo) });
const fail = (kind, reason, lastGood) => ({ ok: false, kind, reason, fetchedAt: at(0.05), ...(lastGood ? { lastGood } : {}) });

const A = '000000-000000-000000';
const B = '111111-111111-111111';
const C = '222222-222222-222222';
const TABLE = (id) => `example-project.billing.gcp_billing_export_v1_${id.replaceAll('-', '_')}`;
const costs = (mtd, last, exportHoursAgo = 3, currency = 'USD') => ({
  table: 'x',
  rows: [
    ...(mtd === null ? [] : [{ month: '202610', currency, netMinor: mtd }]),
    ...(last === null ? [] : [{ month: '202609', currency, netMinor: last }]),
  ],
  exportTime: at(exportHoursAgo),
  dryRunBytes: 1048576,
});
const budget = (name, minor, scope = 'account', currency = 'USD') => ({ name, scope, period: 'month', amount: { kind: 'specified', minor, currency } });
const acct = (id, name, open = true) => ({ id, displayName: name, open, currencyCode: 'USD' });

export const fixtures = {};
const snap = (sources) => ({ schemaVersion: 1, updatedAt: at(0.05), sources });

// ---------- US1 billing ----------
fixtures.billing = {
  config: { billingExports: { [A]: TABLE(A), [B]: TABLE(B) } },
  snapshot: snap({
    billingAccounts: ok([acct(A, 'Personal'), acct(B, 'Side projects'), acct(C, 'Old account', false)]),
    [`costs:${A}`]: ok(costs(2010, 2800)),
    [`costs:${B}`]: ok(costs(472, 345)),
    [`budgets:${A}`]: ok([budget('Monthly cap', 5000), budget('Vertex only', 2000, 'filtered')]),
    [`budgets:${B}`]: ok([]),
  }),
};
fixtures['billing-partial'] = {
  config: { billingExports: { [A]: TABLE(A), [B]: TABLE(B) } },
  snapshot: snap({
    billingAccounts: ok([acct(A, 'Personal'), acct(B, 'Side projects'), acct(C, 'Client work')]),
    [`costs:${A}`]: ok(costs(2010, 2800)),
    [`costs:${B}`]: ok(costs(472, 345)),
    [`costs:${C}`]: fail('other', 'export not configured'),
    [`budgets:${A}`]: ok([budget('Monthly cap', 5000)]),
    [`budgets:${B}`]: ok([]),
    [`budgets:${C}`]: ok([]),
  }),
};
fixtures['billing-multicurrency'] = {
  config: { billingExports: { [A]: TABLE(A), [B]: TABLE(B) } },
  snapshot: snap({
    billingAccounts: ok([acct(A, 'Personal'), { ...acct(B, 'EU account'), currencyCode: 'EUR' }]),
    [`costs:${A}`]: ok(costs(2482, 3145)),
    [`costs:${B}`]: ok(costs(1250, 900, 3, 'EUR')),
    [`budgets:${A}`]: ok([]),
    [`budgets:${B}`]: ok([]),
  }),
};
fixtures['no-export'] = {
  config: {},
  snapshot: snap({
    billingAccounts: ok([acct(A, 'Personal')]),
    [`costs:${A}`]: fail('other', 'export not configured'),
    [`budgets:${A}`]: ok([budget('Monthly cap', 5000)]),
  }),
};
fixtures['no-budget'] = {
  config: { billingExports: { [A]: TABLE(A) } },
  snapshot: snap({ billingAccounts: ok([acct(A, 'Personal')]), [`costs:${A}`]: ok(costs(2482, 3145)), [`budgets:${A}`]: ok([]) }),
};
fixtures['over-budget'] = {
  config: { billingExports: { [A]: TABLE(A) } },
  snapshot: snap({ billingAccounts: ok([acct(A, 'Personal')]), [`costs:${A}`]: ok(costs(5300, 3145)), [`budgets:${A}`]: ok([budget('Monthly cap', 5000)]) }),
};
fixtures['stale-costs'] = {
  config: { billingExports: { [A]: TABLE(A) } },
  snapshot: snap({ billingAccounts: ok([acct(A, 'Personal')]), [`costs:${A}`]: ok(costs(2482, 3145, 30)), [`budgets:${A}`]: ok([budget('Monthly cap', 5000)]) }),
};

for (const [name, fx] of Object.entries(fixtures)) {
  writeFileSync(`${out}${name}.json`, JSON.stringify({ now: NOW, ...fx }, null, 2) + '\n');
}
console.log(`wrote ${Object.keys(fixtures).length} fixtures`);
