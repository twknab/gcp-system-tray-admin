import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Route } from '../helpers.js';

const api = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'api', name), 'utf8'));
const allServices = {
  services: ['run', 'sqladmin', 'aiplatform', 'storage', 'monitoring'].map((s) => ({ name: `projects/1/services/${s}.googleapis.com`, config: { name: `${s}.googleapis.com` } })),
};

/** Every Google API CloudBar calls, served from tests/fixtures/api. Order matters: first match wins. */
export function allRoutes(): Route[] {
  const bqRows = { jobComplete: true, rows: [{ f: [{ v: '202610' }, { v: 'USD' }, { v: '24.82' }, { v: '1760680800' }] }, { f: [{ v: '202609' }, { v: 'USD' }, { v: '31.45' }, { v: '1760680800' }] }] };
  return [
    { match: 'https://cloudbilling.googleapis.com/v1/billingAccounts', body: { billingAccounts: [{ name: 'billingAccounts/000000-000000-000000', displayName: 'Personal', open: true, currencyCode: 'USD' }] } },
    { match: /cloudbilling\.googleapis\.com\/v1\/projects\/[^/]+\/billingInfo/, body: { billingEnabled: true, billingAccountName: 'billingAccounts/000000-000000-000000' } },
    { match: 'https://billingbudgets.googleapis.com/', body: { budgets: [{ name: 'billingAccounts/000000-000000-000000/budgets/b1', displayName: 'Monthly cap', amount: { specifiedAmount: { currencyCode: 'USD', units: '50' } } }] } },
    { method: 'POST', match: 'https://bigquery.googleapis.com/bigquery/v2/projects/example-project/queries', body: bqRows },
    { match: 'https://cloudresourcemanager.googleapis.com/v3/projects:search', body: api('projects-search.json') },
    { match: 'https://serviceusage.googleapis.com/', body: allServices },
    { match: /run\.googleapis\.com\/apis\/serving\.knative\.dev\/v1\/namespaces\/fake-alpha\//, body: api('run-v1-list.json') },
    { match: /run\.googleapis\.com\/apis\/serving\.knative\.dev\/v1\/namespaces\//, body: { items: [] } },
    { match: /sqladmin\.googleapis\.com\/v1\/projects\/fake-alpha\//, body: api('sql-instances.json') },
    { match: /sqladmin\.googleapis\.com\/v1\/projects\//, body: {} },
    { match: /us-central1-aiplatform\.googleapis\.com\/v1\/projects\/fake-alpha\//, body: api('vertex-endpoints.json') },
    { match: /aiplatform\.googleapis\.com\//, body: {} },
    { match: 'https://storage.googleapis.com/storage/v1/b?project=fake-alpha', body: api('storage-buckets.json') },
    { match: 'https://storage.googleapis.com/storage/v1/b', body: {} },
    { match: /monitoring\.googleapis\.com\/v3\/projects\/fake-alpha\/timeSeries/, body: api('storage-total-bytes.json') },
    { match: /monitoring\.googleapis\.com\/v3\/projects\/[^/]+\/timeSeries/, body: {} },
    { match: /monitoring\.googleapis\.com\/v3\/projects\/fake-alpha\/alertPolicies/, body: api('alert-policies.json') },
    { match: /monitoring\.googleapis\.com\/v3\/projects\/[^/]+\/alertPolicies/, body: {} },
    { match: /monitoring\.googleapis\.com\/v3\/projects\/fake-alpha\/uptimeCheckConfigs/, body: api('uptime-checks.json') },
    { match: /monitoring\.googleapis\.com\/v3\/projects\/[^/]+\/uptimeCheckConfigs/, body: {} },
    { match: /monitoring\.googleapis\.com\/v3\/projects\/fake-alpha\/alerts/, body: api('alerts-open.json') },
    { match: /monitoring\.googleapis\.com\/v3\/projects\/[^/]+\/alerts/, body: {} },
  ];
}

export const CONFIG = {
  billingExports: { '000000-000000-000000': 'example-project.billing.gcp_billing_export_v1_000000_000000_000000' },
  quotaProject: 'example-project',
};
