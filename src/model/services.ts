// PURE: resource sources → service groups and the Projects reference list (FR-006–FR-008, FR-023).
import { formatAge, formatBytes } from '../render/format.js';
import { resourceStatus } from './status.js';
import type {
  Alert, BucketSizes, Config, EnabledServices, Project, ProjectBilling, Resource, ResourceList, ResourceType, Snapshot, SourceResult, Status, ViewGroup, ViewProject,
} from './types.js';
import { statusLabelText, worseRank } from './statusText.js';

export const GROUP_CAP = 25;
const SIZE_STALE_MS = 48 * 3600_000;
const PENDING_MS = 48 * 3600_000;

const GROUPS: { type: ResourceType; label: string; url: string }[] = [
  { type: 'run', label: 'Cloud Run', url: 'https://console.cloud.google.com/run' },
  { type: 'sql', label: 'Cloud SQL', url: 'https://console.cloud.google.com/sql/instances' },
  { type: 'vertex', label: 'Vertex AI', url: 'https://console.cloud.google.com/vertex-ai/online-prediction/endpoints' },
  { type: 'storage', label: 'Cloud Storage', url: 'https://console.cloud.google.com/storage/browser' },
];

export interface ServicesInput {
  snapshot: Snapshot;
  config: Config;
  now: Date;
  coverage: ReadonlySet<string>;
  alerts: readonly Alert[];
}

export interface ServicesView {
  groups: ViewGroup[];
  projects: ViewProject[] | null;
  projectsUnavailable?: string;
  statuses: Status[];
}

function dataAndNote<T>(r: SourceResult<T> | undefined, now: Date): { data?: T; note?: string } {
  if (!r) return {};
  if (r.ok) return { data: r.data };
  if (r.lastGood) return { data: r.lastGood.data, note: `showing data from ${formatAge(r.lastGood.fetchedAt, now.toISOString())} — ${r.reason}` };
  return { note: r.reason };
}

export function buildServices(inp: ServicesInput): ServicesView {
  const { snapshot, config, now } = inp;
  const pr = snapshot.sources.projects as SourceResult<Project[]> | undefined;
  const { data: allProjects, note: projectsNote } = dataAndNote(pr, now);
  if (!allProjects) {
    const out: ServicesView = { groups: [], projects: null, statuses: [] };
    if (pr) out.projectsUnavailable = projectsNote ?? 'unavailable';
    return out;
  }
  const excluded = new Set(config.excludeProjects);
  const projects = allProjects.filter((p) => !excluded.has(p.projectId));
  const label = new Map(projects.map((p) => [p.projectId, p.displayName]));
  const billing = new Map<string, ProjectBilling | undefined>(projects.map((p) => [p.projectId, dataAndNote(snapshot.sources[`billingInfo:${p.projectId}`] as SourceResult<ProjectBilling> | undefined, now).data]));

  const statuses: Status[] = [];
  const groups: ViewGroup[] = [];
  for (const g of GROUPS) {
    const resources: Resource[] = [];
    const unavailable: ViewGroup['unavailable'] = [];
    for (const p of projects) {
      const keys = g.type === 'vertex' ? config.vertexRegions.map((r) => `vertex:${p.projectId}:${r}`) : [`${g.type}:${p.projectId}`];
      for (const key of keys) {
        const r = snapshot.sources[key] as SourceResult<ResourceList> | undefined;
        // A disabled API means the project has none of these (it cannot without the API): not "unavailable".
        if (r && !r.ok && r.kind === 'disabled' && !r.lastGood) continue;
        const { data, note } = dataAndNote(r, now);
        if (note) unavailable.push({ projectLabel: p.displayName, reason: note });
        if (data) {
          resources.push(...data.resources);
          for (const u of data.unreachable ?? []) unavailable.push({ projectLabel: p.displayName, reason: `could not reach ${u}` });
        }
      }
    }
    if (g.type === 'storage') attachSizes(resources, snapshot, now);

    const items = resources.map((r) => {
      const b = billing.get(r.projectId);
      const status = resourceStatus(r, inp.coverage, inp.alerts, b ? !b.billingEnabled : false);
      return { r, status };
    });
    statuses.push(...items.filter((i) => i.r.type !== 'storage').map((i) => i.status));
    if (items.length === 0 && unavailable.length === 0) continue;

    items.sort((a, b) => worseRank(b.status) - worseRank(a.status) || (label.get(a.r.projectId) ?? '').localeCompare(label.get(b.r.projectId) ?? '') || a.r.name.localeCompare(b.r.name));
    const shown = items.slice(0, GROUP_CAP);
    const group: ViewGroup = {
      type: g.type,
      label: groupLabel(g.type, g.label, items.map((i) => i.r), config),
      count: items.length,
      status: items.length ? items.map((i) => i.status).reduce((a, b) => (worseRank(b) > worseRank(a) ? b : a)) : { level: 'unknown', reason: 'unavailable' },
      items: shown.map(({ r, status }) => ({
        title: `${r.name} · ${label.get(r.projectId) ?? r.projectId}`,
        status,
        details: details(r, status, label.get(r.projectId) ?? r.projectId, now),
        consoleUrl: r.consoleUrl,
      })),
      unavailable,
    };
    if (items.length > GROUP_CAP) group.overflow = { count: items.length - GROUP_CAP, url: g.url };
    groups.push(group);
  }

  const out: ServicesView = {
    groups,
    statuses,
    projects: projects.map((p) => {
      const svc = dataAndNote(snapshot.sources[`services:${p.projectId}`] as SourceResult<EnabledServices> | undefined, now).data;
      const b = billing.get(p.projectId);
      const vp: ViewProject = { label: p.displayName, apiCount: svc ? svc.count : null, consoleUrl: `https://console.cloud.google.com/home/dashboard?project=${encodeURIComponent(p.projectId)}` };
      if (b && !b.billingEnabled) vp.note = 'billing disabled';
      return vp;
    }),
  };
  if (projectsNote) out.projectsUnavailable = projectsNote;
  return out;
}

function attachSizes(buckets: Resource[], snapshot: Snapshot, now: Date) {
  for (const b of buckets) {
    const r = snapshot.sources[`storageSize:${b.projectId}`] as SourceResult<BucketSizes> | undefined;
    const sizes = r?.ok ? r.data : r?.lastGood?.data;
    if (!sizes) {
      b.sizeBytes = 'unavailable';
      continue;
    }
    const v = sizes.sizes[b.name];
    if (v !== undefined) b.sizeBytes = v;
    else {
      // No series: a new bucket not sampled yet, or one with no objects (research R7).
      b.sizeBytes = b.createdAt && now.getTime() - Date.parse(b.createdAt) < PENDING_MS ? 'pending' : 0;
      continue;
    }
    if (sizes.asOf) b.sizeAsOf = sizes.asOf;
  }
}

function groupLabel(type: ResourceType, label: string, resources: Resource[], config: Config): string {
  if (type === 'vertex') return `${label} (${resources.length}) · ${config.vertexRegions.join(', ')}`;
  if (type !== 'storage') return `${label} (${resources.length})`;
  const known = resources.filter((r) => typeof r.sizeBytes === 'number');
  const total = known.reduce((s, r) => s + (r.sizeBytes as number), 0);
  const partial = known.length < resources.length;
  const n = `${resources.length} bucket${resources.length === 1 ? '' : 's'}`;
  if (resources.length === 0) return `${label} (${n})`;
  return `${label} (${n} · ${known.length ? formatBytes(total) : 'size unavailable'}${partial && known.length ? ', partial' : ''})`;
}

function details(r: Resource, status: Status, project: string, now: Date): string[] {
  const d = [`State: ${r.reportedState}`, `Location: ${r.location}`, `Project: ${project}`];
  if (r.type === 'storage') {
    const s = r.sizeBytes;
    const age = r.sizeAsOf ? ` (as of ${formatAge(r.sizeAsOf, now.toISOString())}${now.getTime() - Date.parse(r.sizeAsOf) > SIZE_STALE_MS ? ', stale' : ''})` : '';
    d.push(s === 'pending' ? 'Size: pending (new bucket)' : s === 'unavailable' || s === undefined ? 'Size: unavailable' : s === 0 && !r.sizeAsOf ? 'Size: 0 B, no objects' : `Size: ${formatBytes(s)}${age}`);
  }
  d.push(`Status: ${statusLabelText(status)}`);
  return d;
}
