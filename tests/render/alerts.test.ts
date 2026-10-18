import { describe, expect, it } from 'vitest';
import { render, viewOf } from './invariants.js';

describe('Alerts section (Story 3 #5–6)', () => {
  it.each(['status-matrix', 'alerts-open', 'alerts-none', 'healthy', 'degraded'])('%s', (name) => {
    expect(render(viewOf(name))).toMatchSnapshot();
  });
  it('lists open alerts worst first with project, severity, age and link', () => {
    const lines = render(viewOf('alerts-open'));
    const i = lines.indexOf('Alerts (3 open) | sfimage=bell');
    expect(i).toBeGreaterThan(-1);
    expect(lines[i + 1]).toMatch(/^Checkout 5xx rate · Gamma · critical · open 30m \| sfimage=xmark\.octagon\.fill .* href=https:\/\/console\.cloud\.google\.com\/monitoring\/alerting\/alerts\/a1\?project=fake-gamma$/);
    expect(lines[i + 2]).toMatch(/^Bucket egress spike · Gamma · warning · open 1d/);
    expect(lines[i + 3]).toMatch(/^API latency high · Alpha · warning · open 3h/);
  });
  it('says "No open alerts" with the policy count', () => {
    expect(render(viewOf('alerts-none'))).toContain('No open alerts · 7 policies');
  });
  it('shows green only where monitoring proves it', () => {
    const lines = render(viewOf('healthy'));
    expect(lines[0]).toContain('checkmark.icloud.fill');
    const sql = lines.find((l) => l.startsWith('--main-db'))!;
    expect(sql).toContain('questionmark.circle');
  });
});
