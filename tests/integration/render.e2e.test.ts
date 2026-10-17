import { describe, expect, it } from 'vitest';
import { main } from '../../src/cli.js';
import { assertInvariants } from '../render/invariants.js';
import { setup } from './setup.js';

describe('end to end: render through the CLI with every API mocked', () => {
  it('renders a complete menu from an empty cache, then serves from cache', async () => {
    const t = setup();
    const start = Date.now();
    expect(await main([], t.deps())).toBe(0);
    expect(Date.now() - start).toBeLessThan(2000);
    const lines = t.out[0]!.split('\n');
    assertInvariants(lines);
    expect(lines[0]).toMatch(/^\$24\.82 \|/);
    for (const section of ['Billing |', 'Cloud Run (4)', 'Cloud SQL (8)', 'Vertex AI (2) · us-central1', 'Cloud Storage (3 buckets', 'Alerts (3 open)', 'Projects (3)'])
      expect(lines.some((l) => l.startsWith(section)), section).toBe(true);
    expect(t.log.some((l) => l.url.includes('sqladmin'))).toBe(true);
    // coverage from real policy fixtures: run, sql and vertex are monitored in fake-alpha
    expect(lines.find((l) => l.startsWith('--main-db · Alpha'))).toContain('exclamationmark.triangle.fill'); // warning alert
    expect(lines.find((l) => l.startsWith('--gemma-chat · Alpha'))).toContain('checkmark.circle.fill');

    const before = t.log.length;
    const t0 = performance.now();
    await main([], t.deps());
    const elapsed = performance.now() - t0;
    expect(t.log.length).toBe(before); // fresh cache: zero requests
    expect(elapsed).toBeLessThan(300); // plan target; SC-002 fails above 1 s
    expect(t.out[1]).toBe(t.out[0]);
  });
  it('MenuAction refetches everything (Story 4 #4)', async () => {
    const t = setup();
    await main([], t.deps());
    const first = t.log.length;
    await main([], t.deps({ SWIFTBAR_PLUGIN_REFRESH_REASON: 'MenuAction' }));
    expect(t.log.length - first).toBe(first - 1); // same calls, minus the one-time BigQuery dry run
  });
  it('`refresh` prints nothing; render with no network still prints a valid menu', async () => {
    const t = setup();
    expect(await main(['refresh'], t.deps())).toBe(0);
    expect(t.out).toEqual([]);
    const offline: string[] = [];
    await main(['--no-cache'], { ...t.deps(), fetch: async () => { throw new TypeError('fetch failed'); }, out: (s) => offline.push(s) });
    assertInvariants(offline[0]!.split('\n'));
  });
});
