// Alerts section (Story 3 #5–6). PURE.
import type { ViewModel } from '../model/types.js';
import { ln, statusParams } from './swiftbar.js';

const MUTED = '#6E6E73,#98989D';

export function renderAlerts(v: ViewModel): string[] {
  const a = v.alerts;
  if (!a) return [];
  const policies = a.policyCount === null ? '' : ` · ${a.policyCount} polic${a.policyCount === 1 ? 'y' : 'ies'}`;
  const out = [ln(a.alerts.length ? `Alerts (${a.alerts.length} open)` : 'Alerts', { sfimage: 'bell' })];
  if (!a.available) {
    out.push(ln(`Alerts unavailable — ${a.reason ?? 'unknown reason'}${policies}`, { sfimage: 'questionmark.circle', sfcolor: MUTED }));
    return out;
  }
  if (a.alerts.length === 0) out.push(ln(`No open alerts${policies}`));
  for (const x of a.alerts) out.push(ln(x.title, { ...statusParams(x.status), href: x.url }, 0, 80));
  if (a.reason) out.push(ln(`Partial — ${a.reason}`, { color: MUTED, size: 11 }));
  return out;
}
