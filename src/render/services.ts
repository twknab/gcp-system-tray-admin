// Service groups and the Projects reference list (Story 2). PURE.
import type { ViewModel } from '../model/types.js';
import { ln, statusParams } from './swiftbar.js';

const MUTED = '#6E6E73,#98989D';

export function renderServices(v: ViewModel): string[] {
  const out: string[] = [];
  if (v.projectsUnavailable && v.groups.length === 0) {
    out.push(ln(`Services unavailable — ${v.projectsUnavailable}`, { sfimage: 'questionmark.circle', sfcolor: MUTED }));
    return out;
  }
  for (const g of v.groups) {
    out.push(ln(g.label, statusParams(g.status)));
    for (const item of g.items) {
      out.push(ln(item.title, { ...statusParams(item.status), ...(item.tooltip ? { tooltip: item.tooltip } : {}) }, 1));
      for (const d of item.details) out.push(ln(d, {}, 2, 80));
      out.push(ln('Open in Console', { sfimage: 'arrow.up.right.square', href: item.consoleUrl }, 2));
    }
    if (g.overflow) out.push(ln(`and ${g.overflow.count} more`, { href: g.overflow.url }, 1));
    if (g.unavailable.length) {
      const n = new Set(g.unavailable.map((u) => u.projectLabel)).size;
      out.push(ln(`Unavailable in ${n} project${n === 1 ? '' : 's'}`, { sfimage: 'questionmark.circle', sfcolor: MUTED }, 1));
      for (const u of g.unavailable) out.push(ln(`${u.projectLabel}: ${u.reason}`, {}, 2, 100));
    }
  }
  return out;
}

export function renderProjects(v: ViewModel): string[] {
  if (!v.projects) return [];
  const out = [ln(`Projects (${v.projects.length})`, { sfimage: 'folder' })];
  if (v.projectsUnavailable) out.push(ln(v.projectsUnavailable, { color: MUTED }, 1, 100));
  for (const p of v.projects) {
    const apis = p.apiCount === null ? 'APIs unknown' : `${p.apiCount} API${p.apiCount === 1 ? '' : 's'}`;
    out.push(ln(`${p.label} · ${apis}${p.note ? ` · ${p.note}` : ''}`, { href: p.consoleUrl }, 1));
  }
  return out;
}
