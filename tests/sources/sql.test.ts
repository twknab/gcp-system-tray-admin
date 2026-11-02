import { describe, expect, it } from 'vitest';
import { createHttp } from '../../src/http.js';
import { listSqlInstances } from '../../src/sources/sql.js';
import { fakeFetch, token } from '../helpers.js';
import { api } from './projects.test.js';

describe('Cloud SQL (R5)', () => {
  it('maps every state, including stopped-by-owner', async () => {
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: 'https://sqladmin.googleapis.com/v1/projects/fake-alpha/instances', body: api('sql-instances.json') }]) });
    const r = await listSqlInstances(http, 'fake-alpha');
    expect(r.resources.map((x) => [x.name, x.mapped])).toEqual([
      ['main-db', { kind: 'ready' }],
      ['old-db', { kind: 'unknown', reason: 'stopped' }],
      ['maint-db', { kind: 'degraded', reason: 'in maintenance' }],
      ['repair-db', { kind: 'degraded', reason: 'repairing' }],
      ['dead-db', { kind: 'down', reason: 'instance failed' }],
      ['unpaid-db', { kind: 'down', reason: 'suspended' }],
      ['new-db', { kind: 'unknown', reason: 'provisioning' }],
      ['bye-db', { kind: 'unknown', reason: 'deleting' }],
    ]);
  });
});
