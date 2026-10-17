// Refreshes only the sources that are due, in dependency waves, within a time budget.
import { needsRefresh } from './cache.js';
import { toFailure } from './http.js';
import type { Failure, Snapshot, SourceResult } from './model/types.js';

export interface SourceDef {
  key: string;
  ttl: number;
  /** if set, the source is recorded as failed without making a request (e.g. API disabled) */
  skip?: Failure;
  run(): Promise<unknown>;
}

/** Given what is known so far, list the sources that should exist. Called once per wave. */
export type Planner = (snapshot: Snapshot) => SourceDef[];

export interface RefreshOptions {
  force?: boolean;
  now?: () => Date;
  budgetMs?: number;
  concurrency?: number;
  maxWaves?: number;
}

function failed(prev: SourceResult<unknown> | undefined, f: Failure, at: string): SourceResult<unknown> {
  const r: SourceResult<unknown> = { ok: false, kind: f.kind, reason: f.reason, fetchedAt: at };
  const lastGood = prev?.ok ? { data: prev.data, fetchedAt: prev.fetchedAt } : prev && !prev.ok ? prev.lastGood : undefined;
  if (lastGood) r.lastGood = lastGood;
  return r;
}

export async function refresh(snapshot: Snapshot, plan: Planner, opts: RefreshOptions = {}): Promise<{ snapshot: Snapshot; ran: string[] }> {
  const now = opts.now ?? (() => new Date());
  const deadline = Date.now() + (opts.budgetMs ?? 25_000);
  const concurrency = opts.concurrency ?? 8;
  const attempted = new Set<string>();
  const sources = { ...snapshot.sources };
  let current: Snapshot = { ...snapshot, sources };

  for (let wave = 0; wave < (opts.maxWaves ?? 4); wave++) {
    const due = plan(current).filter((d) => !attempted.has(d.key) && (opts.force || needsRefresh(sources[d.key], d.ttl, now())));
    if (due.length === 0) break;
    due.forEach((d) => attempted.add(d.key));

    const queue = [...due];
    const worker = async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        if (Date.now() > deadline) return; // out of budget: keep the previous value
        const prev = sources[d.key];
        if (d.skip) {
          sources[d.key] = failed(prev, d.skip, now().toISOString());
          continue;
        }
        const remaining = deadline - Date.now();
        try {
          const data = await Promise.race([
            d.run(),
            new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('budget'), { name: 'BudgetError' })), remaining).unref()),
          ]);
          sources[d.key] = { ok: true, data, fetchedAt: now().toISOString() };
        } catch (err) {
          if ((err as Error).name === 'BudgetError') continue; // leave previous value; shown as stale
          sources[d.key] = failed(prev, toFailure(err), now().toISOString());
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, worker));
    current = { ...current, sources };
  }

  // Drop sources the plan no longer mentions (e.g. an excluded or deleted project).
  const live = new Set(plan(current).map((d) => d.key));
  for (const key of Object.keys(sources)) if (!live.has(key)) delete sources[key];

  return { snapshot: { ...current, sources, updatedAt: now().toISOString() }, ran: [...attempted] };
}
