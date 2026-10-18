import { describe, expect, it } from 'vitest';
import { render, viewOf } from './invariants.js';

describe('Billing section', () => {
  it.each(['billing', 'billing-partial', 'billing-multicurrency', 'no-export', 'no-budget', 'over-budget', 'stale-costs'])('%s', (name) => {
    expect(render(viewOf(name))).toMatchSnapshot();
  });
  it('omits the amount when no costs are readable (FR-002)', () => {
    const [title] = render(viewOf('no-export'));
    expect(title).toMatch(/^\| sfimage=/);
  });
  it('marks a partial total with ~ and names the coverage', () => {
    const lines = render(viewOf('billing-partial'));
    expect(lines[0]).toMatch(/^~\$24\.82 \|/);
    expect(lines.some((l) => l.includes('(partial 2 of 3 accounts)'))).toBe(true);
  });
  it('links "No budget set" to the console Budgets page', () => {
    expect(render(viewOf('no-budget'))).toContain('No budget set | href=https://console.cloud.google.com/billing/budgets');
  });
  it('degrades overall status when over budget', () => {
    expect(viewOf('over-budget').overall.level).toBe('degraded');
    expect(render(viewOf('over-budget'))[0]).toContain('exclamationmark.icloud.fill');
  });
  it('labels stale costs without changing overall status', () => {
    const v = viewOf('stale-costs');
    expect(v.overall.level).toBe('unknown');
    expect(render(v).some((l) => /Cost data as of 1d ago · stale/.test(l))).toBe(true);
  });
  it('opens the local setup guide, with the online guide as an alternate', () => {
    const lines = render(viewOf('no-export'));
    expect(lines.some((l) => l.startsWith('Costs unavailable — export not set up |') && l.includes('bash=/usr/bin/open param0=/Users/me/cloudbar/docs/billing-export-setup.md'))).toBe(true);
    expect(lines.some((l) => l.includes('alternate=true') && l.includes('href=https://github.com/'))).toBe(true);
  });
});
