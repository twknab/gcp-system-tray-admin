// PURE status rules. See spec User Story 3 and data-model.md.
import type { Status, StatusLevel } from './types.js';

/** Worst-first ranking for group headers: uncertainty shows. */
const GROUP_RANK: Record<StatusLevel, number> = { down: 3, degraded: 2, unknown: 1, healthy: 0 };

export function worse(a: Status, b: Status): Status {
  return GROUP_RANK[b.level] > GROUP_RANK[a.level] ? b : a;
}

export function groupStatus(items: Status[]): Status {
  if (items.length === 0) return { level: 'unknown', reason: 'nothing to show' };
  return items.reduce(worse);
}

/**
 * Overall status (Story 3 #7): down > degraded > healthy-if-any > unknown.
 * Unknown items never pull it down, and never make it healthy on their own.
 */
export function overallStatus(items: Status[], billing: { overBudget: boolean }): Status {
  const down = items.find((s) => s.level === 'down');
  if (down) return { level: 'down', ...(down.reason ? { reason: down.reason } : {}) };
  const degraded = items.find((s) => s.level === 'degraded');
  if (degraded) return { level: 'degraded', ...(degraded.reason ? { reason: degraded.reason } : {}) };
  if (billing.overBudget) return { level: 'degraded', reason: 'over budget' };
  if (items.some((s) => s.level === 'healthy')) return { level: 'healthy' };
  return { level: 'unknown', reason: items.length ? 'nothing is monitored' : 'no services checked yet' };
}
