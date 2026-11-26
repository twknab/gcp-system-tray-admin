// PURE: monitoring sources → coverage set, open alerts, and the Alerts section (FR-009, FR-010).
import { formatAge } from '../render/format.js';
import { alertStatus, coverageKey } from './status.js';
import type { Alert, Config, MonitoringPolicies, Project, ResourceType, Snapshot, SourceResult, Status, ViewAlerts } from './types.js';

const SEV_RANK: Record<Alert['severity'], number> = { critical: 3, error: 2, warning: 1, unspecified: 0 };

function dataOf<T>(r: SourceResult<T> | undefined): T | undefined {
  return r ? (r.ok ? r.data : r.lastGood?.data) : undefined;
}

export interface MonitoringModel {
  coverage: Set<string>;
  alerts: Alert[];
  alertStatuses: Status[];
  view: ViewAlerts | null;
}

export function buildMonitoring(snapshot: Snapshot, config: Config, now: Date): MonitoringModel {
  const projects = (dataOf(snapshot.sources.projects as SourceResult<Project[]> | undefined) ?? []).filter((p) => !config.excludeProjects.includes(p.projectId));
  const label = new Map(projects.map((p) => [p.projectId, p.displayName]));
  const coverage = new Set<string>();
  const alerts: Alert[] = [];
  let policyCount: number | null = null;
  let anyAlertsRead = false;
  let disabledCount = 0;
  let loadedCount = 0;
  const failures: string[] = [];

  for (const p of projects) {
    const pol = snapshot.sources[`alertPolicies:${p.projectId}`] as SourceResult<MonitoringPolicies> | undefined;
    const up = snapshot.sources[`uptime:${p.projectId}`] as SourceResult<{ coveredTypes: ResourceType[] }> | undefined;
    const al = snapshot.sources[`alerts:${p.projectId}`] as SourceResult<Alert[]> | undefined;
    const polData = dataOf(pol);
    if (polData) {
      policyCount = (policyCount ?? 0) + polData.policyCount;
      for (const t of polData.coveredTypes) coverage.add(coverageKey(p.projectId, t));
    }
    for (const t of dataOf(up)?.coveredTypes ?? []) coverage.add(coverageKey(p.projectId, t));
    const alData = dataOf(al);
    if (alData) {
      anyAlertsRead = true;
      alerts.push(...alData);
    }
    if (al) loadedCount++;
    if (al && !al.ok && al.kind === 'disabled') disabledCount++;
    if (al && !al.ok && al.kind !== 'disabled') failures.push(`${p.displayName}: ${al.reason}`);
  }

  if (projects.length === 0) return { coverage, alerts, alertStatuses: [], view: null };

  alerts.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.openedAt.localeCompare(b.openedAt));
  const view: ViewAlerts = {
    available: anyAlertsRead,
    policyCount,
    alerts: alerts.map((a) => ({
      title: `${a.policyName} · ${label.get(a.projectId) ?? a.projectId} · ${a.severity} · open ${formatAge(a.openedAt, now.toISOString()).replace(' ago', '')}`,
      status: alertStatus(a),
      url: a.consoleUrl,
    })),
  };
  if (loadedCount === 0) {
    view.available = false;
    view.reason = 'not loaded yet';
  } else if (disabledCount === projects.length) {
    view.available = false;
    view.reason = 'Cloud Monitoring is not enabled in any project';
  } else if (failures.length) {
    view.reason = anyAlertsRead ? `could not read alerts in ${failures.length} project${failures.length === 1 ? '' : 's'}` : failures[0]!;
  }
  return { coverage, alerts, alertStatuses: alerts.map(alertStatus), view };
}
