import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContext, parseArgs, type CliDeps } from '../../src/cli.js';
import { formatFindings, runDoctor } from '../../src/doctor.js';
import { HttpError } from '../../src/http.js';
import { fakeFetch, type Route } from '../helpers.js';

const now = () => new Date('2026-10-17T12:00:00Z');
const dir = mkdtempSync(join(tmpdir(), 'cloudbar-doctor-'));
const TABLE = 'example-project.billing.gcp_billing_export_v1_000000_000000_000000';
const disabled = (service: string) => ({
  status: 403,
  body: { error: { code: 403, message: 'off', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service } }] } },
});

function configFile(obj: unknown): string {
  const p = join(dir, `c${Math.random()}.json`);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

async function doctor(opts: { routes?: Route[]; config?: unknown; token?: () => Promise<string>; quota?: string | undefined; log?: { method: string; url: string }[] }) {
  const deps: CliDeps = {
    env: {},
    now,
    out: () => {},
    fetch: fakeFetch(opts.routes ?? [], opts.log),
    getToken: opts.token ?? (async () => 't'),
    adcQuotaProject: async () => opts.quota,
  };
  const ctx = await createContext(parseArgs(['doctor', '--config', configFile(opts.config ?? {})]), deps);
  return runDoctor(ctx, { now });
}

const accounts: Route = { match: 'https://cloudbilling.googleapis.com/v1/billingAccounts', body: { billingAccounts: [{ name: 'billingAccounts/000000-000000-000000', displayName: 'Personal', open: true }] } };
const noBudgets: Route = { match: 'https://billingbudgets.googleapis.com/', body: {} };

describe('setup check (Story 4)', () => {
  it('fails credentials with the sign-in step and stops', async () => {
    const log: { method: string; url: string }[] = [];
    const f = await doctor({ token: async () => { throw new HttpError('auth', 'not signed in'); }, log });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ area: 'credentials', level: 'fail', nextStep: 'run: gcloud auth application-default login' });
    expect(log).toHaveLength(0);
  });
  it('fails when no quota project is set', async () => {
    const f = await doctor({ routes: [accounts, noBudgets], quota: undefined });
    expect(f.find((x) => x.area === 'quotaProject')).toMatchObject({ level: 'fail', nextStep: expect.stringContaining('set-quota-project') });
  });
  it('maps USER_PROJECT_DENIED to a quota project problem', async () => {
    const f = await doctor({
      quota: 'fake-quota',
      routes: [{ match: 'https://cloudbilling.googleapis.com/', status: 403, body: { error: { message: 'x', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'USER_PROJECT_DENIED' }] } } }],
    });
    expect(f.find((x) => x.area === 'quotaProject' && x.level === 'fail')?.nextStep).toContain('serviceusage.services.use');
  });
  it('reports an API disabled in the quota project with a console link, and never calls enable', async () => {
    const log: { method: string; url: string }[] = [];
    const f = await doctor({ quota: 'fake-quota', log, routes: [accounts, { match: 'https://billingbudgets.googleapis.com/', ...disabled('billingbudgets.googleapis.com') }] });
    const api = f.find((x) => x.area === 'api');
    expect(api).toMatchObject({ level: 'fail', link: 'https://console.cloud.google.com/apis/library/billingbudgets.googleapis.com?project=fake-quota' });
    expect(log.every((l) => l.method === 'GET' && !/:enable|batchEnable/.test(l.url))).toBe(true);
  });
  it('warns when the export is not configured', async () => {
    const f = await doctor({ quota: 'fake-quota', routes: [accounts, noBudgets] });
    expect(f.find((x) => x.area === 'billingExport')).toMatchObject({ level: 'warn', message: expect.stringContaining('Personal') });
  });
  it('fails when a configured export table does not exist', async () => {
    const f = await doctor({
      quota: 'fake-quota',
      config: { billingExports: { '000000-000000-000000': TABLE } },
      routes: [
        accounts,
        noBudgets,
        { match: 'https://bigquery.googleapis.com/bigquery/v2/projects/example-project/datasets/billing/tables', body: { tables: [{ tableReference: { tableId: 'something_else' } }] } },
        { method: 'POST', match: 'https://bigquery.googleapis.com/', body: { jobComplete: true, totalBytesProcessed: '1', rows: [] } },
      ],
    });
    expect(f.some((x) => x.area === 'billingExport' && x.level === 'fail' && x.message.includes('not found'))).toBe(true);
  });
  it('warns, not fails, when budgets are denied', async () => {
    const f = await doctor({ quota: 'fake-quota', routes: [accounts, { match: 'https://billingbudgets.googleapis.com/', status: 403, body: { error: { message: 'denied' } } }] });
    expect(f.find((x) => x.area === 'budgets')).toMatchObject({ level: 'warn' });
  });
});

describe('field report: per-project noise and misattributed billing', () => {
  it('groups unused APIs into one note each, and blames the quota project for Cloud Billing', async () => {
    const off = (svc: string) => ({ status: 403, body: { error: { message: 'off', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service: svc } }] } } });
    const f = await doctor({
      quota: 'fake-quota',
      routes: [
        { match: 'https://cloudbilling.googleapis.com/', ...off('cloudbilling.googleapis.com') },
        { match: 'https://cloudresourcemanager.googleapis.com/', body: { projects: [
          { name: 'projects/1', projectId: 'fake-a', displayName: 'A' }, { name: 'projects/2', projectId: 'fake-b', displayName: 'B' },
        ] } },
        { match: 'https://serviceusage.googleapis.com/', body: { services: [{ name: 'x/run.googleapis.com', config: { name: 'run.googleapis.com' } }] } },
        { match: 'https://run.googleapis.com/', body: { items: [] } },
        { match: 'https://sqladmin.googleapis.com/', ...off('sqladmin.googleapis.com') },
      ],
    });
    const billing = f.filter((x) => x.message.includes('Cloud Billing API'));
    expect(billing).toHaveLength(1);
    expect(billing[0]).toMatchObject({ level: 'fail', message: expect.stringContaining('quota project (fake-quota)') });
    const sql = f.filter((x) => x.message.includes('Cloud SQL Admin API'));
    expect(sql).toEqual([expect.objectContaining({ level: 'warn', message: 'Cloud SQL Admin API is off in 2 projects (fine if unused): fake-a, fake-b' })]);
    expect(f.find((x) => x.message.includes('data sources readable'))!.message).toMatch(/skipped: API off/);
  });
});

describe('placeholder config (field report: copied example config)', () => {
  it('flags example values and does not claim the quota project works', async () => {
    const f = await doctor({
      quota: 'example-project',
      config: { quotaProject: 'example-project', billingExports: { '000000-000000-000000': TABLE } },
      routes: [{ match: 'https://', status: 403, body: { error: { message: 'x', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'USER_PROJECT_DENIED' }] } } }],
    });
    expect(f.filter((x) => x.level === 'fail').map((x) => x.message)).toEqual(expect.arrayContaining([
      'quotaProject in your config is the placeholder "example-project"',
      expect.stringContaining('billingExports in your config still has the placeholder'),
    ]));
    expect(f.some((x) => x.area === 'quotaProject' && x.level === 'pass')).toBe(false);
    expect(f.find((x) => x.message.startsWith('Cannot read dataset'))?.nextStep).toBe('fix the quota project first (see above)');
  });
  it('the shipped example config contains no placeholders', async () => {
    const { readFileSync } = await import('node:fs');
    const example = JSON.parse(readFileSync(join(__dirname, '..', '..', 'config.example.json'), 'utf8'));
    expect(example.quotaProject).toBeUndefined();
    expect(example.billingExports).toBeUndefined();
  });
});

describe('setup check output', () => {
  const findings = [
    { area: 'credentials', level: 'pass', message: 'Signed in (Application Default Credentials)' },
    { area: 'quotaProject', level: 'fail', message: 'No quota project is set', nextStep: 'run: gcloud auth application-default set-quota-project <a-project-you-own>' },
    { area: 'api', level: 'warn', message: 'Cloud SQL Admin API not enabled in fake-blog', link: 'https://console.cloud.google.com/apis/library/sqladmin.googleapis.com?project=fake-blog' },
  ] as const;
  it('text', () => expect(formatFindings([...findings], 'text')).toMatchSnapshot());
  it('swiftbar', () => expect(formatFindings([...findings], 'swiftbar')).toMatchSnapshot());
});
