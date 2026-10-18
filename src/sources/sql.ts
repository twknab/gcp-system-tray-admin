// Cloud SQL Admin v1 (research R5). There is no STOPPED state: RUNNABLE + NEVER means stopped.
import type { Http } from '../http.js';
import type { MappedState, ResourceList } from '../model/types.js';

interface RawInstance {
  name: string;
  state?: string;
  region?: string;
  databaseVersion?: string;
  settings?: { activationPolicy?: string };
}

export function mapSqlState(state: string | undefined, activation: string | undefined): MappedState {
  switch (state) {
    case 'RUNNABLE':
      return activation === 'NEVER' ? { kind: 'unknown', reason: 'stopped' } : { kind: 'ready' };
    case 'MAINTENANCE':
      return { kind: 'degraded', reason: 'in maintenance' };
    case 'REPAIRING':
      return { kind: 'degraded', reason: 'repairing' };
    case 'FAILED':
      return { kind: 'down', reason: 'instance failed' };
    case 'SUSPENDED':
      return { kind: 'down', reason: 'suspended' };
    case 'PENDING_CREATE':
      return { kind: 'unknown', reason: 'provisioning' };
    case 'PENDING_DELETE':
      return { kind: 'unknown', reason: 'deleting' };
    default:
      return { kind: 'unknown', reason: `state ${state ?? 'unknown'}` };
  }
}

export async function listSqlInstances(http: Http, projectId: string): Promise<ResourceList> {
  const items = await http.getAllPages<RawInstance>(`https://sqladmin.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/instances`, 'items');
  return {
    resources: items.map((i) => ({
      type: 'sql' as const,
      id: `${projectId}/${i.region ?? 'unknown'}/${i.name}`,
      name: i.name,
      projectId,
      location: i.region ?? 'unknown',
      reportedState: `${i.state ?? 'unknown'}${i.settings?.activationPolicy ? ` · ${i.settings.activationPolicy}` : ''}${i.databaseVersion ? ` · ${i.databaseVersion}` : ''}`,
      mapped: mapSqlState(i.state, i.settings?.activationPolicy),
      consoleUrl: `https://console.cloud.google.com/sql/instances/${i.name}/overview?project=${encodeURIComponent(projectId)}`,
    })),
  };
}
