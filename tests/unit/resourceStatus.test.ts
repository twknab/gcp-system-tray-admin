import { describe, expect, it } from 'vitest';
import { resourceStatus } from '../../src/model/status.js';
import type { Resource } from '../../src/model/types.js';

const r = (type: Resource['type'], mapped: Resource['mapped']): Resource => ({ type, id: 'x', name: 'n', projectId: 'fake-p', location: 'l', reportedState: 's', mapped, consoleUrl: 'u' });

describe('resource status before monitoring (US2)', () => {
  const none = new Set<string>();
  it('ready but unmonitored is unknown, never healthy (SC-004)', () => {
    expect(resourceStatus(r('run', { kind: 'ready' }), none, [])).toEqual({ level: 'unknown', reason: 'not monitored' });
  });
  it('passes degraded and down through', () => {
    expect(resourceStatus(r('run', { kind: 'degraded', reason: 'x' }), none, []).level).toBe('degraded');
    expect(resourceStatus(r('sql', { kind: 'down', reason: 'y' }), none, []).level).toBe('down');
  });
  it('storage is always unknown', () => {
    expect(resourceStatus(r('storage', { kind: 'unknown', reason: 'no running state' }), new Set(['fake-p:storage']), [])).toEqual({ level: 'unknown', reason: 'not monitored' });
  });
  it('billing disabled makes everything unknown', () => {
    expect(resourceStatus(r('run', { kind: 'ready' }), new Set(['fake-p:run']), [], true)).toEqual({ level: 'unknown', reason: 'billing disabled' });
  });
});
