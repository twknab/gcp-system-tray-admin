import { describe, expect, it } from 'vitest';
import { assertReadOnly, createHttp } from '../../src/http.js';
import { fakeFetch, token } from '../helpers.js';

describe('read-only guard (Principle I, FR-016)', () => {
  it('allows GET', () => {
    expect(() => assertReadOnly('GET', 'https://run.googleapis.com/apis/serving.knative.dev/v1/namespaces/fake-p/services')).not.toThrow();
  });
  it('allows POST only to BigQuery jobs.query', () => {
    expect(() => assertReadOnly('POST', 'https://bigquery.googleapis.com/bigquery/v2/projects/fake-p/queries')).not.toThrow();
    expect(() => assertReadOnly('POST', 'https://bigquery.googleapis.com/bigquery/v2/projects/fake-p/jobs')).toThrow();
    expect(() => assertReadOnly('POST', 'https://monitoring.googleapis.com/v3/projects/fake-p/timeSeries')).toThrow();
  });
  it.each(['PUT', 'PATCH', 'DELETE'])('rejects %s', (m) => {
    expect(() => assertReadOnly(m, 'https://storage.googleapis.com/storage/v1/b/x')).toThrow(/read-only/);
  });
  it.each([
    'https://serviceusage.googleapis.com/v1/projects/fake-p/services/run.googleapis.com:enable',
    'https://serviceusage.googleapis.com/v1/projects/fake-p/services:batchEnable',
    'https://serviceusage.googleapis.com/v1/projects/fake-p/services/x:disable',
    'https://example.googleapis.com/v1/thing/delete',
    'https://example.googleapis.com/v1/thing:patch',
  ])('rejects mutating URL %s even with GET', (url) => {
    expect(() => assertReadOnly('GET', url)).toThrow(/mutating/);
  });
  it('rejects plain HTTP', () => {
    expect(() => assertReadOnly('GET', 'http://example.com')).toThrow();
  });
  it('never sends a blocked request', async () => {
    const log: { method: string; url: string }[] = [];
    const http = createHttp({ fetch: fakeFetch([], log), getToken: token });
    await expect(http.getJson('https://serviceusage.googleapis.com/v1/projects/fake-p/services/x:enable')).rejects.toThrow();
    expect(log).toHaveLength(0);
  });
  it('adds auth and quota project headers', async () => {
    let seen: Record<string, string> = {};
    const http = createHttp({
      fetch: async (_u, init) => {
        seen = init.headers;
        return { status: 200, ok: true, text: async () => '{}' };
      },
      getToken: token,
      quotaProject: 'fake-quota',
    });
    await http.getJson('https://cloudbilling.googleapis.com/v1/billingAccounts');
    expect(seen.Authorization).toBe('Bearer test-token');
    expect(seen['x-goog-user-project']).toBe('fake-quota');
  });
});
