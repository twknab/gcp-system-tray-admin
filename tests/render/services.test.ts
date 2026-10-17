import { describe, expect, it } from 'vitest';
import { STATUS_STYLE } from '../../src/render/swiftbar.js';
import { render, viewOf } from './invariants.js';

function groupHeaderCounts(lines: string[]) {
  // invariant 2: header count == number of items, including overflow
  const headers = lines.map((l, i) => [l, i] as const).filter(([l]) => /^(Cloud Run|Cloud SQL|Vertex AI) \(\d+\)/.test(l) || /^Cloud Storage \(\d+ bucket/.test(l));
  for (const [l, i] of headers) {
    const n = Number(/\((\d+)/.exec(l)![1]);
    let items = 0;
    for (let j = i + 1; j < lines.length && lines[j]!.startsWith('--'); j++) {
      const x = lines[j]!;
      if (/^--[^-]/.test(x) && !x.startsWith('--Unavailable in')) {
        const more = /^--and (\d+) more/.exec(x);
        items += more ? Number(more[1]) : 1;
      }
    }
    expect(items, l).toBe(n);
  }
}

describe('service groups (Story 2)', () => {
  it.each(['services', 'services-overflow', 'denied'])('%s', (name) => {
    const lines = render(viewOf(name));
    expect(lines).toMatchSnapshot();
    groupHeaderCounts(lines);
    // invariant 4: no Cloud Storage line uses the healthy symbol
    const storageStart = lines.findIndex((l) => l.startsWith('Cloud Storage'));
    for (let j = storageStart; j < lines.length && lines[j] !== '---'; j++) expect(lines[j]).not.toContain(STATUS_STYLE.healthy.sfimage);
  });
  it('labels each item with its project, sorted worst first', () => {
    const lines = render(viewOf('services'));
    const run = lines.filter((l) => /^--[^-].* · (Alpha|Beta)/.test(l) && !l.includes('-db') && !l.includes('fake-'));
    expect(run[0]).toMatch(/^--worker · Alpha/);
  });
  it('caps a group at 25 with "and N more"', () => {
    const lines = render(viewOf('services-overflow'));
    expect(lines.some((l) => l.startsWith('--and 8 more | href=https://console.cloud.google.com/storage/browser'))).toBe(true);
    expect(lines.find((l) => l.startsWith('Cloud Storage'))).toMatch(/^Cloud Storage \(33 buckets · 442 GB, partial\)/);
  });
  it('shows "Unavailable in N projects" for denied or failed sources but not for disabled APIs', () => {
    const lines = render(viewOf('denied'));
    const sqlIdx = lines.findIndex((l) => l.startsWith('Cloud SQL'));
    expect(lines[sqlIdx]).toMatch(/^Cloud SQL \(0\)/);
    expect(lines.slice(sqlIdx).find((l) => l.startsWith('--Unavailable in'))).toMatch(/^--Unavailable in 1 project/);
    expect(lines.some((l) => l.includes('Alpha: permission denied: cloudsql.instances.list'))).toBe(true);
    expect(lines.some((l) => l.includes('Beta: showing data from 2h ago — network error'))).toBe(true);
    expect(lines.some((l) => l.includes('Cloud SQL Admin API not enabled'))).toBe(false);
  });
  it('omits a group when no project has that resource type', () => {
    const v = viewOf('services');
    expect(v.groups.map((g) => g.type)).toEqual(['run', 'sql', 'vertex', 'storage']);
  });
  it('lists projects with API counts and billing state', () => {
    const lines = render(viewOf('services'));
    expect(lines).toContain('Projects (3) | sfimage=folder');
    expect(lines.some((l) => l.startsWith('--Sandbox · 21 APIs · billing disabled'))).toBe(true);
  });
});
