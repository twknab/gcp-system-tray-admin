# Data Model: CloudBar MVP

All types live in `src/model/types.ts`. Times are ISO-8601 strings in UTC. Money uses decimal
**minor units** (cents) held as numbers, never floats of whole units.

## Status

```ts
type StatusLevel = 'healthy' | 'degraded' | 'down' | 'unknown';
interface Status { level: StatusLevel; reason?: string } // reason: "not monitored", "latest revision failed", …
```

Precedence for **overall** status (spec Story 3 #7):

1. `down`, if any item is down.
2. Otherwise `degraded`, if any item is degraded or spend exceeds the budget.
3. Otherwise `healthy`, if any item is healthy.
4. Otherwise `unknown`.

**Group** status (the header of each service group) is the worst status among the group's items,
ranked down > degraded > unknown > healthy. A group header therefore reflects any uncertainty in
it, while the overall status ignores unknown items.

## SourceResult

```ts
type FailureKind = 'disabled' | 'denied' | 'timeout' | 'network' | 'auth' | 'quota' | 'other';
type SourceResult<T> =
  | { ok: true; data: T; fetchedAt: string }
  | { ok: false; kind: FailureKind; reason: string; fetchedAt: string;
      lastGood?: { data: T; fetchedAt: string } };
```

- `reason` is a plain-English sentence, for example "Cloud SQL Admin API not enabled in
  hughes-intel".
- A result is **stale** when `now - fetchedAt(of data shown) > ttl(source)` (FR-015a).

## Project

| Field | Type | Notes |
|-------|------|-------|
| projectId | string | unique key |
| displayName | string | used as the label on every resource |
| projectNumber | string | used to match Monitoring resources |
| billingAccountId? | string | from `getBillingInfo` |
| billingEnabled | boolean | false → resources are unknown, with reason "billing disabled" |
| enabledApiCount | number \| null | null when Service Usage is unavailable |
| enabledApis | Set\<string\> | used to skip sources whose API is disabled, without calling them |

Projects in `config.excludeProjects` are dropped right after listing. Projects whose lifecycle
state is not `ACTIVE` are dropped too.

## Resource (discriminated by `type`)

| Field | Type | Notes |
|-------|------|-------|
| type | `'run' \| 'sql' \| 'vertex' \| 'storage'` | |
| id | string | `${projectId}/${location}/${name}`, unique |
| name | string | |
| projectId | string | the owning project; the menu shows its displayName |
| location | string | region, or a multi-region for buckets |
| reportedState | string | the raw provider state, shown in the submenu |
| consoleUrl | string | deep link |
| status | Status | computed by `model/status.ts` |
| sizeBytes? | number \| 'pending' \| 'unavailable' | storage only |
| sizeAsOf? | string | storage only; stale after 48 hours (FR-023) |

### Per-type state mapping (inputs to status)

| Type | Ready | Degraded | Down |
|------|-------|----------|------|
| run | Ready=True, and latestReady == latestCreated | Ready=False, with latestReady non-empty and ≠ latestCreated | Ready=False, with no ready revision |
| run (Ready=Unknown) | → `unknown`, reason "deploying" | | |
| sql | `RUNNABLE` with activationPolicy `ALWAYS` | `MAINTENANCE`, `REPAIRING` | `FAILED`, `SUSPENDED` |
| sql (other) | `RUNNABLE` with `NEVER` → `unknown`, reason "stopped". `PENDING_*` → `unknown`, reason "provisioning" or "deleting". | | |
| vertex | the endpoint has at least one deployed model | n/a | n/a |
| vertex (idle) | 0 deployed models → `unknown`, reason "idle, no models deployed" | | |
| storage | never "ready", always unknown (Story 3 #8) | | |

**Status rule** (FR-009): when the resource's mapped state is **Ready**:

- If an open alert in its project applies to its type, the resource takes that alert's level.
- Otherwise, if `(projectId, type)` is in the monitoring coverage set, it is `healthy`.
- Otherwise it is `unknown`, with reason "not monitored".

A mapped state of Degraded or Down applies regardless of monitoring. The worse of the state and
the alert level wins.

## MonitoringCoverage

`Set<\`${projectId}:${type}\`>`, built from enabled alert policies and uptime checks. A policy's
condition filters (threshold or absence filters, MQL, PromQL) are mapped to a resource type through the
monitored-resource names in `research.md` R3. An uptime check targeting `cloud_run_revision`
covers `run`. A policy whose resource type can't be determined covers nothing.

## Alert

| Field | Type |
|-------|------|
| id | string |
| policyName | string |
| projectId | string |
| severity | `'critical' \| 'error' \| 'warning' \| 'unspecified'` |
| openedAt | string |
| resourceType? | resource `type`, if mappable |
| consoleUrl | string |

How severity maps to status: `critical` and `error` mean down; `warning` and `unspecified` mean
degraded. The source is `GET v3/projects/{p}/alerts?filter=state="OPEN"`, with severity taken from
the `policy` snapshot and `resourceType` from `resource.type` (research R1).

## BillingAccount

| Field | Type | Notes |
|-------|------|-------|
| id | string | `XXXXXX-XXXXXX-XXXXXX` |
| displayName | string | |
| open | boolean | closed accounts are listed but excluded from totals |
| currency | string \| null | from export rows |
| exportTable? | string | `project.dataset.table`, required in config. Missing → "Costs unavailable: export not configured". |
| costs | SourceResult\<{ mtdMinor: number; lastMonthMinor: number \| null; exportTime: string }\> | |
| budgets | SourceResult\<Budget[]\> | |

## Budget

| Field | Type | Notes |
|-------|------|-------|
| name | string | display name |
| scope | `'account' \| 'filtered'` | `filtered` when budgetFilter limits projects or services |
| amount | `{ kind: 'specified'; minor: number; currency: string } \| { kind: 'lastPeriod' }` | |
| period | `'month' \| 'other'` | |

**Selection**: account-scoped monthly budgets are preferred over filtered ones. Each remaining
budget is shown on its own line, and their amounts are never added together.

## BillingSummary (derived)

```ts
interface MoneyByCurrency { [currency: string]: number /* minor units */ }
interface BillingSummary {
  mtd: MoneyByCurrency; lastMonth: MoneyByCurrency | null;
  coveredAccounts: number; visibleAccounts: number; // partial when covered < visible
  oldestExportTime: string | null;                  // stale when > 24h old (FR-015b)
  budgetLines: { name: string; amountMinor: number | null; currency: string; remainingMinor: number | null }[];
  overBudget: boolean;
}
```

## Snapshot (cache root)

```ts
interface Snapshot {
  schemaVersion: 1;
  sources: Record<SourceKey, SourceResult<unknown>>; // SourceKey = 'projects' | `run:${projectId}` | `costs:${accountId}` | …
  updatedAt: string;
}
```

`schemaVersion` mismatch → cache discarded (full refresh).

## Config

See `contracts/config.schema.json`. The fields are:

- `billingExports` — a map of `accountId` to `project.dataset.table`.
- `runRegions` — the fallback regions if the global Cloud Run list is unavailable. Defaults to
  `["us-central1"]`.
- `vertexRegions` — defaults to `["us-central1"]`.
- `excludeProjects` — defaults to `[]`.
- `quotaProject` — optional.
- `maxBytesBilled` — defaults to 1 GiB.
- `ttlOverrides` — optional.
- `nodePath` — optional.

## SetupFinding

```ts
interface SetupFinding { area: 'credentials'|'quotaProject'|'permissions'|'api'|'billingExport'|'budgets';
  level: 'pass'|'warn'|'fail'; message: string; nextStep?: string; link?: string; projectId?: string }
```
