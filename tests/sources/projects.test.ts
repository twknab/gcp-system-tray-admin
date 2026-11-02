import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config.js';
import { createHttp } from '../../src/http.js';
import { listEnabledServices, listProjects } from '../../src/sources/projects.js';
import { servicesPlan, visibleProjects } from '../../src/sources/servicesPlan.js';
import { emptySnapshot } from '../../src/cache.js';
import { fakeFetch, token } from '../helpers.js';

export const api = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'api', name), 'utf8'));

describe('projects and enabled APIs (R11, R12)', () => {
  it('searches ACTIVE projects', async () => {
    const log: { method: string; url: string }[] = [];
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: 'https://cloudresourcemanager.googleapis.com/v3/projects:search', body: api('projects-search.json') }], log) });
    const p = await listProjects(http);
    expect(log[0]!.url).toContain('query=state%3AACTIVE');
    expect(p.map((x) => [x.projectId, x.displayName, x.projectNumber])).toEqual([
      ['fake-alpha', 'Alpha', '123456789012'],
      ['fake-beta', 'Beta', '223456789012'],
      ['fake-sandbox', 'Sandbox', '323456789012'],
    ]);
  });
  it('drops excluded projects', () => {
    const config = parseConfig({ excludeProjects: ['fake-beta'] }, 'x');
    expect(visibleProjects([{ projectId: 'fake-alpha', displayName: 'A', projectNumber: '1' }, { projectId: 'fake-beta', displayName: 'B', projectNumber: '2' }], { config }).map((p) => p.projectId)).toEqual(['fake-alpha']);
  });
  it('counts enabled APIs across pages', async () => {
    const http = createHttp({
      getToken: token,
      fetch: fakeFetch([
        { match: /pageToken=page2/, body: { services: [{ name: 'projects/1/services/sqladmin.googleapis.com', config: { name: 'sqladmin.googleapis.com' } }] } },
        { match: 'https://serviceusage.googleapis.com/v1/projects/fake-alpha/services', body: api('services-enabled.json') },
      ]),
    });
    const s = await listEnabledServices(http, 'fake-alpha');
    expect(s.count).toBe(4);
    expect(s.names).toContain('sqladmin.googleapis.com');
  });
  it('skips sources whose API is disabled, without a request', () => {
    const config = parseConfig({}, 'x');
    const snap = emptySnapshot();
    snap.sources.projects = { ok: true, fetchedAt: '2026-10-17T12:00:00Z', data: [{ projectId: 'fake-alpha', displayName: 'Alpha', projectNumber: '1' }] };
    snap.sources['services:fake-alpha'] = { ok: true, fetchedAt: '2026-10-17T12:00:00Z', data: { count: 1, names: ['run.googleapis.com'] } };
    const defs = servicesPlan(snap, { http: createHttp({ getToken: token, fetch: fakeFetch([]) }), config, now: () => new Date() });
    const byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
    expect(byKey['run:fake-alpha']!.skip).toBeUndefined();
    expect(byKey['sql:fake-alpha']!.skip).toMatchObject({ kind: 'disabled' });
    expect(byKey['vertex:fake-alpha:us-central1']!.skip).toMatchObject({ kind: 'disabled' });
    expect(byKey['storageSize:fake-alpha']!.skip).toMatchObject({ kind: 'disabled' });
  });
});
