// Local snapshot cache: per-source TTLs, atomic writes, single-refresher lock (FR-013).
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Snapshot, SourceResult } from './model/types.js';

export const SCHEMA_VERSION = 1;
const LOCK_STALE_MS = 60_000;
/** failed sources are retried sooner than their normal TTL */
const FAILURE_RETRY_S = 300;

export function cacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.SWIFTBAR_PLUGIN_CACHE_PATH ?? join(homedir(), 'Library', 'Caches', 'cloudbar');
}

export function emptySnapshot(): Snapshot {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: '', sources: {} };
}

export function loadSnapshot(dir: string): Snapshot {
  try {
    const s = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')) as Snapshot;
    if (s.schemaVersion !== SCHEMA_VERSION || typeof s.sources !== 'object') return emptySnapshot();
    return s;
  } catch {
    return emptySnapshot();
  }
}

export function saveSnapshot(dir: string, snapshot: Snapshot): void {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `snapshot.json.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(snapshot));
  renameSync(tmp, join(dir, 'snapshot.json'));
}

/** Age of the data being shown: for a failure, the age of its lastGood value. */
export function dataFetchedAt(r: SourceResult<unknown> | undefined): string | undefined {
  if (!r) return undefined;
  return r.ok ? r.fetchedAt : r.lastGood?.fetchedAt;
}

/** Whether a source is due for a refetch. */
export function needsRefresh(r: SourceResult<unknown> | undefined, ttlSeconds: number, now: Date): boolean {
  if (!r) return true;
  const ttl = r.ok ? ttlSeconds : Math.min(ttlSeconds, FAILURE_RETRY_S);
  return now.getTime() - Date.parse(r.fetchedAt) > ttl * 1000;
}

/** FR-015a: the data shown is older than its freshness window. */
export function isStale(r: SourceResult<unknown> | undefined, ttlSeconds: number, now: Date): boolean {
  const at = dataFetchedAt(r);
  if (!at) return false;
  return now.getTime() - Date.parse(at) > ttlSeconds * 1000;
}

/** Run fn holding an exclusive lock. Returns undefined (without running fn) if another process holds it. */
export async function withLock<T>(dir: string, fn: () => Promise<T>, now: () => number = Date.now): Promise<T | undefined> {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, 'refresh.lock');
  let fd: number;
  try {
    fd = openSync(lock, 'wx');
  } catch {
    try {
      if (now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
        unlinkSync(lock);
        fd = openSync(lock, 'wx');
      } else return undefined;
    } catch {
      return undefined;
    }
  }
  try {
    writeFileSync(fd, String(process.pid));
    return await fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lock);
    } catch {
      /* already gone */
    }
  }
}
