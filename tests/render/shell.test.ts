import { describe, expect, it } from 'vitest';
import { emptySnapshot } from '../../src/cache.js';
import { parseConfig } from '../../src/config.js';
import { buildView } from '../../src/model/view.js';
import { STATUS_STYLE, ln, statusLabel } from '../../src/render/swiftbar.js';
import { PATHS, render } from './invariants.js';

const config = parseConfig({}, '/Users/me/.config/cloudbar/config.json');
const now = new Date('2026-10-17T12:00:00Z');

describe('minimal menu (no cache, no network)', () => {
  it('renders title, unknown status and shortcuts', () => {
    const lines = render(buildView(emptySnapshot(), config, now, PATHS));
    expect(lines).toMatchSnapshot();
    expect(lines[0]).toContain('sfimage=icloud ');
    expect(lines).toContain('Not updated yet | color=#6E6E73,#98989D size=11');
  });
  it('shows setup issues directly above Updated', () => {
    const v = buildView(emptySnapshot(), config, now, PATHS, { setupIssues: [{ message: 'Credentials expired', nextStep: 'run: gcloud auth application-default login' }] });
    const lines = render(v);
    expect(lines.some((l) => l.startsWith('⚠ 1 setup issue |'))).toBe(true);
  });
  it('uses four distinct symbols and text labels for status (invariant 7, FR-020)', () => {
    const images = new Set(Object.values(STATUS_STYLE).map((s) => s.sfimage));
    const titles = new Set(Object.values(STATUS_STYLE).map((s) => s.title));
    expect(images.size).toBe(4);
    expect(titles.size).toBe(4);
    expect(statusLabel({ level: 'unknown', reason: 'not monitored' })).toBe('unknown: not monitored');
    expect(statusLabel({ level: 'down' })).toBe('down');
  });
  it('quotes parameter values with spaces and adds a tooltip when truncating', () => {
    expect(ln('x', { param1: '/Users/me/Application Support/c.json' })).toBe('x | param1="/Users/me/Application Support/c.json"');
    const long = ln('a'.repeat(70));
    expect(long).toMatch(/…\s\| tooltip=a{70}$/);
  });
});
