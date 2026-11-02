// The only way CloudBar talks to Google. Enforces Principle I: reads only.
import type { Failure, FailureKind } from './model/types.js';

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
}>;

export interface HttpOptions {
  fetch: FetchFn;
  getToken: () => Promise<string>;
  quotaProject?: string | undefined;
  timeoutMs?: number;
  /** override for tests */
  sleep?: (ms: number) => Promise<void>;
  /** observe every request (used by the read-only integration test) */
  onRequest?: (method: string, url: string, body?: string) => void;
}

export class HttpError extends Error implements Failure {
  constructor(public kind: FailureKind, public reason: string, public status?: number) {
    super(reason);
  }
}

const BIGQUERY_QUERY = /^https:\/\/bigquery\.googleapis\.com\/bigquery\/v2\/projects\/[^/]+\/queries$/;
const MUTATING = /:(enable|disable|batchEnable|patch|create|delete|update|setIamPolicy)\b|\/delete\b/i;

/** Throws unless the request is a read. Exported for tests. */
export function assertReadOnly(method: string, url: string): void {
  if (!url.startsWith('https://')) throw new HttpError('other', `Refusing non-HTTPS request to ${url}`);
  if (MUTATING.test(url)) throw new HttpError('other', `Refusing mutating request ${url}`);
  if (method === 'GET') return;
  if (method === 'POST' && BIGQUERY_QUERY.test(url.split('?')[0]!)) return;
  throw new HttpError('other', `Refusing ${method} ${url}: CloudBar is read-only`);
}

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: { '@type'?: string; reason?: string; metadata?: Record<string, string> }[] };
}

/** Map an HTTP error response to a FailureKind with a plain-English reason. */
export function classify(status: number, bodyText: string): HttpError {
  let body: GoogleErrorBody = {};
  try {
    body = JSON.parse(bodyText) as GoogleErrorBody;
  } catch {
    /* not JSON */
  }
  const info = body.error?.details?.find((d) => d['@type']?.endsWith('google.rpc.ErrorInfo'));
  const message = body.error?.message ?? `HTTP ${status}`;
  const service = info?.metadata?.service;
  switch (info?.reason) {
    case 'SERVICE_DISABLED':
      return new HttpError('disabled', `${service ?? 'API'} is not enabled`, status);
    case 'BILLING_DISABLED':
      return new HttpError('disabled', 'billing is disabled for this project', status);
    case 'USER_PROJECT_DENIED':
      return new HttpError('auth', 'the quota project cannot be used (needs serviceusage.services.use)', status);
  }
  if (status === 401) return new HttpError('auth', 'credentials are missing or expired', status);
  if (status === 403) return new HttpError('denied', `permission denied: ${message}`, status);
  if (status === 404) return new HttpError('other', `not found: ${message}`, status);
  if (status === 429) return new HttpError('quota', 'rate limited by Google; will retry later', status);
  if (status >= 500) return new HttpError('other', `Google returned ${status}`, status);
  return new HttpError('other', message, status);
}

export interface Http {
  getJson<T>(url: string): Promise<T>;
  getAllPages<T>(url: string, itemsKey: string, opts?: { tokenParam?: string; maxPages?: number }): Promise<T[]>;
  bigQueryPost<T>(url: string, body: unknown): Promise<T>;
}

export function createHttp(opts: HttpOptions): Http {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  async function request<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
    assertReadOnly(method, url);
    const bodyText = body === undefined ? undefined : JSON.stringify(body);
    let attempt = 0;
    for (;;) {
      attempt++;
      const headers: Record<string, string> = { Authorization: `Bearer ${await opts.getToken()}`, Accept: 'application/json' };
      if (opts.quotaProject) headers['x-goog-user-project'] = opts.quotaProject;
      if (bodyText !== undefined) headers['Content-Type'] = 'application/json';
      opts.onRequest?.(method, url, bodyText);
      let res;
      try {
        const init: Parameters<FetchFn>[1] = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
        if (bodyText !== undefined) init.body = bodyText;
        res = await opts.fetch(url, init);
      } catch (err) {
        const name = (err as Error).name;
        if (name === 'TimeoutError' || name === 'AbortError') throw new HttpError('timeout', `no response within ${timeoutMs / 1000}s`);
        throw new HttpError('network', `network error: ${(err as Error).message}`);
      }
      const text = await res.text();
      if (res.ok) return (text ? JSON.parse(text) : {}) as T;
      const err = classify(res.status, text);
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt === 1) {
        await sleep(250 + Math.random() * 500);
        continue;
      }
      throw err;
    }
  }

  return {
    getJson: (url) => request('GET', url),
    bigQueryPost: (url, body) => request('POST', url, body),
    async getAllPages<T>(url: string, itemsKey: string, o: { tokenParam?: string; maxPages?: number } = {}): Promise<T[]> {
      const items: T[] = [];
      let token: string | undefined;
      for (let page = 0; page < (o.maxPages ?? 50); page++) {
        const u = new URL(url);
        if (token) u.searchParams.set(o.tokenParam ?? 'pageToken', token);
        const res = await request<Record<string, unknown>>('GET', u.toString());
        const got = res[itemsKey];
        if (Array.isArray(got)) items.push(...(got as T[]));
        token = typeof res.nextPageToken === 'string' && res.nextPageToken ? res.nextPageToken : undefined;
        if (!token) break;
      }
      return items;
    },
  };
}

export function toFailure(err: unknown): Failure {
  if (err instanceof HttpError) return { kind: err.kind, reason: err.reason };
  return { kind: 'other', reason: (err as Error)?.message ?? String(err) };
}
