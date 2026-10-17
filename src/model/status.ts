// PURE status rules. See spec User Story 3 and data-model.md.
import type { Alert, Resource, Status, StatusLevel } from './types.js';

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


const ALERT_LEVEL: Record<Alert['severity'], StatusLevel> = { critical: 'down', error: 'down', warning: 'degraded', unspecified: 'degraded' };

export function alertStatus(a: Alert): Status {
  return { level: ALERT_LEVEL[a.severity], reason: `alert: ${a.policyName}` };
}

/** Coverage key: monitoring for a resource type in a project (data-model.md MonitoringCoverage). */
export const coverageKey = (projectId: string, type: Resource['type']) => `${projectId}:${type}`;

/**
 * FR-009 / Story 3: healthy needs a ready state, monitoring of the resource's type in its project,
 * and no open alert. Storage is never healthy (Story 3 #8).
 */
export function resourceStatus(r: Resource, coverage: ReadonlySet<string>, alerts: readonly Alert[], billingDisabled = false): Status {
  if (billingDisabled) return { level: 'unknown', reason: 'billing disabled' };
  const matching = alerts.filter((a) => a.projectId === r.projectId && a.resourceType === r.type && (!a.resourceName || a.resourceName === r.name));
  const alert = matching.map(alertStatus).reduce<Status | undefined>((acc, s) => (acc ? worse(acc, s) : s), undefined);
  if (r.type === 'storage') return alert ?? { level: 'unknown', reason: 'not monitored' };
  let base: Status;
  switch (r.mapped.kind) {
    case 'down':
      base = { level: 'down', reason: r.mapped.reason };
      break;
    case 'degraded':
      base = { level: 'degraded', reason: r.mapped.reason };
      break;
    case 'unknown':
      base = { level: 'unknown', reason: r.mapped.reason };
      break;
    case 'ready':
      if (alert) return alert;
      return coverage.has(coverageKey(r.projectId, r.type)) ? { level: 'healthy' } : { level: 'unknown', reason: 'not monitored' };
  }
  return alert ? worse(base, alert) : base;
}
