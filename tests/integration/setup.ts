import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliDeps } from '../../src/cli.js';
import { fakeFetch } from '../helpers.js';
import { CONFIG, allRoutes } from './routes.js';

export function setup(extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cloudbar-e2e-'));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify(CONFIG));
  const log: { method: string; url: string; body?: string }[] = [];
  const out: string[] = [];
  const deps = (env: Record<string, string> = {}): CliDeps => ({
    env: { SWIFTBAR_PLUGIN_CACHE_PATH: join(dir, 'cache'), CLOUDBAR_CONFIG: configPath, ...extraEnv, ...env },
    fetch: fakeFetch(allRoutes(), log),
    now: () => new Date('2026-10-17T12:00:00Z'),
    out: (s) => out.push(s),
    getToken: async () => 'tok',
    adcQuotaProject: async () => undefined,
  });
  return { dir, log, out, deps };
}

