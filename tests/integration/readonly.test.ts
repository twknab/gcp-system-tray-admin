import { describe, expect, it } from 'vitest';
import { main } from '../../src/cli.js';
import { setup } from './setup.js';

describe('read-only proof (SC-006, Principle I)', () => {
  it('every request is a GET or a capped BigQuery query', async () => {
    const t = setup();
    await main([], t.deps({ SWIFTBAR_PLUGIN_REFRESH_REASON: 'MenuAction' }));
    await main(['doctor'], t.deps());
    expect(t.log.length).toBeGreaterThan(30);
    for (const r of t.log) {
      if (r.method === 'GET') {
        expect(r.url).not.toMatch(/:(enable|disable|batchEnable)\b/);
        continue;
      }
      expect(r.method).toBe('POST');
      expect(r.url).toMatch(/^https:\/\/bigquery\.googleapis\.com\/bigquery\/v2\/projects\/[^/]+\/queries$/);
      const body = JSON.parse(r.body!);
      expect(body.maximumBytesBilled).toBe('1073741824');
      expect(body.query).toMatch(/^SELECT /);
      expect(body.useLegacySql).toBe(false);
    }
  });
});
