// PURE: source failures in a snapshot → plain-English setup findings (FR-012).
import type { BillingAccountInfo, Config, SetupFinding, Snapshot } from './types.js';

export const SIGN_IN_STEP = 'gcloud auth application-default login';
export const QUOTA_STEP = 'gcloud auth application-default set-quota-project <a-project-you-own>';

/** Which API each source family depends on, and whether it is checked per project. */
export const SOURCE_API: Record<string, { api: string; label: string; perProject: boolean }> = {
  billingAccounts: { api: 'cloudbilling.googleapis.com', label: 'Cloud Billing API', perProject: false },
  billingInfo: { api: 'cloudbilling.googleapis.com', label: 'Cloud Billing API', perProject: true },
  costs: { api: 'bigquery.googleapis.com', label: 'BigQuery API', perProject: false },
  budgets: { api: 'billingbudgets.googleapis.com', label: 'Cloud Billing Budget API', perProject: false },
  projects: { api: 'cloudresourcemanager.googleapis.com', label: 'Cloud Resource Manager API', perProject: false },
  services: { api: 'serviceusage.googleapis.com', label: 'Service Usage API', perProject: true },
  run: { api: 'run.googleapis.com', label: 'Cloud Run Admin API', perProject: true },
  sql: { api: 'sqladmin.googleapis.com', label: 'Cloud SQL Admin API', perProject: true },
  vertex: { api: 'aiplatform.googleapis.com', label: 'Vertex AI API', perProject: true },
  storage: { api: 'storage.googleapis.com', label: 'Cloud Storage API', perProject: true },
  storageSize: { api: 'monitoring.googleapis.com', label: 'Cloud Monitoring API', perProject: true },
  alerts: { api: 'monitoring.googleapis.com', label: 'Cloud Monitoring API', perProject: true },
  alertPolicies: { api: 'monitoring.googleapis.com', label: 'Cloud Monitoring API', perProject: true },
  uptime: { api: 'monitoring.googleapis.com', label: 'Cloud Monitoring API', perProject: true },
};

export const apiLibraryUrl = (api: string, project?: string) =>
  `https://console.cloud.google.com/apis/library/${api}${project ? `?project=${encodeURIComponent(project)}` : ''}`;

export function findingsFromSnapshot(snapshot: Snapshot, config: Config, quotaProject?: string): SetupFinding[] {
  const out: SetupFinding[] = [];
  const seen = new Set<string>();
  const push = (f: SetupFinding) => {
    const k = `${f.area}|${f.message}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(f);
    }
  };
  const accountsResult = snapshot.sources.billingAccounts;
  const accounts = (accountsResult?.ok ? accountsResult.data : accountsResult?.lastGood?.data) as BillingAccountInfo[] | undefined;
  const accountName = (id: string) => accounts?.find((a) => a.id === id)?.displayName ?? id;

  for (const [key, r] of Object.entries(snapshot.sources)) {
    if (r.ok) continue;
    const [family = key, scope] = key.split(':');
    const meta = SOURCE_API[family];
    if (r.kind === 'auth') {
      if (/quota project/.test(r.reason))
        push({ area: 'quotaProject', level: 'fail', message: 'The quota project cannot be used', nextStep: `grant yourself serviceusage.services.use on it, or run: ${QUOTA_STEP}` });
      else push({ area: 'credentials', level: 'fail', message: 'Credentials are missing or expired', nextStep: `run: ${SIGN_IN_STEP}` });
      continue;
    }
    if (family === 'costs' && r.reason === 'export not configured') {
      push({ area: 'billingExport', level: 'warn', message: `Billing export not configured for “${accountName(scope ?? '')}”`, nextStep: 'follow docs/billing-export-setup.md, then add the table to billingExports' });
      continue;
    }
    if (r.kind === 'disabled' && meta) {
      if (meta.perProject && scope) {
        // A project that doesn't use a service is normal: informational, not a failure.
        push({ area: 'api', level: 'warn', projectId: scope, message: `${meta.label} not enabled in ${scope}, so that section stays unavailable`, link: apiLibraryUrl(meta.api, scope) });
      } else {
        push({ area: 'api', level: 'fail', message: `${meta.label} is not enabled in your quota project${quotaProject ? ` (${quotaProject})` : ''}`, nextStep: 'enable it yourself in the console — CloudBar never enables APIs', link: apiLibraryUrl(meta.api, quotaProject) });
      }
      continue;
    }
    if (r.kind === 'denied') {
      const level = family === 'budgets' ? 'warn' : meta?.perProject ? 'warn' : 'fail';
      const area = family === 'budgets' ? 'budgets' : 'permissions';
      const where = scope ? ` (${family === 'costs' || family === 'budgets' ? accountName(scope) : scope})` : '';
      push({ area, level, message: `Permission denied reading ${meta?.label ?? family}${where}`, nextStep: 'see README → Roles for the viewer role this needs' });
      continue;
    }
    if (family === 'costs' && r.kind === 'quota') {
      push({ area: 'billingExport', level: 'fail', message: `Spend query for “${accountName(scope ?? '')}” was not run: ${r.reason}`, nextStep: 'check the export table name, or raise maxBytesBilled in the config' });
    }
  }
  for (const id of Object.keys(config.billingExports)) {
    if (accounts && !accounts.some((a) => a.id === id))
      push({ area: 'billingExport', level: 'warn', message: `billingExports lists ${id}, which your sign-in cannot see`, nextStep: 'check the account id in the config' });
  }
  return out;
}
