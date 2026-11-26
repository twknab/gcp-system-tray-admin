// Cloud Billing v1 (research R8).
import type { Http } from '../http.js';
import type { BillingAccountInfo, ProjectBilling } from '../model/types.js';

const BASE = 'https://cloudbilling.googleapis.com/v1';

interface RawAccount {
  name: string; // billingAccounts/XXXXXX-XXXXXX-XXXXXX
  displayName?: string;
  open?: boolean;
  currencyCode?: string;
}

export async function listBillingAccounts(http: Http): Promise<BillingAccountInfo[]> {
  const raw = await http.getAllPages<RawAccount>(`${BASE}/billingAccounts?pageSize=100`, 'billingAccounts');
  return raw.map((a) => {
    const id = a.name.replace(/^billingAccounts\//, '');
    const acct: BillingAccountInfo = { id, displayName: a.displayName || id, open: a.open !== false };
    if (a.currencyCode) acct.currencyCode = a.currencyCode;
    return acct;
  });
}

export async function getProjectBillingInfo(http: Http, projectId: string): Promise<ProjectBilling> {
  const r = await http.getJson<{ billingEnabled?: boolean; billingAccountName?: string }>(`${BASE}/projects/${encodeURIComponent(projectId)}/billingInfo`);
  const out: ProjectBilling = { billingEnabled: r.billingEnabled === true };
  if (r.billingAccountName) out.billingAccountId = r.billingAccountName.replace(/^billingAccounts\//, '');
  return out;
}
