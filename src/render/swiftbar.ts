// PURE: ViewModel → SwiftBar lines. See contracts/swiftbar-output.md.
import type { Status, StatusLevel, ViewModel } from '../model/types.js';
import { escapeText, formatAge, truncate } from './format.js';

export const STATUS_STYLE: Record<StatusLevel, { sfimage: string; sfcolor: string; title: string }> = {
  healthy: { sfimage: 'checkmark.circle.fill', sfcolor: '#248A3D,#30D158', title: 'checkmark.icloud.fill' },
  degraded: { sfimage: 'exclamationmark.triangle.fill', sfcolor: '#B25000,#FF9F0A', title: 'exclamationmark.icloud.fill' },
  down: { sfimage: 'xmark.octagon.fill', sfcolor: '#D70015,#FF453A', title: 'xmark.icloud.fill' },
  unknown: { sfimage: 'questionmark.circle', sfcolor: '#6E6E73,#98989D', title: 'icloud' },
};
const MUTED = '#6E6E73,#98989D';

type Params = Record<string, string | number | boolean | undefined>;

function quote(v: string): string {
  return /[\s"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

/** One SwiftBar line. Text is escaped and truncated; full text goes in the tooltip. */
export function ln(text: string, params: Params = {}, depth = 0): string {
  const t = truncate(text);
  const p: Params = { ...params };
  if (t.truncated && p.tooltip === undefined) p.tooltip = escapeText(text);
  const ps = Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${quote(String(v))}`)
    .join(' ');
  return `${'--'.repeat(depth)}${t.text}${ps ? `${t.text ? ' ' : ''}| ${ps}` : ''}`;
}

export function statusParams(s: Status): Params {
  const st = STATUS_STYLE[s.level];
  return { sfimage: st.sfimage, sfcolor: st.sfcolor };
}

/** Text label so status never depends on colour alone (FR-020). */
export function statusLabel(s: Status): string {
  if (s.level === 'healthy') return 'healthy';
  return s.reason ? `${s.level}: ${s.reason}` : s.level;
}

export function renderTitle(v: ViewModel): string {
  const st = STATUS_STYLE[v.overall.level];
  return ln(v.titleAmount ?? '', { sfimage: st.title, sfcolor: st.sfcolor, tooltip: `CloudBar — ${statusLabel(v.overall)}` });
}

export type SectionRenderer = (v: ViewModel) => string[];

export function renderShortcuts(v: ViewModel): string[] {
  const out: string[] = [];
  if (v.setupIssues.length > 0) {
    out.push(ln(`⚠ ${v.setupIssues.length} setup issue${v.setupIssues.length === 1 ? '' : 's'}`, { sfimage: 'exclamationmark.triangle', sfcolor: STATUS_STYLE.degraded.sfcolor }));
    for (const i of v.setupIssues) out.push(ln(i.nextStep ? `${i.message} — ${i.nextStep}` : i.message, {}, 1));
  }
  const updated = v.updatedAt ? `Updated ${formatAge(v.updatedAt, v.now)}` : 'Not updated yet';
  out.push(ln(v.offline && v.updatedAt ? `${updated} · offline` : updated, { color: MUTED, size: 11 }));
  out.push(ln('Refresh', { sfimage: 'arrow.clockwise', bash: v.paths.node, param0: v.paths.cli, param1: 'refresh', terminal: false, refresh: true }));
  out.push(ln('Run setup check…', { sfimage: 'stethoscope', bash: v.paths.node, param0: v.paths.cli, param1: 'doctor', terminal: true }));
  out.push(ln('Settings…', { sfimage: 'gearshape', bash: '/usr/bin/open', param0: '-t', param1: v.paths.config, terminal: false }));
  out.push(ln('Open Cloud Console', { sfimage: 'globe', href: 'https://console.cloud.google.com/' }));
  return out;
}

/** Sections are rendered in contract order; later stories register theirs here. */
export const SECTIONS: SectionRenderer[] = [];

export function renderMenu(v: ViewModel): string[] {
  const out = [renderTitle(v), '---'];
  for (const section of SECTIONS) {
    const lines = section(v);
    if (lines.length) out.push(...lines, '---');
  }
  out.push(...renderShortcuts(v));
  return out;
}
