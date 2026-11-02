import { describe, expect, it } from 'vitest';
import { createHttp } from '../../src/http.js';
import { buildServices } from '../../src/model/services.js';
import { bucketSizes, listBuckets } from '../../src/sources/storage.js';
import { fakeFetch, token } from '../helpers.js';
import { loadFixture } from '../render/invariants.js';
import { api } from './projects.test.js';

const now = new Date('2026-10-17T12:00:00Z');

describe('Cloud Storage (R7, FR-023)', () => {
  it('lists buckets, which never have a running state', async () => {
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: 'https://storage.googleapis.com/storage/v1/b?project=fake-alpha', body: api('storage-buckets.json') }]) });
    const r = await listBuckets(http, 'fake-alpha');
    expect(r.resources.map((b) => [b.name, b.location, b.mapped.kind])).toEqual([
      ['fake-alpha-assets', 'us', 'unknown'],
      ['fake-alpha-empty', 'us-central1', 'unknown'],
      ['fake-alpha-new', 'us-central1', 'unknown'],
    ]);
  });
  it('reads total_bytes grouped by bucket, with the latest point time as as-of', async () => {
    const log: { method: string; url: string }[] = [];
    const http = createHttp({ getToken: token, fetch: fakeFetch([{ match: 'https://monitoring.googleapis.com/v3/projects/fake-alpha/timeSeries', body: api('storage-total-bytes.json') }], log) });
    const s = await bucketSizes(http, 'fake-alpha', now);
    expect(s).toEqual({ sizes: { 'fake-alpha-assets': 412000000000 }, asOf: '2026-10-17T08:00:00Z' });
    const u = new URL(log[0]!.url);
    expect(u.searchParams.get('filter')).toBe('metric.type="storage.googleapis.com/storage/total_bytes"');
    expect(u.searchParams.get('aggregation.groupByFields')).toBe('resource.label.bucket_name');
    expect(log[0]!.method).toBe('GET');
  });
  it('marks pending, empty and unavailable sizes, and a partial total', () => {
    const f = loadFixture('services');
    const v = buildServices({ snapshot: f.snapshot, config: f.config, now: f.now, coverage: new Set(), alerts: [] });
    const g = v.groups.find((x) => x.type === 'storage')!;
    expect(g.label).toBe('Cloud Storage (5 buckets · 412 GB, partial)');
    const size = (name: string) => g.items.find((i) => i.title.startsWith(name))!.details.find((d) => d.startsWith('Size:'));
    expect(size('fake-alpha-assets')).toBe('Size: 412 GB (as of 4h ago)');
    expect(size('fake-alpha-new')).toBe('Size: pending (new bucket)');
    expect(size('fake-beta-empty')).toBe('Size: 0 B, no objects');
    expect(size('fake-sandbox-scratch')).toBe('Size: unavailable');
  });
});
