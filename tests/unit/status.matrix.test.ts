import { describe, expect, it } from 'vitest';
import { overallStatus, resourceStatus } from '../../src/model/status.js';
import type { Alert, Resource, Status } from '../../src/model/types.js';
import { viewOf } from '../render/invariants.js';

const r = (type: Resource['type'], mapped: Resource['mapped'], name = 'svc'): Resource => ({ type, id: name, name, projectId: 'fake-p', location: 'l', reportedState: 's', mapped, consoleUrl: 'u' });
const alert = (severity: Alert['severity'], type: Alert['resourceType'], name?: string): Alert => ({ id: 'a', policyName: 'P', projectId: 'fake-p', severity, openedAt: '2026-10-17T11:00:00Z', ...(type ? { resourceType: type } : {}), ...(name ? { resourceName: name } : {}), consoleUrl: 'u' });
const covered = new Set(['fake-p:run', 'fake-p:storage']);
const S = (level: Status['level']): Status => ({ level });

describe('status rules (Story 3 #1–8, FR-009)', () => {
  it.each<[string, Resource, Set<string>, Alert[], Status['level'], string?]>([
    ['#1 ready + monitored + no alert → healthy', r('run', { kind: 'ready' }), covered, [], 'healthy'],
    ['#2 ready + not monitored → unknown', r('sql', { kind: 'ready' }), covered, [], 'unknown', 'not monitored'],
    ['#3 latest revision failed → degraded', r('run', { kind: 'degraded', reason: 'latest revision failed' }), covered, [], 'degraded'],
    ['#3 warning alert → degraded', r('run', { kind: 'ready' }), covered, [alert('warning', 'run')], 'degraded'],
    ['#4 failed state → down', r('sql', { kind: 'down', reason: 'instance failed' }), new Set(), [], 'down'],
    ['#4 critical alert → down', r('run', { kind: 'ready' }), covered, [alert('critical', 'run')], 'down'],
    ['error alert → down', r('run', { kind: 'ready' }), covered, [alert('error', 'run')], 'down'],
    ['worse of state and alert wins', r('run', { kind: 'degraded', reason: 'x' }), covered, [alert('critical', 'run')], 'down'],
    ['alert for another resource of the same type does not apply', r('run', { kind: 'ready' }, 'api'), covered, [alert('critical', 'run', 'other')], 'healthy'],
    ['alert for another type does not apply', r('run', { kind: 'ready' }), covered, [alert('critical', 'sql')], 'healthy'],
    ['#8 bucket, even if storage is monitored → unknown', r('storage', { kind: 'unknown', reason: 'no running state' }), covered, [], 'unknown', 'not monitored'],
    ['#8 bucket with warning alert → degraded', r('storage', { kind: 'unknown', reason: 'no running state' }), covered, [alert('warning', 'storage')], 'degraded'],
    ['stopped SQL stays unknown', r('sql', { kind: 'unknown', reason: 'stopped' }), new Set(['fake-p:sql']), [], 'unknown', 'stopped'],
  ])('%s', (_name, res, cov, alerts, level, reason) => {
    const s = resourceStatus(res, cov, alerts);
    expect(s.level).toBe(level);
    if (reason) expect(s.reason).toBe(reason);
  });
  it('#7 overall precedence', () => {
    const none = { overBudget: false };
    expect(overallStatus([S('unknown'), S('unknown')], none).level).toBe('unknown');
    expect(overallStatus([S('healthy'), S('unknown')], none).level).toBe('healthy');
    expect(overallStatus([S('healthy'), S('degraded'), S('unknown')], none).level).toBe('degraded');
    expect(overallStatus([S('degraded'), S('down')], none).level).toBe('down');
    expect(overallStatus([S('healthy')], { overBudget: true }).level).toBe('degraded');
    expect(overallStatus([S('down')], { overBudget: true }).level).toBe('down');
    expect(overallStatus([], none).level).toBe('unknown');
  });
  it('status-matrix fixture: healthy, unknown, degraded, down (spec Story 3 test)', () => {
    const v = viewOf('status-matrix');
    const run = v.groups.find((g) => g.type === 'run')!;
    const by = Object.fromEntries(run.items.map((i) => [i.title, i.status.level]));
    expect(by).toEqual({ 'checkout · Gamma': 'down', 'worker · Alpha': 'degraded', 'site · Beta': 'unknown', 'api · Alpha': 'healthy' });
    expect(v.overall.level).toBe('down');
    const storage = v.groups.find((g) => g.type === 'storage')!;
    expect(storage.items.every((i) => i.status.level !== 'healthy')).toBe(true);
    expect(storage.items.find((i) => i.title.startsWith('fake-gamma-data'))!.status.level).toBe('degraded');
  });
  it('healthy fixture is healthy overall even with unknown buckets', () => {
    expect(viewOf('healthy').overall.level).toBe('healthy');
    expect(viewOf('degraded').overall.level).toBe('degraded');
  });
});
