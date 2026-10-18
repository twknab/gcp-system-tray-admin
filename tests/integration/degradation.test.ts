import { describe, expect, it } from 'vitest';
import type { Snapshot, SourceResult } from '../../src/model/types.js';
import { buildView } from '../../src/model/view.js';
import { renderMenu } from '../../src/render/sections.js';
import { PATHS, assertInvariants, loadFixture } from '../render/invariants.js';

const f = loadFixture('healthy');
const SECTION_HEADS = ['Billing |', 'Cloud Run (', 'Cloud SQL (', 'Vertex AI (', 'Cloud Storage (', 'Alerts', 'Projects ('];

function renderWith(mutate: (s: Snapshot) => void): string[] {
  const snapshot: Snapshot = structuredClone(f.snapshot);
  mutate(snapshot);
  const lines = renderMenu(buildView(snapshot, f.config, f.now, PATHS));
  assertInvariants(lines);
  return lines;
}

/** Which section a source key feeds, so we can assert that every *other* section survives. */
function sectionOf(key: string): string | null {
  const family = key.split(':')[0]!;
  return ({ billingAccounts: 'Billing |', costs: 'Billing |', budgets: 'Billing |', run: 'Cloud Run (', sql: 'Cloud SQL (', vertex: 'Vertex AI (', storage: 'Cloud Storage (', storageSize: 'Cloud Storage (', alerts: 'Alerts', alertPolicies: 'Alerts', uptime: 'Alerts' } as Record<string, string>)[family] ?? null;
}

describe('one failing source never blanks the menu (SC-005, FR-014)', () => {
  const baseline = renderWith(() => {});
  const present = SECTION_HEADS.filter((h) => baseline.some((l) => l.startsWith(h)));
  const keys = Object.keys(f.snapshot.sources).filter((k) => f.snapshot.sources[k]!.ok && k !== 'projects');

  it.each(keys)('%s fails with no earlier data', (key) => {
    const lines = renderWith((s) => {
      s.sources[key] = { ok: false, kind: 'network', reason: 'network error: fetch failed', fetchedAt: s.updatedAt };
    });
    const own = sectionOf(key);
    for (const h of present) if (h !== own) expect(lines.some((l) => l.startsWith(h)), `${h} missing when ${key} fails`).toBe(true);
    if (/^(run|sql|vertex|storage):/.test(key)) expect(lines.some((l) => l.includes('network error: fetch failed'))).toBe(true);
  });

  it.each(keys)('%s fails but keeps its last good data, with its age', (key) => {
    const lines = renderWith((s) => {
      const prev = s.sources[key] as SourceResult<unknown> & { ok: true };
      s.sources[key] = { ok: false, kind: 'timeout', reason: 'no response within 10s', fetchedAt: s.updatedAt, lastGood: { data: prev.data, fetchedAt: '2026-10-17T09:00:00Z' } };
    });
    for (const h of present) expect(lines.some((l) => l.startsWith(h)), `${h} missing when ${key} has lastGood`).toBe(true);
    if (/^(run|sql|vertex|storage):/.test(key)) expect(lines.some((l) => l.includes('showing data from 3h ago'))).toBe(true);
  });

  it('projects failing leaves billing, alerts-free menu and shortcuts', () => {
    const lines = renderWith((s) => {
      s.sources.projects = { ok: false, kind: 'denied', reason: 'permission denied: resourcemanager.projects.search', fetchedAt: s.updatedAt };
    });
    expect(lines.some((l) => l.startsWith('Billing |'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Services unavailable — permission denied'))).toBe(true);
  });

  it('all-auth-fail: no amount, unknown status, setup issue names sign-in, shortcuts render', () => {
    const lines = renderWith((s) => {
      for (const k of Object.keys(s.sources)) s.sources[k] = { ok: false, kind: 'auth', reason: 'credentials are missing or expired', fetchedAt: s.updatedAt };
    });
    expect(lines[0]).toMatch(/^\| sfimage=icloud /);
    expect(lines.some((l) => /^⚠ 1 setup issue/.test(l))).toBe(true);
    expect(lines.some((l) => l.includes('gcloud auth application-default login'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Refresh |'))).toBe(true);
  });
});
