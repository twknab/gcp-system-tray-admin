// Cloud Run: v1 global list across regions, v2 per-region fallback (research R4).
import { HttpError, type Http } from '../http.js';
import type { MappedState, Resource, ResourceList } from '../model/types.js';

interface V1Service {
  metadata: { name: string; labels?: Record<string, string> };
  status?: {
    url?: string;
    latestReadyRevisionName?: string;
    latestCreatedRevisionName?: string;
    conditions?: { type: string; status: 'True' | 'False' | 'Unknown'; reason?: string; message?: string }[];
  };
}

interface V2Service {
  name: string; // projects/p/locations/r/services/s
  uri?: string;
  reconciling?: boolean;
  latestReadyRevision?: string;
  latestCreatedRevision?: string;
  terminalCondition?: { state?: string; message?: string; reason?: string };
}

const short = (rev?: string) => rev?.split('/').pop();

/** The R4 mapping, shared by both API versions. */
export function mapRunState(ready: 'True' | 'False' | 'Unknown' | undefined, latestReady: string | undefined, latestCreated: string | undefined, message?: string): MappedState {
  if (ready === 'True') return latestReady && latestReady !== latestCreated ? { kind: 'unknown', reason: 'deploying' } : { kind: 'ready' };
  if (ready === 'False') {
    if (latestReady && latestReady !== latestCreated) return { kind: 'degraded', reason: 'latest revision failed, previous still serving' };
    return { kind: 'down', reason: message ? `not serving: ${message}` : 'not serving' };
  }
  return { kind: 'unknown', reason: 'deploying' };
}

const consoleUrl = (projectId: string, region: string, name: string) =>
  `https://console.cloud.google.com/run/detail/${region}/${name}/metrics?project=${encodeURIComponent(projectId)}`;

export function fromV1(projectId: string, s: V1Service): Resource {
  const region = s.metadata.labels?.['cloud.googleapis.com/location'] ?? 'unknown';
  const ready = s.status?.conditions?.find((c) => c.type === 'Ready');
  const mapped = mapRunState(ready?.status, s.status?.latestReadyRevisionName, s.status?.latestCreatedRevisionName, ready?.message);
  const rev = s.status?.latestReadyRevisionName;
  return {
    type: 'run', id: `${projectId}/${region}/${s.metadata.name}`, name: s.metadata.name, projectId, location: region,
    reportedState: `Ready=${ready?.status ?? '?'}${rev ? ` · ${rev}` : ''}`, mapped, consoleUrl: consoleUrl(projectId, region, s.metadata.name),
  };
}

export function fromV2(projectId: string, s: V2Service): Resource {
  const [, , , region = 'unknown', , name = s.name] = s.name.split('/');
  const state = s.terminalCondition?.state;
  const ready = s.reconciling ? 'Unknown' : state === 'CONDITION_SUCCEEDED' ? 'True' : state === 'CONDITION_FAILED' ? 'False' : 'Unknown';
  const mapped = mapRunState(ready, short(s.latestReadyRevision), short(s.latestCreatedRevision), s.terminalCondition?.message);
  return {
    type: 'run', id: `${projectId}/${region}/${name}`, name, projectId, location: region,
    reportedState: `${state ?? 'unknown'}${s.latestReadyRevision ? ` · ${short(s.latestReadyRevision)}` : ''}`, mapped, consoleUrl: consoleUrl(projectId, region, name),
  };
}

export async function listRunServices(http: Http, projectId: string, fallbackRegions: string[]): Promise<ResourceList> {
  try {
    const res = await http.getJson<{ items?: V1Service[]; unreachable?: string[] }>(
      `https://run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${encodeURIComponent(projectId)}/services`,
    );
    const out: ResourceList = { resources: (res.items ?? []).map((s) => fromV1(projectId, s)) };
    if (res.unreachable?.length) out.unreachable = res.unreachable;
    return out;
  } catch (err) {
    // Disabled, denied and auth failures are real answers; anything else tries the v2 per-region path.
    if (err instanceof HttpError && ['disabled', 'denied', 'auth'].includes(err.kind)) throw err;
    const resources: Resource[] = [];
    for (const region of fallbackRegions) {
      const items = await http.getAllPages<V2Service>(`https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/${region}/services`, 'services');
      resources.push(...items.map((s) => fromV2(projectId, s)));
    }
    return { resources, unreachable: [`regions outside ${fallbackRegions.join(', ')} (global list failed)`] };
  }
}
