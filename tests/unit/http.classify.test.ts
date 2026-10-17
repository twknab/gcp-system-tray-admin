import { describe, expect, it } from 'vitest';
import { classify, createHttp } from '../../src/http.js';
import { fakeFetch, noSleep, token } from '../helpers.js';

const errorInfo = (reason: string, service = 'sqladmin.googleapis.com') =>
  JSON.stringify({
    error: {
      code: 403,
      status: 'PERMISSION_DENIED',
      message: 'x',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'googleapis.com', metadata: { service, consumer: 'projects/1' } }],
    },
  });

describe('error classifier (research R12)', () => {
  it.each([
    [403, errorInfo('SERVICE_DISABLED'), 'disabled'],
    [403, errorInfo('BILLING_DISABLED'), 'disabled'],
    [403, errorInfo('USER_PROJECT_DENIED'), 'auth'],
    [403, JSON.stringify({ error: { message: 'nope' } }), 'denied'],
    [401, '{}', 'auth'],
    [429, '{}', 'quota'],
    [503, '{}', 'other'],
    [500, 'not json', 'other'],
  ])('%i → %s', (status, body, kind) => {
    expect(classify(status, body).kind).toBe(kind);
  });
  it('names the disabled service', () => {
    expect(classify(403, errorInfo('SERVICE_DISABLED')).reason).toBe('sqladmin.googleapis.com is not enabled');
  });
  it('retries once on 5xx then fails', async () => {
    const log: { method: string; url: string }[] = [];
    const http = createHttp({ fetch: fakeFetch([{ match: 'https://x.googleapis.com/', status: 503, body: {} }], log), getToken: token, sleep: noSleep });
    await expect(http.getJson('https://x.googleapis.com/a')).rejects.toMatchObject({ kind: 'other' });
    expect(log).toHaveLength(2);
  });
  it('maps fetch rejection to network and timeouts to timeout', async () => {
    const net = createHttp({ fetch: async () => { throw new TypeError('fetch failed'); }, getToken: token });
    await expect(net.getJson('https://x.googleapis.com/a')).rejects.toMatchObject({ kind: 'network' });
    const slow = createHttp({
      fetch: async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; },
      getToken: token,
    });
    await expect(slow.getJson('https://x.googleapis.com/a')).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('follows nextPageToken', async () => {
    const http = createHttp({
      fetch: fakeFetch([
        { match: /pageToken=p2/, body: { items: [3], nextPageToken: '' } },
        { match: 'https://x.googleapis.com/list', body: { items: [1, 2], nextPageToken: 'p2' } },
      ]),
      getToken: token,
    });
    expect(await http.getAllPages<number>('https://x.googleapis.com/list', 'items')).toEqual([1, 2, 3]);
  });
});
