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

// ---------- US2 services ----------
const PROJECTS = [
  { projectId: 'fake-alpha', displayName: 'Alpha', projectNumber: '123456789012' },
  { projectId: 'fake-beta', displayName: 'Beta', projectNumber: '223456789012' },
  { projectId: 'fake-sandbox', displayName: 'Sandbox', projectNumber: '323456789012' },
];
const ALL_APIS = ['run.googleapis.com', 'sqladmin.googleapis.com', 'aiplatform.googleapis.com', 'storage.googleapis.com', 'monitoring.googleapis.com'];
const svc = (names) => ({ count: names.length + 20, names });
const res = (type, projectId, location, name, reportedState, mapped, extra = {}) => ({
  type, id: `${projectId}/${location}/${name}`, name, projectId, location, reportedState, mapped,
  consoleUrl: `https://console.cloud.google.com/${type}/${name}?project=${projectId}`, ...extra,
});
const READY = { kind: 'ready' };
const bucket = (projectId, name, createdAt = '2025-01-01T00:00:00Z') =>
  res('storage', projectId, 'us', name, 'STANDARD', { kind: 'unknown', reason: 'no running state' }, { createdAt });

function servicesSources() {
  return {
    billingAccounts: ok([acct(A, 'Personal')]),
    [`costs:${A}`]: ok(costs(2482, 3145)),
    [`budgets:${A}`]: ok([budget('Monthly cap', 5000)]),
    projects: ok(PROJECTS),
    'services:fake-alpha': ok(svc(ALL_APIS)),
    'services:fake-beta': ok(svc(['run.googleapis.com', 'storage.googleapis.com', 'monitoring.googleapis.com'])),
    'services:fake-sandbox': ok(svc(['storage.googleapis.com'])),
    'billingInfo:fake-alpha': ok({ billingEnabled: true, billingAccountId: A }),
    'billingInfo:fake-beta': ok({ billingEnabled: true, billingAccountId: A }),
    'billingInfo:fake-sandbox': ok({ billingEnabled: false }),
    'run:fake-alpha': ok({ resources: [
      res('run', 'fake-alpha', 'us-central1', 'api', 'Ready=True · api-00042-xyz', READY),
      res('run', 'fake-alpha', 'europe-west1', 'worker', 'Ready=False · worker-00007-aaa', { kind: 'degraded', reason: 'latest revision failed, previous still serving' }),
    ] }),
    'run:fake-beta': ok({ resources: [res('run', 'fake-beta', 'us-central1', 'site', 'Ready=True · site-00003-abc', READY)] }),
    'run:fake-sandbox': fail('disabled', 'Cloud Run Admin API not enabled'),
    'sql:fake-alpha': ok({ resources: [
      res('sql', 'fake-alpha', 'us-central1', 'main-db', 'RUNNABLE · ALWAYS · POSTGRES_16', READY),
      res('sql', 'fake-alpha', 'us-central1', 'old-db', 'RUNNABLE · NEVER', { kind: 'unknown', reason: 'stopped' }),
    ] }),
    'sql:fake-beta': fail('disabled', 'Cloud SQL Admin API not enabled'),
    'sql:fake-sandbox': fail('disabled', 'Cloud SQL Admin API not enabled'),
    'vertex:fake-alpha:us-central1': ok({ resources: [res('vertex', 'fake-alpha', 'us-central1', 'gemma-chat', '1 deployed model', READY)] }),
    'vertex:fake-beta:us-central1': fail('disabled', 'Vertex AI API not enabled'),
    'vertex:fake-sandbox:us-central1': fail('disabled', 'Vertex AI API not enabled'),
    'storage:fake-alpha': ok({ resources: [bucket('fake-alpha', 'fake-alpha-assets'), bucket('fake-alpha', 'fake-alpha-new', at(10))] }),
    'storage:fake-beta': ok({ resources: [bucket('fake-beta', 'fake-beta-site'), bucket('fake-beta', 'fake-beta-empty')] }),
    'storage:fake-sandbox': ok({ resources: [bucket('fake-sandbox', 'fake-sandbox-scratch')] }),
    'storageSize:fake-alpha': ok({ sizes: { 'fake-alpha-assets': 412000000000 }, asOf: at(4) }),
    'storageSize:fake-beta': ok({ sizes: { 'fake-beta-site': 1500000 }, asOf: at(4) }),
    'storageSize:fake-sandbox': fail('disabled', 'Cloud Monitoring API not enabled'),
  };
}
fixtures.services = { config: { billingExports: { [A]: TABLE(A) } }, snapshot: snap(servicesSources()) };

const overflow = servicesSources();
overflow['storage:fake-beta'] = ok({ resources: Array.from({ length: 30 }, (_, i) => bucket('fake-beta', `fake-beta-logs-${String(i).padStart(2, '0')}`)) });
overflow['storageSize:fake-beta'] = ok({ sizes: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`fake-beta-logs-${String(i).padStart(2, '0')}`, 1_000_000_000])), asOf: at(4) });
fixtures['services-overflow'] = { config: { billingExports: { [A]: TABLE(A) } }, snapshot: snap(overflow) };

const denied = servicesSources();
denied['sql:fake-alpha'] = fail('denied', 'permission denied: cloudsql.instances.list');
denied['run:fake-beta'] = fail('network', 'network error: fetch failed', { data: { resources: [res('run', 'fake-beta', 'us-central1', 'site', 'Ready=True · site-00003-abc', READY)] }, fetchedAt: at(2) });
fixtures.denied = { config: { billingExports: { [A]: TABLE(A) } }, snapshot: snap(denied) };

for (const [name, fx] of Object.entries(fixtures)) {
  writeFileSync(`${out}${name}.json`, JSON.stringify({ now: NOW, ...fx }, null, 2) + '\n');
}
console.log(`wrote ${Object.keys(fixtures).length} fixtures`);
