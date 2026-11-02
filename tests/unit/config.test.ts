import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, defaultConfigPath, loadConfig, parseConfig } from '../../src/config.js';

const dir = mkdtempSync(join(tmpdir(), 'cloudbar-config-'));

describe('config', () => {
  it('applies defaults when the file is missing', () => {
    const c = loadConfig(join(dir, 'missing.json'));
    expect(c.vertexRegions).toEqual(['us-central1']);
    expect(c.runRegions).toEqual(['us-central1']);
    expect(c.maxBytesBilled).toBe(1073741824);
    expect(c.ttl.alerts).toBe(300);
    expect(c.billingExports).toEqual({});
  });
  it('loads a valid file', () => {
    const p = join(dir, 'ok.json');
    writeFileSync(p, JSON.stringify({
      billingExports: { '000000-000000-000000': 'example-project.billing.gcp_billing_export_v1_000000_000000_000000' },
      vertexRegions: ['europe-west4'],
      excludeProjects: ['example-sandbox'],
      quotaProject: 'example-project',
      ttlOverrides: { alerts: 120 },
    }));
    const c = loadConfig(p);
    expect(c.vertexRegions).toEqual(['europe-west4']);
    expect(c.quotaProject).toBe('example-project');
    expect(c.ttl.alerts).toBe(120);
    expect(c.ttl.costs).toBe(14400);
    expect(c.path).toBe(p);
  });
  it('rejects invalid regions and billing ids', () => {
    expect(() => parseConfig({ vertexRegions: ['Central'] }, 'x')).toThrow(ConfigError);
    expect(() => parseConfig({ vertexRegions: [] }, 'x')).toThrow(ConfigError);
    expect(() => parseConfig({ billingExports: { 'not-an-id': 'a.b.c' } }, 'x')).toThrow(ConfigError);
    expect(() => parseConfig({ billingExports: { '000000-000000-000000': 'bad' } }, 'x')).toThrow(ConfigError);
    expect(() => parseConfig({ surprise: 1 }, 'x')).toThrow(ConfigError);
    expect(() => parseConfig({ ttlOverrides: { alerts: 5 } }, 'x')).toThrow(ConfigError);
  });
  it('reports a malformed file', () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, '{ nope');
    expect(() => loadConfig(p)).toThrow(ConfigError);
  });
  it('honours CLOUDBAR_CONFIG', () => {
    expect(defaultConfigPath({ CLOUDBAR_CONFIG: '/tmp/x.json' })).toBe('/tmp/x.json');
    expect(defaultConfigPath({})).toMatch(/\.config\/cloudbar\/config\.json$/);
  });
});
