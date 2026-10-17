#!/usr/bin/env node
// Entry point. `render` (default) always exits 0 and always prints a valid menu.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { cacheDir, emptySnapshot, loadSnapshot, saveSnapshot, withLock } from './cache.js';
import { ConfigError, defaultConfigPath, loadConfig, parseConfig } from './config.js';
import { createHttp, type FetchFn, type Http } from './http.js';
import type { Config, Snapshot, ViewModel } from './model/types.js';
import { buildView } from './model/view.js';
import { refresh, type Planner } from './refresh.js';
import { renderMenu } from './render/sections.js';
import './sources/all.js';
import { buildPlanner } from './sources/index.js';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..');

export const FORCE_REASONS = new Set(['MenuAction', 'FirstLaunch', 'WakeFromSleep']);

export interface CliDeps {
  env: NodeJS.ProcessEnv;
  fetch: FetchFn;
  now: () => Date;
  out: (s: string) => void;
  getToken?: () => Promise<string>;
  adcQuotaProject?: () => Promise<string | undefined>;
}

export interface Args {
  command: 'render' | 'refresh' | 'doctor';
  fixture?: string | undefined;
  config?: string | undefined;
  noCache: boolean;
  swiftbar: boolean;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { command: 'render', noCache: false, swiftbar: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    if (x === 'render' || x === 'refresh' || x === 'doctor') a.command = x;
    else if (x === '--fixture') a.fixture = argv[++i];
    else if (x === '--config') a.config = argv[++i];
    else if (x === '--no-cache') a.noCache = true;
    else if (x === '--swiftbar') a.swiftbar = true;
  }
  return a;
}

function paths() {
  return { node: process.execPath, cli: join(REPO_ROOT, 'dist', 'cli.js'), docs: join(REPO_ROOT, 'docs', 'billing-export-setup.md') };
}

function loadConfigSafe(path: string): { config: Config; issue?: { message: string; nextStep?: string } } {
  try {
    return { config: loadConfig(path) };
  } catch (err) {
    const message = err instanceof ConfigError ? err.message : String(err);
    return { config: parseConfig({}, path), issue: { message: `Config problem: ${message}`, nextStep: `edit ${path}` } };
  }
}

export interface Collected {
  snapshot: Snapshot;
  config: Config;
  configIssue?: { message: string; nextStep?: string } | undefined;
  quotaProject?: string | undefined;
}

export interface Context {
  config: Config;
  configIssue?: { message: string; nextStep?: string } | undefined;
  getToken: () => Promise<string>;
  authSource: () => Promise<string>;
  quotaProject?: string | undefined;
  http: Http;
  planner: Planner;
}

export async function createContext(args: Args, deps: CliDeps): Promise<Context> {
  const { config, issue } = loadConfigSafe(args.config ?? defaultConfigPath(deps.env));
  const auth = deps.getToken ? undefined : createAuth();
  const getToken = deps.getToken ?? auth!.getToken;
  let quotaProject = config.quotaProject;
  if (!quotaProject) quotaProject = await (deps.adcQuotaProject ?? auth!.adcQuotaProject)().catch(() => undefined);
  const http = createHttp({ fetch: deps.fetch, getToken, quotaProject });
  const planner = buildPlanner({ http, config, now: deps.now, jobProject: quotaProject });
  return { config, configIssue: issue, getToken, authSource: auth ? auth.source : async () => 'test', quotaProject, http, planner };
}

export async function collect(args: Args, deps: CliDeps, force: boolean): Promise<Collected> {
  const ctx = await createContext(args, deps);
  const dir = cacheDir(deps.env);
  const cached = args.noCache ? emptySnapshot() : loadSnapshot(dir);
  const run = () => refresh(cached, ctx.planner, { force, now: deps.now });
  const result = args.noCache ? await run() : await withLock(dir, async () => {
    const r = await run();
    saveSnapshot(dir, r.snapshot);
    return r;
  });
  // Another process holds the lock: render what is cached without fetching.
  return { snapshot: result?.snapshot ?? cached, config: ctx.config, configIssue: ctx.configIssue, quotaProject: ctx.quotaProject };
}

export function viewFor(c: Collected, now: Date): ViewModel {
  return buildView(c.snapshot, c.config, now, paths(), { setupIssues: c.configIssue ? [c.configIssue] : [], quotaProject: c.quotaProject });
}

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const args = parseArgs(argv);
  const now = deps.now();
  if (args.command === 'render' && args.fixture) {
    const file = join(REPO_ROOT, 'tests', 'fixtures', `${args.fixture}.json`);
    const fx = JSON.parse(readFileSync(file, 'utf8')) as { snapshot: Snapshot; config?: unknown; now?: string };
    const config = parseConfig(fx.config ?? {}, '~/.config/cloudbar/config.json');
    deps.out(renderMenu(buildView(fx.snapshot, config, fx.now ? new Date(fx.now) : now, paths())).join('\n'));
    return 0;
  }
  if (args.command === 'doctor') {
    const { runDoctorCommand } = await import('./doctor.js');
    return runDoctorCommand(await createContext(args, deps), { swiftbar: args.swiftbar, now: deps.now, out: deps.out, docsPath: paths().docs });
  }
  const force = args.command === 'refresh' || FORCE_REASONS.has(deps.env.SWIFTBAR_PLUGIN_REFRESH_REASON ?? '');
  try {
    const c = await collect(args, deps, force);
    if (args.command === 'render') deps.out(renderMenu(viewFor(c, deps.now())).join('\n'));
  } catch (err) {
    if (args.command === 'render') {
      const fallback = buildView(emptySnapshot(), parseConfig({}, defaultConfigPath(deps.env)), now, paths(), {
        setupIssues: [{ message: `CloudBar failed: ${(err as Error).message}` }],
      });
      deps.out(renderMenu(fallback).join('\n'));
    }
  }
  return 0;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2), {
    env: process.env,
    fetch: (url, init) => fetch(url, init),
    now: () => new Date(),
    out: (s) => process.stdout.write(s + '\n'),
  }).then((code) => process.exit(code));
}
