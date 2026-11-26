// Composes every source into one Planner. Each story adds its sources here.
import type { Http } from '../http.js';
import type { Config, Snapshot } from '../model/types.js';
import type { Planner, SourceDef } from '../refresh.js';

export interface SourceContext {
  http: Http;
  config: Config;
  now: () => Date;
  jobProject?: string | undefined;
}

export type PlanPart = (snapshot: Snapshot, ctx: SourceContext) => SourceDef[];

export const PLAN_PARTS: PlanPart[] = [];

/** Registration happens in sources/all.ts to avoid import cycles. */

export function buildPlanner(ctx: SourceContext, parts: PlanPart[] = PLAN_PARTS): Planner {
  return (snapshot) => parts.flatMap((part) => part(snapshot, ctx));
}

/** Typed read of a source's data (current or lastGood). */
export function dataOf<T>(snapshot: Snapshot, key: string): T | undefined {
  const r = snapshot.sources[key];
  if (!r) return undefined;
  return (r.ok ? r.data : r.lastGood?.data) as T | undefined;
}
