// US3 sources: alert policies, uptime checks and open alerts per project.
import type { EnabledServices, Project } from '../model/types.js';
import type { SourceDef } from '../refresh.js';
import { dataOf, type PlanPart } from './index.js';
import { listAlertPolicies, listOpenAlerts, listUptimeCoverage } from './monitoring.js';
import { skipIfDisabled, visibleProjects } from './servicesPlan.js';

export const monitoringPlan: PlanPart = (snapshot, ctx) => {
  const defs: SourceDef[] = [];
  for (const p of visibleProjects(dataOf<Project[]>(snapshot, 'projects'), ctx)) {
    const id = p.projectId;
    const svc = dataOf<EnabledServices>(snapshot, `services:${id}`);
    const m = (def: SourceDef) => skipIfDisabled(def, svc, 'monitoring.googleapis.com', 'Cloud Monitoring API');
    defs.push(
      m({ key: `alerts:${id}`, ttl: ctx.config.ttl.alerts, run: () => listOpenAlerts(ctx.http, id) }),
      m({ key: `alertPolicies:${id}`, ttl: ctx.config.ttl.projects, run: () => listAlertPolicies(ctx.http, id) }),
      m({ key: `uptime:${id}`, ttl: ctx.config.ttl.projects, run: () => listUptimeCoverage(ctx.http, id) }),
    );
  }
  return defs;
};
