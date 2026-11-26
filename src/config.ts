import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Config, TtlConfig } from './model/types.js';

export const DEFAULT_TTL: TtlConfig = {
  alerts: 300,
  resources: 900,
  projects: 3600,
  services: 3600,
  costs: 14400,
  budgets: 14400,
  storageSize: 21600,
};

const BILLING_ID = /^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$/;
const EXPORT_TABLE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]\.[A-Za-z0-9_]+\.gcp_billing_export_v1_[0-9A-F_]+$/;
const REGION = /^[a-z]+-[a-z]+[0-9]$/;
const TTL_MIN: TtlConfig = { alerts: 60, resources: 60, projects: 300, services: 300, costs: 900, budgets: 900, storageSize: 900 };

export class ConfigError extends Error {}

export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLOUDBAR_CONFIG ?? join(homedir(), '.config', 'cloudbar', 'config.json');
}

/** Load the config file. A missing file means defaults; a malformed one is a ConfigError. */
export function loadConfig(path: string = defaultConfigPath()): Config {
  let raw: unknown = {};
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw new ConfigError(`Could not read ${path}: ${(err as Error).message}`);
  }
  return parseConfig(raw, path);
}

export function parseConfig(raw: unknown, path: string): Config {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ConfigError('Config must be a JSON object');
  const o = raw as Record<string, unknown>;
  const allowed = new Set(['billingExports', 'vertexRegions', 'runRegions', 'excludeProjects', 'quotaProject', 'maxBytesBilled', 'ttlOverrides', 'nodePath', '$schema']);
  for (const key of Object.keys(o)) if (!allowed.has(key)) throw new ConfigError(`Unknown config key "${key}"`);

  const billingExports: Record<string, string> = {};
  if (o.billingExports !== undefined) {
    if (typeof o.billingExports !== 'object' || o.billingExports === null) throw new ConfigError('billingExports must be an object');
    for (const [id, table] of Object.entries(o.billingExports as Record<string, unknown>)) {
      if (!BILLING_ID.test(id)) throw new ConfigError(`billingExports key "${id}" is not a billing account id (XXXXXX-XXXXXX-XXXXXX)`);
      if (typeof table !== 'string' || !EXPORT_TABLE.test(table))
        throw new ConfigError(`billingExports["${id}"] must be project.dataset.gcp_billing_export_v1_…`);
      billingExports[id] = table;
    }
  }

  const regions = (key: string, fallback: string[]): string[] => {
    const v = o[key];
    if (v === undefined) return fallback;
    if (!Array.isArray(v) || v.length === 0 || !v.every((r) => typeof r === 'string' && REGION.test(r)))
      throw new ConfigError(`${key} must be a non-empty list of regions like "us-central1"`);
    return v as string[];
  };

  const excludeProjects = o.excludeProjects ?? [];
  if (!Array.isArray(excludeProjects) || !excludeProjects.every((p) => typeof p === 'string'))
    throw new ConfigError('excludeProjects must be a list of project ids');

  const maxBytesBilled = o.maxBytesBilled ?? 1073741824;
  if (typeof maxBytesBilled !== 'number' || !Number.isInteger(maxBytesBilled) || maxBytesBilled < 10485760 || maxBytesBilled > 10737418240)
    throw new ConfigError('maxBytesBilled must be an integer between 10 MiB and 10 GiB');

  const ttl: TtlConfig = { ...DEFAULT_TTL };
  if (o.ttlOverrides !== undefined) {
    if (typeof o.ttlOverrides !== 'object' || o.ttlOverrides === null) throw new ConfigError('ttlOverrides must be an object');
    for (const [k, v] of Object.entries(o.ttlOverrides as Record<string, unknown>)) {
      if (!(k in DEFAULT_TTL)) throw new ConfigError(`Unknown ttlOverrides key "${k}"`);
      const key = k as keyof TtlConfig;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < TTL_MIN[key]) throw new ConfigError(`ttlOverrides.${k} must be an integer ≥ ${TTL_MIN[key]}`);
      ttl[key] = v;
    }
  }

  const str = (key: string): string | undefined => {
    const v = o[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || v.length === 0) throw new ConfigError(`${key} must be a string`);
    return v;
  };

  const config: Config = {
    billingExports,
    vertexRegions: regions('vertexRegions', ['us-central1']),
    runRegions: regions('runRegions', ['us-central1']),
    excludeProjects: excludeProjects as string[],
    maxBytesBilled,
    ttl,
    path,
  };
  const quotaProject = str('quotaProject');
  if (quotaProject) config.quotaProject = quotaProject;
  const nodePath = str('nodePath');
  if (nodePath) config.nodePath = nodePath;
  return config;
}
