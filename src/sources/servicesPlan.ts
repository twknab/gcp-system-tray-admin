// US2 sources: projects, enabled APIs, billing info, and resources per project.
import type { EnabledServices, Project } from '../model/types.js';
import type { SourceDef } from '../refresh.js';
import { getProjectBillingInfo } from './billingAccounts.js';
import { dataOf, type PlanPart, type SourceContext } from './index.js';
import { listEnabledServices, listProjects } from './projects.js';
import { listRunServices } from './run.js';
import { listSqlInstances } from './sql.js';
import { bucketSizes, listBuckets } from './storage.js';
import { listVertexEndpoints } from './vertex.js';

export function visibleProjects(projects: Project[] | undefined, ctx: Pick<SourceContext, 'config'>): Project[] {
  const excluded = new Set(ctx.config.excludeProjects);
  return (projects ?? []).filter((p) => !excluded.has(p.projectId));
}

/** Skip a source without a request when we know its API is off (FR-016: never enable; just don't ask). */
export function skipIfDisabled(def: SourceDef, services: EnabledServices | undefined, api: string, label: string): SourceDef {
  if (services && !services.names.includes(api)) return { ...def, skip: { kind: 'disabled', reason: `${label} not enabled` } };
  return def;
}

export const servicesPlan: PlanPart = (snapshot, ctx) => {
  const { http, config } = ctx;
  const defs: SourceDef[] = [{ key: 'projects', ttl: config.ttl.projects, run: () => listProjects(http) }];
  for (const p of visibleProjects(dataOf<Project[]>(snapshot, 'projects'), ctx)) {
    const id = p.projectId;
    const svc = dataOf<EnabledServices>(snapshot, `services:${id}`);
    const r = config.ttl.resources;
    defs.push(
      { key: `services:${id}`, ttl: config.ttl.services, run: () => listEnabledServices(http, id) },
      { key: `billingInfo:${id}`, ttl: config.ttl.projects, run: () => getProjectBillingInfo(http, id) },
      skipIfDisabled({ key: `run:${id}`, ttl: r, run: () => listRunServices(http, id, config.runRegions) }, svc, 'run.googleapis.com', 'Cloud Run Admin API'),
      skipIfDisabled({ key: `sql:${id}`, ttl: r, run: () => listSqlInstances(http, id) }, svc, 'sqladmin.googleapis.com', 'Cloud SQL Admin API'),
      skipIfDisabled({ key: `storage:${id}`, ttl: r, run: () => listBuckets(http, id) }, svc, 'storage.googleapis.com', 'Cloud Storage API'),
      skipIfDisabled({ key: `storageSize:${id}`, ttl: config.ttl.storageSize, run: () => bucketSizes(http, id, ctx.now()) }, svc, 'monitoring.googleapis.com', 'Cloud Monitoring API'),
      ...config.vertexRegions.map((region) =>
        skipIfDisabled({ key: `vertex:${id}:${region}`, ttl: r, run: () => listVertexEndpoints(http, id, region) }, svc, 'aiplatform.googleapis.com', 'Vertex AI API'),
      ),
    );
  }
  return defs;
};
