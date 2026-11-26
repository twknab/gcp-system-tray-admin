// Resource Manager v3 projects.search (R11) and Service Usage enabled APIs (R12).
import type { Http } from '../http.js';
import type { EnabledServices, Project } from '../model/types.js';

interface RawProject {
  projectId: string;
  displayName?: string;
  name: string; // projects/123456
  state?: string;
}

export async function listProjects(http: Http): Promise<Project[]> {
  const raw = await http.getAllPages<RawProject>('https://cloudresourcemanager.googleapis.com/v3/projects:search?query=state%3AACTIVE&pageSize=500', 'projects');
  return raw
    .filter((p) => !p.state || p.state === 'ACTIVE')
    .map((p) => ({ projectId: p.projectId, displayName: p.displayName || p.projectId, projectNumber: p.name.replace(/^projects\//, '') }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listEnabledServices(http: Http, projectId: string): Promise<EnabledServices> {
  const raw = await http.getAllPages<{ config?: { name?: string }; name: string }>(
    `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services?filter=state%3AENABLED&pageSize=200`,
    'services',
  );
  const names = raw.map((s) => s.config?.name ?? s.name.split('/').pop()!).sort();
  return { count: names.length, names };
}
