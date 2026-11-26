import type { FetchFn } from '../src/http.js';

export interface Route {
  match: RegExp | string;
  status?: number;
  body: unknown;
  method?: string;
}

/** A fetch that serves canned responses; unmatched URLs fail the test loudly with a 599. */
export function fakeFetch(routes: Route[], log: { method: string; url: string; body?: string }[] = []): FetchFn {
  return async (url, init) => {
    const entry: { method: string; url: string; body?: string } = { method: init.method, url };
    if (init.body !== undefined) entry.body = init.body;
    log.push(entry);
    const r = routes.find((r) => (r.method ? r.method === init.method : true) && (typeof r.match === 'string' ? url.startsWith(r.match) : r.match.test(url)));
    const status = r ? r.status ?? 200 : 599;
    const text = r ? (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) : JSON.stringify({ error: { message: `no route for ${url}` } });
    return { status, ok: status >= 200 && status < 300, text: async () => text };
  };
}

export const noSleep = async () => {};
export const token = async () => 'test-token';
