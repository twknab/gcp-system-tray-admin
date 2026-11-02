import { existsSync, mkdtempSync, writeFileSync, utimesSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptySnapshot, isStale, loadSnapshot, needsRefresh, saveSnapshot, withLock } from '../../src/cache.js';
import { refresh } from '../../src/refresh.js';
import type { Snapshot, SourceResult } from '../../src/model/types.js';
import type { SourceDef } from '../../src/refresh.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'cloudbar-cache-'));
const now = new Date('2026-10-17T12:00:00Z');
const ok = (ageS: number): SourceResult<unknown> => ({ ok: true, data: 1, fetchedAt: new Date(now.getTime() - ageS * 1000).toISOString() });

describe('cache', () => {
  it('computes staleness per TTL', () => {
    expect(needsRefresh(undefined, 300, now)).toBe(true);
    expect(needsRefresh(ok(100), 300, now)).toBe(false);
    expect(needsRefresh(ok(400), 300, now)).toBe(true);
    expect(isStale(ok(400), 300, now)).toBe(true);
    expect(isStale(ok(100), 300, now)).toBe(false);
  });
  it('treats a failure as stale by its lastGood age, and retries it within 5 minutes', () => {
    const f: SourceResult<unknown> = { ok: false, kind: 'network', reason: 'x', fetchedAt: new Date(now.getTime() - 400_000).toISOString(), lastGood: { data: 1, fetchedAt: new Date(now.getTime() - 20_000_000).toISOString() } };
    expect(isStale(f, 14400, now)).toBe(true);
    expect(needsRefresh(f, 14400, now)).toBe(true);
  });
  it('round-trips and writes atomically', () => {
    const dir = tmp();
    const s = { ...emptySnapshot(), updatedAt: now.toISOString(), sources: { a: ok(1) } };
    saveSnapshot(dir, s);
    expect(loadSnapshot(dir)).toEqual(s);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
  it('survives a torn write and discards other schema versions', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'snapshot.json'), '{"schemaVersion":1,"sour');
    expect(loadSnapshot(dir)).toEqual(emptySnapshot());
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify({ schemaVersion: 99, sources: {} }));
    expect(loadSnapshot(dir)).toEqual(emptySnapshot());
  });
  it('lock blocks a second refresher and expires after 60s', async () => {
    const dir = tmp();
    let inner: unknown = 'not-run';
    const outer = await withLock(dir, async () => {
      inner = await withLock(dir, async () => 'second');
      return 'first';
    });
    expect(outer).toBe('first');
    expect(inner).toBeUndefined();
    expect(existsSync(join(dir, 'refresh.lock'))).toBe(false);

    writeFileSync(join(dir, 'refresh.lock'), '123');
    const old = (Date.now() - 120_000) / 1000;
    utimesSync(join(dir, 'refresh.lock'), old, old);
    expect(await withLock(dir, async () => 'took-over')).toBe('took-over');
  });
});

describe('refresh', () => {
  const fixedNow = () => now;
  it('runs only due sources, keeps lastGood on failure, and plans in waves', async () => {
    const snap: Snapshot = { ...emptySnapshot(), sources: { fresh: ok(10), old: ok(10_000) } };
    const calls: string[] = [];
    const plan = (s: Snapshot) => {
      const defs: SourceDef[] = [
        { key: 'fresh', ttl: 300, run: async () => { calls.push('fresh'); return 2; } },
        { key: 'old', ttl: 300, run: async () => { calls.push('old'); throw new Error('boom'); } },
        { key: 'parent', ttl: 300, run: async () => { calls.push('parent'); return ['c1']; } },
      ];
      const parent = s.sources.parent;
      if (parent?.ok) for (const c of parent.data as string[]) defs.push({ key: `child:${c}`, ttl: 300, run: async () => { calls.push(c); return c; } });
      return defs;
    };
    const { snapshot } = await refresh(snap, plan, { now: fixedNow });
    expect(calls.sort()).toEqual(['c1', 'old', 'parent']);
    const old = snapshot.sources.old!;
    expect(old.ok).toBe(false);
    expect(!old.ok && old.lastGood?.data).toBe(1);
    expect(snapshot.sources['child:c1']).toMatchObject({ ok: true, data: 'c1' });
  });
  it('force refetches everything and drops unplanned sources', async () => {
    const snap: Snapshot = { ...emptySnapshot(), sources: { a: ok(1), gone: ok(1) } };
    const { snapshot, ran } = await refresh(snap, () => [{ key: 'a', ttl: 300, run: async () => 9 }], { force: true, now: fixedNow });
    expect(ran).toEqual(['a']);
    expect(snapshot.sources.a).toMatchObject({ data: 9 });
    expect(snapshot.sources.gone).toBeUndefined();
  });
  it('records skipped sources without calling them', async () => {
    let called = false;
    const { snapshot } = await refresh(emptySnapshot(), () => [{ key: 's', ttl: 300, skip: { kind: 'disabled', reason: 'x not enabled' }, run: async () => { called = true; } }], { now: fixedNow });
    expect(called).toBe(false);
    expect(snapshot.sources.s).toMatchObject({ ok: false, kind: 'disabled' });
  });
  it('leaves the previous value when the budget runs out', async () => {
    const snap: Snapshot = { ...emptySnapshot(), sources: { slow: ok(10_000) } };
    const { snapshot } = await refresh(snap, () => [{ key: 'slow', ttl: 300, run: () => new Promise((r) => setTimeout(() => r(2), 500)) }], { budgetMs: 50, now: fixedNow });
    expect(snapshot.sources.slow).toMatchObject({ ok: true, data: 1 });
  });
});
