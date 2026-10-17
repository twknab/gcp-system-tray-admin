// Cloud Monitoring v3: alert policies + uptime checks → coverage (R2, R3); open alerts (R1).
import type { Http } from '../http.js';
import type { Alert, AlertSeverity, MonitoringPolicies, ResourceType } from '../model/types.js';

const BASE = 'https://monitoring.googleapis.com/v3/projects';

/** R3: monitored resource type → CloudBar resource type. */
export const RESOURCE_TYPES: Record<string, ResourceType> = {
  cloud_run_revision: 'run',
  cloud_run_job: 'run',
  cloudsql_database: 'sql',
  cloudsql_instance_database: 'sql',
  'aiplatform.googleapis.com/Endpoint': 'vertex',
  gcs_bucket: 'storage',
};
const PROM_PREFIX: Record<string, ResourceType> = {
  run_googleapis_com: 'run',
  cloudsql_googleapis_com: 'sql',
  aiplatform_googleapis_com: 'vertex',
  storage_googleapis_com: 'storage',
};

interface RawCondition {
  conditionThreshold?: { filter?: string };
  conditionAbsent?: { filter?: string };
  conditionMonitoringQueryLanguage?: { query?: string };
  conditionPrometheusQueryLanguage?: { query?: string };
  conditionMatchedLog?: { filter?: string };
}

interface RawPolicy {
  name: string;
  displayName?: string;
  enabled?: boolean;
  conditions?: RawCondition[];
}

/** Which CloudBar resource types a condition watches. Unmappable → none (the honest default). */
export function conditionTypes(c: RawCondition): ResourceType[] {
  const found = new Set<ResourceType>();
  const add = (raw: string | undefined) => {
    const t = raw ? RESOURCE_TYPES[raw] : undefined;
    if (t) found.add(t);
  };
  for (const filter of [c.conditionThreshold?.filter, c.conditionAbsent?.filter, c.conditionMatchedLog?.filter]) {
    for (const m of filter?.matchAll(/resource\.type\s*=\s*["']([^"']+)["']/g) ?? []) add(m[1]);
  }
  for (const m of c.conditionMonitoringQueryLanguage?.query?.matchAll(/fetch\s+([a-zA-Z0-9_.\/]+)/gi) ?? []) add(m[1]!.split('::')[0]);
  const prom = c.conditionPrometheusQueryLanguage?.query;
  if (prom) {
    for (const m of prom.matchAll(/monitored_resource\s*=\s*"([^"]+)"/g)) add(m[1]);
    for (const [prefix, t] of Object.entries(PROM_PREFIX)) if (prom.includes(`${prefix}:`)) found.add(t);
  }
  return [...found];
}

export async function listAlertPolicies(http: Http, projectId: string): Promise<MonitoringPolicies> {
  const policies = await http.getAllPages<RawPolicy>(`${BASE}/${encodeURIComponent(projectId)}/alertPolicies?pageSize=1000`, 'alertPolicies');
  const enabled = policies.filter((p) => p.enabled !== false);
  const types = new Set<ResourceType>();
  for (const p of enabled) for (const c of p.conditions ?? []) for (const t of conditionTypes(c)) types.add(t);
  return { policyCount: enabled.length, coveredTypes: [...types].sort() };
}

interface RawUptime {
  monitoredResource?: { type?: string };
  resourceGroup?: { resourceType?: string };
  isInternal?: boolean;
}

export async function listUptimeCoverage(http: Http, projectId: string): Promise<{ coveredTypes: ResourceType[]; count: number }> {
  const checks = await http.getAllPages<RawUptime>(`${BASE}/${encodeURIComponent(projectId)}/uptimeCheckConfigs?pageSize=1000`, 'uptimeCheckConfigs');
  const types = new Set<ResourceType>();
  for (const c of checks) {
    const t = c.monitoredResource?.type ? RESOURCE_TYPES[c.monitoredResource.type] : undefined;
    if (t) types.add(t);
  }
  return { coveredTypes: [...types].sort(), count: checks.length };
}

interface RawAlert {
  name: string; // projects/p/alerts/ID
  state?: string;
  openTime?: string;
  resource?: { type?: string; labels?: Record<string, string> };
  policy?: { displayName?: string; severity?: string; name?: string };
}

const SEVERITY: Record<string, AlertSeverity> = { CRITICAL: 'critical', ERROR: 'error', WARNING: 'warning' };

function resourceNameOf(type: ResourceType | undefined, labels: Record<string, string> = {}): string | undefined {
  switch (type) {
    case 'run':
      return labels.service_name ?? labels.job_name;
    case 'sql':
      return labels.database_id?.split(':').pop();
    case 'storage':
      return labels.bucket_name;
    case 'vertex':
      return labels.endpoint_id;
    default:
      return undefined;
  }
}

export async function listOpenAlerts(http: Http, projectId: string): Promise<Alert[]> {
  const filter = encodeURIComponent('state="OPEN"');
  const raw = await http.getAllPages<RawAlert>(`${BASE}/${encodeURIComponent(projectId)}/alerts?filter=${filter}&pageSize=1000`, 'alerts');
  return raw
    .filter((a) => !a.state || a.state === 'OPEN')
    .map((a) => {
      const id = a.name.split('/').pop()!;
      const resourceType = a.resource?.type ? RESOURCE_TYPES[a.resource.type] : undefined;
      const alert: Alert = {
        id,
        policyName: a.policy?.displayName ?? 'Alert',
        projectId,
        severity: SEVERITY[a.policy?.severity ?? ''] ?? 'unspecified',
        openedAt: a.openTime ?? new Date(0).toISOString(),
        consoleUrl: `https://console.cloud.google.com/monitoring/alerting/alerts/${id}?project=${encodeURIComponent(projectId)}`,
      };
      if (resourceType) alert.resourceType = resourceType;
      const rn = resourceNameOf(resourceType, a.resource?.labels);
      if (rn) alert.resourceName = rn;
      return alert;
    });
}
