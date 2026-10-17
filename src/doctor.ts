// Setup check (`cloudbar doctor`, "Run setup check…"). Reads only; never enables anything (Story 4).
import type { Context } from './cli.js';
import { HttpError, toFailure } from './http.js';
import { findingsFromSnapshot, QUOTA_STEP, SIGN_IN_STEP } from './model/findings.js';
import type { SetupFinding, Snapshot } from './model/types.js';
import { emptySnapshot } from './cache.js';
import { refresh } from './refresh.js';
import { STATUS_STYLE, ln } from './render/swiftbar.js';

export interface DoctorOptions {
  now: () => Date;
}

/** Verify each configured export table exists (research R10: names are configured, never discovered). */
async function checkExportTables(ctx: Context): Promise<SetupFinding[]> {
  const out: SetupFinding[] = [];
  for (const [id, table] of Object.entries(ctx.config.billingExports)) {
    const [project, dataset, name] = table.split('.') as [string, string, string];
    try {
      const res = await ctx.http.getJson<{ tables?: { tableReference: { tableId: string } }[] }>(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/tables?maxResults=1000`,
      );
      const found = (res.tables ?? []).some((t) => t.tableReference.tableId === name);
      out.push(found
        ? { area: 'billingExport', level: 'pass', message: `Billing export table found for ${id}` }
        : { area: 'billingExport', level: 'fail', message: `Table ${name} not found in ${project}.${dataset}`, nextStep: 'the export may still be starting (up to 24h); otherwise check the name with: bq ls ' + `${project}:${dataset}` });
    } catch (err) {
      const f = toFailure(err);
      out.push({ area: 'billingExport', level: 'fail', message: `Cannot read dataset ${project}.${dataset}: ${f.reason}`, nextStep: 'you need roles/bigquery.dataViewer on the dataset' });
    }
  }
  return out;
}

export async function runDoctor(ctx: Context, opts: DoctorOptions): Promise<SetupFinding[]> {
  const findings: SetupFinding[] = [];
  if (ctx.configIssue) findings.push({ area: 'permissions', level: 'fail', message: ctx.configIssue.message, ...(ctx.configIssue.nextStep ? { nextStep: ctx.configIssue.nextStep } : {}) });

  try {
    await ctx.getToken();
    findings.push({ area: 'credentials', level: 'pass', message: `Signed in (${(await ctx.authSource()) === 'gcloud' ? 'gcloud CLI token' : 'Application Default Credentials'})` });
  } catch (err) {
    const reason = err instanceof HttpError ? err.reason : String(err);
    findings.push({ area: 'credentials', level: 'fail', message: `Not signed in: ${reason}`, nextStep: `run: ${SIGN_IN_STEP}` });
    return findings; // nothing else can be checked
  }

  findings.push(ctx.quotaProject
    ? { area: 'quotaProject', level: 'pass', message: `Quota project: ${ctx.quotaProject}` }
    : { area: 'quotaProject', level: 'fail', message: 'No quota project is set; several APIs refuse user credentials without one', nextStep: `run: ${QUOTA_STEP}` });

  let snapshot: Snapshot = emptySnapshot();
  snapshot = (await refresh(snapshot, ctx.planner, { force: true, now: opts.now })).snapshot;
  const fromSources = findingsFromSnapshot(snapshot, ctx.config, ctx.quotaProject);
  findings.push(...fromSources);
  if (Object.keys(ctx.config.billingExports).length === 0 && !fromSources.some((f) => f.area === 'billingExport'))
    findings.push({ area: 'billingExport', level: 'warn', message: 'No billing export is configured, so spend is unavailable', nextStep: 'follow docs/billing-export-setup.md' });
  findings.push(...(await checkExportTables(ctx)));

  const failures = Object.values(snapshot.sources).filter((r) => !r.ok).length;
  const total = Object.keys(snapshot.sources).length;
  findings.push({ area: 'permissions', level: failures === 0 ? 'pass' : 'warn', message: `${total - failures} of ${total} data sources readable` });
  return findings;
}

const MARK = { pass: '✓', warn: '!', fail: '✗' } as const;
const LEVEL_STATUS = { pass: 'healthy', warn: 'degraded', fail: 'down' } as const;

export function formatFindings(findings: SetupFinding[], mode: 'text' | 'swiftbar'): string[] {
  const order = { fail: 0, warn: 1, pass: 2 } as const;
  const sorted = [...findings].sort((a, b) => order[a.level] - order[b.level]);
  if (mode === 'swiftbar') {
    return sorted.flatMap((f) => {
      const st = STATUS_STYLE[LEVEL_STATUS[f.level]];
      const lines = [ln(f.message, { sfimage: st.sfimage, sfcolor: st.sfcolor, ...(f.link ? { href: f.link } : {}) })];
      if (f.nextStep) lines.push(ln(`→ ${f.nextStep}`, {}, 1, 120));
      return lines;
    });
  }
  const lines = ['CloudBar setup check (read-only — nothing is changed or enabled)', ''];
  for (const f of sorted) {
    lines.push(`${MARK[f.level]} ${f.message}`);
    if (f.nextStep) lines.push(`    → ${f.nextStep}`);
    if (f.link) lines.push(`    ${f.link}`);
  }
  const fails = findings.filter((f) => f.level === 'fail').length;
  const warns = findings.filter((f) => f.level === 'warn').length;
  lines.push('', fails ? `${fails} problem(s) to fix, ${warns} note(s).` : warns ? `No problems. ${warns} note(s).` : 'All checks passed.');
  return lines;
}

export async function runDoctorCommand(ctx: Context, opts: { swiftbar: boolean; now: () => Date; out: (s: string) => void; docsPath: string }): Promise<number> {
  const findings = await runDoctor(ctx, { now: opts.now });
  opts.out(formatFindings(findings, opts.swiftbar ? 'swiftbar' : 'text').join('\n'));
  return findings.some((f) => f.level === 'fail') ? 1 : 0;
}
