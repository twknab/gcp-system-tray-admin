import { describe, expect, it } from 'vitest';
import { createHttp } from '../../src/http.js';
import { listRunServices, mapRunState } from '../../src/sources/run.js';
import { fakeFetch, noSleep, token } from '../helpers.js';
import { api } from './projects.test.js';

const V1 = 'https://run.googleapis.com/apis/serving.knative.dev/v1/namespaces/fake-alpha/services';

describe('Cloud Run (R4)', () => {
  it('maps every row of the R4 table', () => {
    expect(mapRunState('True', 'a', 'a')).toEqual({ kind: 'ready' });
    expect(mapRunState('False', 'a', 'b')).toEqual({ kind: 'degraded', reason: 'latest revision failed, previous still serving' });
    expect(mapRunState('False', undefined, 'b', 'boom')).toEqual({ kind: 'down', reason: 'not serving: boom' });
    expect(mapRunState('Unknown', 'a', 'b')).toEqual({ kind: 'unknown', reason: 'deploying' });
    expect(mapRunState('True', 'a', 'b')).toEqual({ kind: 'unknown', reason: 'deploying' });
  });
  it('lists all regions from the v1 global endpoint and reports unreachable ones', async () => {
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: V1, body: api('run-v1-list.json') }]) });
    const r = await listRunServices(http, 'fake-alpha', ['us-central1']);
    expect(r.resources.map((x) => [x.name, x.location, x.mapped.kind])).toEqual([
      ['api', 'us-central1', 'ready'],
      ['worker', 'europe-west1', 'degraded'],
      ['broken', 'us-central1', 'down'],
      ['rolling', 'us-east1', 'unknown'],
    ]);
    expect(r.unreachable).toEqual(['asia-east1']);
    expect(r.resources[0]!.consoleUrl).toBe('https://console.cloud.google.com/run/detail/us-central1/api/metrics?project=fake-alpha');
  });
  it('falls back to v2 per configured region when the global list fails', async () => {
    const http = createHttp({
      getToken: token,
      sleep: noSleep,
      fetch: fakeFetch([
        { match: V1, status: 404, body: { error: { message: 'not found' } } },
        { match: 'https://run.googleapis.com/v2/projects/fake-alpha/locations/us-central1/services', body: api('run-v2-list.json') },
      ]),
    });
    const r = await listRunServices(http, 'fake-alpha', ['us-central1']);
    expect(r.resources.map((x) => [x.name, x.mapped.kind])).toEqual([['api', 'ready']]);
    expect(r.unreachable?.[0]).toContain('outside us-central1');
  });
  it('does not fall back when the API is disabled', async () => {
    const http = createHttp({
      getToken: token,
      fetch: fakeFetch([{ match: V1, status: 403, body: { error: { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service: 'run.googleapis.com' } }] } } }]),
    });
    await expect(listRunServices(http, 'fake-alpha', ['us-central1'])).rejects.toMatchObject({ kind: 'disabled' });
  });
});
