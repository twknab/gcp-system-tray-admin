import { describe, expect, it } from 'vitest';
import { createHttp } from '../../src/http.js';
import { costsQuery, fetchCosts, jobProjectFor } from '../../src/sources/costs.js';
import { fakeFetch, token } from '../helpers.js';

const TABLE = 'example-project.billing.gcp_billing_export_v1_000000_000000_000000';
const URL_ = 'https://bigquery.googleapis.com/bigquery/v2/projects/example-project/queries';
const rows = {
  jobComplete: true,
  rows: [
    { f: [{ v: '202610' }, { v: 'USD' }, { v: '24.8199999' }, { v: '1.7606886E9' }] },
    { f: [{ v: '202609' }, { v: 'USD' }, { v: '31.45' }, { v: '1.759E9' }] },
  ],
};

describe('BigQuery spend source (R10, FR-017)', () => {
  it('builds a partition-filtered query for both invoice months', () => {
    const q = costsQuery(TABLE);
    expect(q).toContain(`FROM \`${TABLE}\``);
    expect(q).toContain('DATE(_PARTITIONTIME) >=');
    expect(q).toContain("FORMAT_DATE('%Y%m', CURRENT_DATE('America/Los_Angeles'))");
    expect(q).toContain('INTERVAL 1 MONTH)))');
    expect(q).toContain('UNNEST(credits)');
  });
  it('dry-runs first, caps bytes, and parses rows into minor units', async () => {
    const log: { method: string; url: string; body?: string }[] = [];
    const http = createHttp({
      getToken: token,
      fetch: async (url, init) => {
        log.push({ method: init.method, url, ...(init.body ? { body: init.body } : {}) });
        const body = JSON.parse(init.body!);
        const res = body.dryRun ? { jobComplete: true, totalBytesProcessed: '2048' } : rows;
        return { status: 200, ok: true, text: async () => JSON.stringify(res) };
      },
    });
    const c = await fetchCosts(http, { table: TABLE, jobProject: 'example-project', maxBytesBilled: 1073741824 });
    expect(log).toHaveLength(2);
    const [dry, real] = log.map((l) => JSON.parse(l.body!));
    expect(dry.dryRun).toBe(true);
    expect(real.dryRun).toBeUndefined();
    for (const b of [dry, real]) {
      expect(b.useLegacySql).toBe(false);
      expect(b.maximumBytesBilled).toBe('1073741824');
    }
    expect(log[0]!.url).toBe(URL_);
    expect(c.rows).toEqual([
      { month: '202610', currency: 'USD', netMinor: 2482 },
      { month: '202609', currency: 'USD', netMinor: 3145 },
    ]);
    expect(c.exportTime).toBe(new Date(1.7606886e12).toISOString());
    expect(c.dryRunBytes).toBe(2048);
  });
  it('reuses a previous dry run for the same table', async () => {
    const log: string[] = [];
    const http = createHttp({ getToken: token, fetch: async (_u, init) => { log.push(init.body!); return { status: 200, ok: true, text: async () => JSON.stringify(rows) }; } });
    await fetchCosts(http, { table: TABLE, jobProject: 'example-project', maxBytesBilled: 1073741824, previous: { table: TABLE, dryRunBytes: 10 } });
    expect(log).toHaveLength(1);
  });
  it('refuses to run when the dry run exceeds the cap', async () => {
    const log: string[] = [];
    const http = createHttp({
      getToken: token,
      fetch: async (_u, init) => { log.push(init.body!); return { status: 200, ok: true, text: async () => JSON.stringify({ jobComplete: true, totalBytesProcessed: '99999999999' }) }; },
    });
    await expect(fetchCosts(http, { table: TABLE, jobProject: 'example-project', maxBytesBilled: 1073741824 })).rejects.toMatchObject({ kind: 'quota' });
    expect(log).toHaveLength(1);
  });
  it('polls an unfinished job with GET', async () => {
    const http = createHttp({
      getToken: token,
      fetch: fakeFetch([
        { method: 'POST', match: URL_, body: { jobComplete: false, jobReference: { projectId: 'example-project', jobId: 'j1', location: 'US' } } },
        { method: 'GET', match: /queries\/j1\?timeoutMs=10000&location=US/, body: rows },
      ]),
    });
    const c = await fetchCosts(http, { table: TABLE, jobProject: 'example-project', maxBytesBilled: 1073741824, previous: { table: TABLE, dryRunBytes: 1 } });
    expect(c.rows).toHaveLength(2);
  });
  it('runs the job in the quota project, else the table project', () => {
    expect(jobProjectFor(TABLE, 'example-quota')).toBe('example-quota');
    expect(jobProjectFor(TABLE, undefined)).toBe('example-project');
  });
});
