// Spend from the BigQuery standard usage cost export (research R10). Read-only, bounded (FR-017).
import { HttpError, type Http } from '../http.js';
import type { CostRow, Costs } from '../model/types.js';

const ZERO_DECIMAL = new Set(['JPY', 'KRW']);

export function costsQuery(table: string): string {
  return [
    'SELECT invoice.month AS month, currency,',
    '  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net,',
    '  MAX(export_time) AS fresh',
    `FROM \`${table}\``,
    "WHERE DATE(_PARTITIONTIME) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE('America/Los_Angeles'), MONTH), INTERVAL 1 MONTH)",
    "  AND invoice.month IN (FORMAT_DATE('%Y%m', CURRENT_DATE('America/Los_Angeles')),",
    "                        FORMAT_DATE('%Y%m', DATE_SUB(CURRENT_DATE('America/Los_Angeles'), INTERVAL 1 MONTH)))",
    'GROUP BY month, currency',
  ].join('\n');
}

interface QueryResponse {
  jobComplete?: boolean;
  totalBytesProcessed?: string;
  rows?: { f: { v: string | null }[] }[];
  jobReference?: { projectId: string; jobId: string; location?: string };
}

export interface CostsRequest {
  table: string;
  jobProject: string;
  maxBytesBilled: number;
  /** dry-run result from a previous run, reused while the table name is unchanged */
  previous?: { table: string; dryRunBytes: number } | undefined;
}

export async function fetchCosts(http: Http, req: CostsRequest): Promise<Costs & { table: string }> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(req.jobProject)}/queries`;
  const query = costsQuery(req.table);
  const base = { query, useLegacySql: false, maximumBytesBilled: String(req.maxBytesBilled), timeoutMs: 20000, useQueryCache: true };

  let dryRunBytes = req.previous?.table === req.table ? req.previous.dryRunBytes : undefined;
  if (dryRunBytes === undefined) {
    const dry = await http.bigQueryPost<QueryResponse>(url, { ...base, dryRun: true });
    dryRunBytes = Number(dry.totalBytesProcessed ?? 0);
  }
  if (dryRunBytes > req.maxBytesBilled) {
    throw new HttpError('quota', `the spend query would scan ${dryRunBytes} bytes, over the ${req.maxBytesBilled}-byte cap; not run`);
  }

  let res = await http.bigQueryPost<QueryResponse>(url, base);
  for (let i = 0; !res.jobComplete && res.jobReference && i < 5; i++) {
    const ref = res.jobReference;
    const loc = ref.location ? `&location=${encodeURIComponent(ref.location)}` : '';
    res = await http.getJson<QueryResponse>(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(ref.projectId)}/queries/${encodeURIComponent(ref.jobId)}?timeoutMs=10000${loc}`,
    );
  }
  if (!res.jobComplete) throw new HttpError('timeout', 'the spend query did not finish in time');

  const rows: CostRow[] = [];
  let exportTime: number | null = null;
  for (const r of res.rows ?? []) {
    const [month, currency, net, fresh] = r.f.map((c) => c.v);
    if (!month || !currency) continue;
    const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
    rows.push({ month, currency, netMinor: Math.round(Number(net ?? 0) * 10 ** decimals) });
    if (fresh) {
      const t = Number(fresh) * 1000; // TIMESTAMP comes back as epoch seconds
      if (Number.isFinite(t)) exportTime = exportTime === null ? t : Math.max(exportTime, t);
    }
  }
  return { table: req.table, rows, exportTime: exportTime === null ? null : new Date(exportTime).toISOString(), dryRunBytes };
}

export function jobProjectFor(table: string, quotaProject: string | undefined): string {
  return quotaProject ?? table.split('.')[0]!;
}
