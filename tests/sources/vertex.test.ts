import { describe, expect, it } from 'vitest';
import { createHttp } from '../../src/http.js';
import { listVertexEndpoints } from '../../src/sources/vertex.js';
import { fakeFetch, token } from '../helpers.js';
import { api } from './projects.test.js';

describe('Vertex AI endpoints (R6)', () => {
  it('calls the regional host and treats empty endpoints as idle', async () => {
    const log: { method: string; url: string }[] = [];
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: 'https://europe-west4-aiplatform.googleapis.com/v1/projects/fake-alpha/locations/europe-west4/endpoints', body: api('vertex-endpoints.json') }], log) });
    const r = await listVertexEndpoints(http, 'fake-alpha', 'europe-west4');
    expect(log[0]!.url.startsWith('https://europe-west4-aiplatform.googleapis.com/')).toBe(true);
    expect(r.resources.map((x) => [x.name, x.mapped])).toEqual([
      ['gemma-chat', { kind: 'ready' }],
      ['empty-endpoint', { kind: 'unknown', reason: 'idle, no models deployed' }],
    ]);
    expect(r.resources[0]!.consoleUrl).toBe('https://console.cloud.google.com/vertex-ai/online-prediction/locations/europe-west4/endpoints/111?project=fake-alpha');
  });
});
