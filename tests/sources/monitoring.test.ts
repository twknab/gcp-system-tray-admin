import { describe, expect, it } from 'vitest';
import { createHttp } from '../../src/http.js';
import { conditionTypes, listAlertPolicies, listOpenAlerts, listUptimeCoverage } from '../../src/sources/monitoring.js';
import { buildMonitoring } from '../../src/model/alerts.js';
import { fakeFetch, token } from '../helpers.js';
import { loadFixture } from '../render/invariants.js';
import { api } from './projects.test.js';

const M = 'https://monitoring.googleapis.com/v3/projects/fake-alpha';

describe('Cloud Monitoring (R1–R3)', () => {
  it('maps each condition kind to a resource type', () => {
    expect(conditionTypes({ conditionThreshold: { filter: 'resource.type = "cloud_run_revision" AND x' } })).toEqual(['run']);
    expect(conditionTypes({ conditionThreshold: { filter: "resource.type='gcs_bucket'" } })).toEqual(['storage']);
    expect(conditionTypes({ conditionAbsent: { filter: 'resource.type="cloudsql_database"' } })).toEqual(['sql']);
    expect(conditionTypes({ conditionMonitoringQueryLanguage: { query: 'fetch cloudsql_database::cloudsql.googleapis.com/database/up' } })).toEqual(['sql']);
    expect(conditionTypes({ conditionPrometheusQueryLanguage: { query: 'up{monitored_resource="aiplatform.googleapis.com/Endpoint"}' } })).toEqual(['vertex']);
    expect(conditionTypes({ conditionPrometheusQueryLanguage: { query: 'rate(run_googleapis_com:request_count[5m]) > 1' } })).toEqual(['run']);
    expect(conditionTypes({ conditionThreshold: { filter: 'resource.type="gce_instance"' } })).toEqual([]);
  });
  it('counts enabled policies and ignores disabled or unmappable ones', async () => {
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: `${M}/alertPolicies`, body: api('alert-policies.json') }]) });
    expect(await listAlertPolicies(http, 'fake-alpha')).toEqual({ policyCount: 4, coveredTypes: ['run', 'sql', 'vertex'] });
  });
  it('treats an uptime check on cloud_run_revision as Cloud Run coverage', async () => {
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: `${M}/uptimeCheckConfigs`, body: api('uptime-checks.json') }]) });
    expect(await listUptimeCoverage(http, 'fake-alpha')).toEqual({ coveredTypes: ['run'], count: 2 });
  });
  it('lists open alerts with severity, type and resource name', async () => {
    const log: { method: string; url: string }[] = [];
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: `${M}/alerts`, body: api('alerts-open.json') }], log) });
    const a = await listOpenAlerts(http, 'fake-alpha');
    expect(decodeURIComponent(log[0]!.url)).toContain('filter=state="OPEN"');
    expect(a.map((x) => [x.policyName, x.severity, x.resourceType, x.resourceName])).toEqual([
      ['Cloud Run 5xx', 'critical', 'run', 'api'],
      ['SQL CPU (MQL)', 'warning', 'sql', 'main-db'],
      ['Some VM thing', 'unspecified', undefined, undefined],
    ]);
    expect(a[0]!.consoleUrl).toBe('https://console.cloud.google.com/monitoring/alerting/alerts/0.abc123?project=fake-alpha');
  });
  it('keeps the policy count when the alerts call fails', () => {
    const f = loadFixture('alerts-none');
    f.snapshot.sources['alerts:fake-alpha'] = { ok: false, kind: 'denied', reason: 'permission denied: monitoring.alerts.list', fetchedAt: f.now.toISOString() };
    f.snapshot.sources['alerts:fake-beta'] = { ok: false, kind: 'denied', reason: 'permission denied: monitoring.alerts.list', fetchedAt: f.now.toISOString() };
    f.snapshot.sources['alerts:fake-gamma'] = { ok: false, kind: 'denied', reason: 'permission denied: monitoring.alerts.list', fetchedAt: f.now.toISOString() };
    const m = buildMonitoring(f.snapshot, f.config, f.now);
    expect(m.view).toMatchObject({ available: false, policyCount: 7 });
    expect(m.view!.reason).toContain('permission denied');
  });
});
