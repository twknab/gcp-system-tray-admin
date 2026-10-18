// Vertex AI endpoints, one regional call per configured region (research R6).
import type { Http } from '../http.js';
import type { ResourceList } from '../model/types.js';

interface RawEndpoint {
  name: string; // projects/123/locations/us-central1/endpoints/456
  displayName?: string;
  deployedModels?: unknown[];
}

export async function listVertexEndpoints(http: Http, projectId: string, region: string): Promise<ResourceList> {
  const items = await http.getAllPages<RawEndpoint>(
    `https://${region}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${region}/endpoints`,
    'endpoints',
  );
  return {
    resources: items.map((e) => {
      const id = e.name.split('/').pop()!;
      const models = e.deployedModels?.length ?? 0;
      return {
        type: 'vertex' as const,
        id: `${projectId}/${region}/${id}`,
        name: e.displayName || id,
        projectId,
        location: region,
        reportedState: `${models} deployed model${models === 1 ? '' : 's'}`,
        mapped: models > 0 ? { kind: 'ready' as const } : { kind: 'unknown' as const, reason: 'idle, no models deployed' },
        consoleUrl: `https://console.cloud.google.com/vertex-ai/online-prediction/locations/${region}/endpoints/${id}?project=${encodeURIComponent(projectId)}`,
      };
    }),
  };
}
