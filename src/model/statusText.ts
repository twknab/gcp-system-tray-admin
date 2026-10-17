// Shared status helpers used by pure model code.
import type { Status, StatusLevel } from './types.js';

const RANK: Record<StatusLevel, number> = { down: 3, degraded: 2, unknown: 1, healthy: 0 };

export const worseRank = (s: Status) => RANK[s.level];

export function statusLabelText(s: Status): string {
  if (s.level === 'healthy') return 'healthy';
  return s.reason ? `${s.level}: ${s.reason}` : s.level;
}
