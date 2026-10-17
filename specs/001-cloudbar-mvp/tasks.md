---

description: "Task list for CloudBar MVP"
---

# Tasks: CloudBar MVP — Google Cloud at a glance in the menu bar

**Input**: design documents in `specs/001-cloudbar-mvp/`: plan.md, spec.md, research.md,
data-model.md, contracts/, quickstart.md

**Tests**: requested. Tests are driven by fixtures and use render snapshots plus the read-only HTTP
guard. Within each story, write the tests first and see them fail.

**Delivery order** (as the owner asked): Setup, then Foundational, then **US1** (spend at a glance)
and **US4** (setup check and shortcuts). At that point a working menu can be installed. Then
**US2** (services by type), then **US3** (honest status and alerts).

**Status before US3**: until US3 adds monitoring coverage and alerts, every resource US2 shows is
`unknown`, with reason "not monitored". That is honest under Principle II, not a placeholder.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4, mapped to the user stories in spec.md
- The layout is a single project, with `src/` and `tests/` at the repository root (plan.md →
  Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: initialise the TypeScript project and the developer loop.

- [X] T001 Create `package.json`:
  - `"type": "module"`, `"engines": {"node": ">=22"}`, `"bin": {"cloudbar": "dist/cli.js"}`
  - scripts `build` (`tsc -p .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), and
    `lint` (`tsc --noEmit && node scripts/check-fixtures.mjs`)
  - dependency `google-auth-library`
  - devDependencies `typescript`, `vitest`, `@types/node`
- [X] T002 [P] Create `tsconfig.json`:
  - `strict`, `target`/`module` `ES2022`/`NodeNext`, `outDir dist`, `rootDir src`
  - `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [X] T003 [P] Create `vitest.config.ts` with `include: ['tests/**/*.test.ts']` and node
  environment.
- [X] T004 [P] Extend `.gitignore` with `dist/`, `coverage/`, and `config.json`.
- [X] T005 [P] Create `config.example.json`, matching `specs/001-cloudbar-mvp/contracts/config.schema.json`.
  Use the fake IDs `000000-000000-000000` and `example-project`.
- [X] T006 [P] Create `scripts/check-fixtures.mjs`. It fails if any file in `tests/fixtures/`
  contains a billing-account-shaped ID that isn't one digit repeated (`/^(\d)\1{5}-\1{6}-\1{6}$/`),
  or a `projectId`/`projects/<id>` value not prefixed `fake-` or `example-` (Principle V).
- [X] T007 [P] Create `.github/workflows/ci.yml`: Node 22, `npm ci`, `npm run lint`, `npm test`,
  and `npm run build`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: types, I/O plumbing, cache, and the render skeleton that every story uses.

**⚠️ No user-story work starts until this phase is complete.**

### Tests for Foundational

- [X] T008 [P] Write `tests/unit/http.guard.test.ts`:
  - The `http.ts` client rejects every method except GET.
  - POST is allowed only to `https://bigquery.googleapis.com/bigquery/v2/projects/*/queries`.
  - Any URL containing `:enable`, `:disable`, `:batchEnable`, `/delete`, or `:patch` is rejected.
  - Covers Principle I and FR-016.
- [X] T009 [P] Write `tests/unit/http.classify.test.ts`, covering the error classifier against the
  ErrorInfo shapes in research.md R12:

  | Response | Kind |
  |----------|------|
  | 403 with `SERVICE_DISABLED` | `disabled` |
  | 403 with `BILLING_DISABLED` | `disabled` |
  | `USER_PROJECT_DENIED` | `auth` |
  | other 403 | `denied` |
  | 401 | `auth` |
  | 429 | `quota` |
  | 5xx | `other` |
  | timeout | `timeout` |
  | fetch rejection | `network` |
- [X] T010 [P] Write `tests/unit/cache.test.ts`:
  - per-source TTL staleness (FR-013, FR-015a);
  - an atomic write survives a crash mid-write (simulated with a temp file);
  - a `schemaVersion` mismatch discards the cache;
  - the lock file blocks a second refresher, and a lock older than 60 s is taken over.
- [X] T011 [P] Write `tests/unit/config.test.ts`:
  - defaults are applied;
  - invalid `vertexRegions` and invalid billing-ID keys are rejected;
  - a missing file means defaults, not a crash;
  - `CLOUDBAR_CONFIG` and `--config` override the path.
- [X] T012 [P] Write `tests/unit/format.test.ts`:
  - money from minor units, per currency;
  - bytes (B, KB, MB, GB, TB, base 1000, one decimal);
  - relative time ("just now", "3m ago", "2h ago", "3d ago");
  - escaping of `|` to `│`, and truncation at 60 characters.

### Implementation for Foundational

- [X] T013 Create `src/model/types.ts` with every type in `data-model.md`:
  - `StatusLevel`, `Status`, `FailureKind`, `SourceResult<T>`
  - `Project`, `Resource` (a discriminated union over `run`, `sql`, `vertex`, `storage`)
  - `Alert`, `BillingAccount`, `Budget`, `BillingSummary`
  - `Snapshot` (`schemaVersion: 1`), `Config`, `SetupFinding`, and `ViewModel`
- [X] T014 [P] Implement `src/config.ts`. It loads and validates
  `~/.config/cloudbar/config.json` with a hand-written validator (no schema library) and applies
  these defaults:
  - `vertexRegions: ["us-central1"]`
  - `runRegions: ["us-central1"]`
  - `maxBytesBilled: 1073741824`
  - TTLs as listed in `contracts/config.schema.json`
- [X] T015 [P] Implement `src/render/format.ts`: money, bytes, relative time, escaping, and
  truncation, so that T012 passes.
- [X] T016 Implement `src/http.ts`:
  - `createHttp({ fetch, getToken, quotaProject, timeoutMs: 10000 })` exposes `getJson(url)`,
    `getAllPages(url, itemsKey)` (follows `nextPageToken` or `pageToken`), and `bigQueryPost(url,
    body)`.
  - It applies the method and URL guard, adds `Authorization` and `x-goog-user-project`, and
    retries once on 429 or 5xx with jitter.
  - The classifier returns a `SourceResult` failure.
  - `fetch` is injected, so tests never touch the network.
  - T008 and T009 must pass.
- [X] T017 Implement `src/auth.ts`:
  - `GoogleAuth` with scopes `cloud-platform.read-only` and `bigquery.readonly`. Expose
    `getToken()` and `getQuotaProject()`, taken from config or ADC's `quota_project_id`.
  - Fallback: run `gcloud auth print-access-token` via `execFile`, searching for gcloud in
    `/opt/homebrew/bin`, `/usr/local/bin`, `~/google-cloud-sdk/bin`, then `PATH`.
  - Failures surface as `{ kind: 'auth' }` with the sign-in command in the reason.
- [X] T018 Implement `src/cache.ts`:
  - `loadSnapshot`, `saveSnapshot` (write to a temp file, then rename), `isStale(result, ttl,
    now)`, `withLock(fn)` (`O_EXCL` lock file with a 60-second override).
  - The cache directory is `$SWIFTBAR_PLUGIN_CACHE_PATH`, falling back to
    `~/Library/Caches/cloudbar`.
  - T010 must pass.
- [X] T019 Implement `src/refresh.ts`:
  - `refresh(snapshot, sources, { force, now, budgetMs: 25000, concurrency: 8 })` runs only the
    stale (or forced) source keys and keeps `lastGood` on failure.
  - A source that misses the overall budget keeps its previous value, marked stale.
  - Sources are registered as `{ key, ttlKey, run(ctx) }`.
- [X] T020 Implement `src/render/swiftbar.ts` as a skeleton: `renderMenu(view: ViewModel):
  string[]` emits the title line, the section order from `contracts/swiftbar-output.md`, and the
  **Shortcuts** section:
  - "Updated Xm ago"
  - Refresh, with `bash=<node> param0=<cli> param1=refresh terminal=false refresh=true`
  - "Run setup check…" with `terminal=true`
  - Settings…, using `/usr/bin/open -t <config>`
  - Open Cloud Console
  - Status uses the symbols and `light,dark` colours from contracts/swiftbar-output.md (research
    R14).
- [X] T021 Implement `src/model/view.ts` as a skeleton: `buildView(snapshot, config, now):
  ViewModel`, with sections empty until stories fill them in. "No cache, no network" must still
  yield a title, an unknown status, and Shortcuts (spec edge case: offline).
- [X] T022 Implement `src/cli.ts`:
  - commands `render` (default), `refresh`, `doctor`, and `render --fixture <name>`;
  - flags `--config` and `--no-cache`;
  - `SWIFTBAR_PLUGIN_REFRESH_REASON` of `MenuAction`, `FirstLaunch`, or `WakeFromSleep` forces a
    full refresh;
  - `render` always exits 0, catching every error and rendering a minimal menu
    (contracts/cli.md).
- [X] T023 Create `cloudbar.5m.sh`, the SwiftBar shim:
  - Shebang `#!/bin/bash`, plus metadata tags `<swiftbar.hideRunInTerminal>true`,
    `<swiftbar.hideLastUpdated>true`, and `<swiftbar.hideDisablePlugin>true`.
  - Resolve `node` from `config.nodePath`, then `/opt/homebrew/bin/node`, `/usr/local/bin/node`,
    then `~/.nvm/versions/node/*/bin/node` (highest version).
  - Resolve the repo directory through `readlink` on its own symlink, then
    `exec node "$DIR/dist/cli.js" "$@"`.
  - If node is not found, print one title line "☁︎ ?" and the submenu line "Node.js 22+ not found
    — see README".
- [X] T024 [P] Create `tests/render/shell.test.ts` as a snapshot of the Foundational menu (title,
  unknown status, Shortcuts) for an empty snapshot. Assert invariants 1, 3, 5, and 7 from
  contracts/swiftbar-output.md. Invariant 7: the four status levels render with four different
  `sfimage` values, and non-healthy submenu lines carry a text label (FR-020).

**Checkpoint**: `npm test` passes, and `node dist/cli.js render` prints a valid minimal menu
without credentials.

---

## Phase 3: User Story 1 — Spend and overall status at a glance (Priority: P1) 🎯 MVP

**Goal**: the title shows month-to-date net spend across every visible billing account, plus the
overall status. The Billing section shows this month, last month, the budget, the amount
remaining, the data age, and a submenu per account.

**Independent Test**: `render --fixture no-export` and `render --fixture billing` match their
snapshots. On the owner's Mac, the title amount matches the Console's billing report to within
$0.01 (SC-003).

### Verify-in-implement for US1 (research.md)

- [ ] T025 [US1] **Verify R10 export naming and partitioning.**
  - With the owner's help, run `bq show --format=prettyjson <table>` once, on the owner's machine.
  - Record whether `timePartitioning.type=DAY` applies to `_PARTITIONTIME` and the exact table
    naming. Save a redacted copy as `tests/fixtures/bq/table-meta.json`.
  - If the table is not partitioned on `_PARTITIONTIME`, change the query's partition predicate
    in `src/sources/costs.ts` to match, and note it in research.md R10.
- [ ] T026 [US1] **Verify R13 credentials for BigQuery.**
  - On the owner's machine, confirm that the real ADC user token can call `jobs.query` (a dry
    run) against the export table.
  - Record which scopes the token actually carries (`gcloud auth application-default
    print-access-token` → tokeninfo).
  - Record the result in research.md R13. Read-only is enforced by the guard, not by scopes.

### Tests for US1

- [ ] T027 [P] [US1] Write `tests/sources/billingAccounts.test.ts`:
  - `billingAccounts.list` fixture (two open accounts, one closed), with pagination;
  - `projects/{p}/billingInfo` fixtures, including `billingEnabled:false`.
- [ ] T028 [P] [US1] Write `tests/sources/costs.test.ts`:
  - The query text contains the partition predicate and both `invoice.month` values.
  - The body has `useLegacySql:false` and `maximumBytesBilled` set to the config value as a
    string.
  - A dry run happens first, and the source fails with kind `quota` and no real query if
    `totalBytesProcessed > cap`.
  - Rows are parsed into minor units per currency, and `MAX(export_time)` gives `exportTime`.
  - An unconfigured account gives `{ ok:false, kind:'other', reason:'export not configured' }`.
- [ ] T029 [P] [US1] Write `tests/sources/budgets.test.ts`:
  - `specifiedAmount` (units plus nanos) is converted to minor units.
  - `lastPeriodAmount` becomes `{kind:'lastPeriod'}`.
  - Account-scoped versus filtered budgets are classified correctly.
  - `customPeriod` is flagged.
  - An empty list is `ok` with `[]`.
- [ ] T030 [P] [US1] Write `tests/unit/billingSummary.test.ts`, covering summary derivation in
  `src/model/view.ts`:
  - per-currency sums;
  - partial when some accounts are unreadable, and `coveredAccounts`/`visibleAccounts` agree;
  - closed accounts are excluded;
  - account-scoped budgets are preferred;
  - `lastPeriod` is resolved from last month, and "Budget amount unavailable" shows when last
    month is missing;
  - remaining and overspend are computed;
  - the 24-hour stale flag is based on `exportTime` (FR-015b);
  - negative and zero net spend are shown as reported.
- [ ] T031 [P] [US1] Write `tests/render/billing.test.ts` with snapshots for fixtures `billing`
  (two accounts, USD), `billing-partial`, `billing-multicurrency`, `no-export`, `no-budget`,
  `over-budget`, and `stale-costs`. Assert:
  - the title has no amount when nothing is readable;
  - "~" and "partial (n of m accounts)" appear when partial;
  - "No budget set" links to `https://console.cloud.google.com/billing/budgets`;
  - over budget makes the overall status degraded;
  - a stale label never changes the overall status.

### Implementation for US1

- [ ] T032 [P] [US1] Implement `src/sources/billingAccounts.ts`: `listBillingAccounts`, and
  `getProjectBillingInfo(projectId)` using `getAllPages` (research R8).
- [ ] T033 [P] [US1] Implement `src/sources/costs.ts`:
  - Build the R10 query for each configured `billingExports[accountId]`.
  - Run a dry run on the first call for each table, recording `dryRunBytes` in the snapshot, and
    again whenever the table name changes.
  - Then run `bigQueryPost` against `projects/{jobProject}/queries`, where `jobProject` is
    `config.quotaProject` or the table's project.
  - Parse `rows[].f[].v` into `{ mtdMinor, lastMonthMinor, currency, exportTime }`.
- [ ] T034 [P] [US1] Implement `src/sources/budgets.ts`: `listBudgets(accountId)` per research R9.
- [ ] T035 [US1] Extend `src/model/status.ts` with `overallStatus(items, billing)`, using the
  precedence in data-model.md (down, then degraded, including over budget, then healthy if any,
  then unknown). Before US2 and US3 there are no items, so the result is `unknown`, or `degraded`
  when over budget.
- [ ] T036 [US1] Extend `src/model/view.ts` with `buildBillingSummary(accounts, now)` (T030) and
  the billing section of the view model.
- [ ] T037 [US1] Extend `src/render/swiftbar.ts` with:
  - the title amount (`~` prefix when partial);
  - the Billing section and the per-account submenu;
  - "Costs unavailable — export not set up", which opens the **local**
    `<repo>/docs/billing-export-setup.md` (`bash=/usr/bin/open param0=<path>`), with a GitHub link
    as an alternate (`alternate=true`) for when the repo isn't on disk;
  - "Cost data as of …" and the stale label.
- [ ] T038 [US1] Register `billingAccounts`, `costs:<account>`, and `budgets:<account>` sources in
  `src/refresh.ts` with TTLs of 1 h, 4 h, and 4 h.
- [ ] T039 [P] [US1] Write `docs/billing-export-setup.md`, the steps the owner performs:
  - Create a **US or EU multi-region** dataset, so the backfill to the previous month works
    (research R10).
  - Billing → Billing export → Standard usage cost → choose the dataset.
  - Wait up to 24 hours, and up to 5 days for backfill.
  - Copy the table name into `billingExports`.
  - It states clearly that CloudBar never does any of this.
- [ ] T040 [P] [US1] Create fixtures `tests/fixtures/{billing,billing-partial,billing-multicurrency,no-export,no-budget,over-budget,stale-costs}.json`
  as `Snapshot` documents with fake IDs, so that T006 passes.

**Checkpoint**: US1 works on its own. Both the title and the Billing section render from real or
fixture data.

---

## Phase 4: User Story 4 — Setup check and shortcuts (Priority: P2, delivered second by request)

**Goal**: `cloudbar doctor` reports credentials, quota project, permissions, each needed API per
project, the billing export, and budgets, each with a next step. The shortcuts work. Together with
US1, this is an installable menu.

**Independent Test**: `doctor` against the fixtures `doctor-no-creds`, `doctor-no-quota`, and
`doctor-no-export` prints the expected findings and exits 1. The read-only guard sees no
non-GET call.

### Tests for US4

- [ ] T041 [P] [US4] Write `tests/unit/doctor.test.ts` with injected fake sources:
  - no ADC and no gcloud: fail credentials, with the next step `gcloud auth application-default login`;
  - no quota project: fail, with the step `gcloud auth application-default set-quota-project <id>`;
  - `USER_PROJECT_DENIED`: fail quotaProject, naming `serviceusage.services.use`;
  - an API disabled in the quota project: fail api, giving a console link
    `https://console.cloud.google.com/apis/library/<api>?project=<p>` and never calling enable;
  - export not configured: warn billingExport, linking the docs;
  - an export table that doesn't exist (`datasets/{d}/tables` doesn't list it): fail;
  - budgets denied: warn.
- [ ] T042 [P] [US4] Write `tests/render/doctor.test.ts` with snapshots of the `doctor` text
  output and of `doctor --swiftbar` output.

### Implementation for US4

- [ ] T043 [US4] Implement `src/doctor.ts`:
  - `runDoctor(ctx): SetupFinding[]` runs each source once with `force`, plus explicit checks:
    ADC present, quota project set, the needed APIs enabled in the quota project, and each
    configured export table exists via
    `GET bigquery/v2/projects/{p}/datasets/{d}/tables?maxResults=1000`.
  - Each `SourceResult` failure maps to a finding with a plain-English `message` and `nextStep`.
  - `formatFindings(findings, 'text'|'swiftbar')` formats the output.
- [ ] T044 [US4] Wire `doctor` in `src/cli.ts`: exit 0 when everything passes, 1 on any fail, and
  `--swiftbar` for menu output.
- [ ] T045 [US4] Add a "⚠ N setup issues" line to `src/render/swiftbar.ts`, shown only when the
  last doctor run or the source failures include a `fail` finding. Its submenu lists the findings.
- [ ] T046 [P] [US4] Write `README.md` covering:
  - what CloudBar is, and that it is read-only and never enables anything;
  - prerequisites (SwiftBar, Node 22, gcloud);
  - install steps from quickstart.md §B;
  - the roles needed: `roles/browser`, `roles/billing.viewer`, `roles/serviceusage.serviceUsageViewer`,
    `roles/run.viewer`, `roles/cloudsql.viewer`, `roles/aiplatform.viewer`, `roles/storage.objectViewer`
    or bucket list, `roles/monitoring.viewer`, `roles/bigquery.jobUser`, and `roles/bigquery.dataViewer`;
  - a link to `docs/billing-export-setup.md`.
- [ ] T047 [US4] **Verify R14 SwiftBar nesting and colours.** This is a manual check by the owner
  on their Mac.
  - Run `render --fixture billing` through the installed plugin.
  - Confirm that `--` submenus render, that `sfcolor=light,dark` pairs switch with appearance, and
    that the Refresh item re-runs the plugin.
  - Record the result in research.md R14.
  - If `--` nesting fails, open an issue before US2 starts.

**Checkpoint**: an installable menu exists, with spend, budget, a setup check, and working
shortcuts.

---

## Phase 5: User Story 2 — Everything I'm using, with status and project (Priority: P1)

**Goal**: groups for Cloud Run, Cloud SQL, Vertex AI (configured regions), and Cloud Storage
(with sizes). Each item is labelled with its project and has a submenu with state, location, and
a console link. There is also a "Projects (N)" reference list. Resource status is computed from
mapped state alone; monitoring coverage is empty until US3, so Ready resources show `unknown`
with reason "not monitored".

**Independent Test**: `render --fixture services` matches its snapshot:

- every resource is under its group with the right project label;
- the header counts are right;
- there is overflow at 25 items;
- "Unavailable in N projects" shows for a disabled API;
- the bucket total size is shown, labelled partial when a size is pending.

### Verify-in-implement for US2 (research.md)

- [ ] T048 [US2] **Verify R4, the Cloud Run v1 global list.**
  - On the owner's machine, run `curl -H "Authorization: Bearer $(gcloud auth print-access-token)" https://run.googleapis.com/apis/serving.knative.dev/v1/namespaces/<project>/services`
    against a project with services in two or more regions.
  - Confirm it lists every region, and save a redacted copy as `tests/fixtures/api/run-v1-list.json`.
  - If it doesn't, make the v2 per-region path over `config.runRegions` the primary path in
    `src/sources/run.ts`, and update research.md R4.
- [ ] T049 [US2] **Verify R6 and R7 response shapes.** Capture redacted single-project responses
  for Cloud SQL `instances`, Vertex `endpoints` (us-central1), Storage `b?project=`, and the
  `total_bytes` timeSeries into `tests/fixtures/api/`. Confirm the field names used in
  data-model.md.

### Tests for US2

- [ ] T050 [P] [US2] Write `tests/sources/projects.test.ts`:
  - `projects:search?query=state:ACTIVE` with pagination;
  - `excludeProjects` filtering;
  - `serviceusage` enabled-API counts with pagination (pageSize 200);
  - an `enabledApis` set that lets disabled sources be skipped without a call.
- [ ] T051 [P] [US2] Write `tests/sources/run.test.ts`, using the R4 mapping table:
  - Ready=True with matching revisions → Ready;
  - Ready=False with an older ready revision → Degraded, "latest revision failed, previous still
    serving";
  - Ready=False with no ready revision → Down;
  - Ready=Unknown → unknown, "deploying";
  - `unreachable[]` regions → an unavailable note;
  - the v2 fallback path.
- [ ] T052 [P] [US2] Write `tests/sources/sql.test.ts`, covering the R5 table: RUNNABLE plus
  ALWAYS, RUNNABLE plus NEVER, MAINTENANCE, REPAIRING, FAILED, SUSPENDED, PENDING_CREATE, and
  PENDING_DELETE.
- [ ] T053 [P] [US2] Write `tests/sources/vertex.test.ts`:
  - one call per configured region, to the regional host;
  - deployed models → Ready;
  - none → unknown, "idle, no models deployed".
- [ ] T054 [P] [US2] Write `tests/sources/storage.test.ts`:
  - buckets list;
  - `total_bytes` grouped by `bucket_name`, using the latest point time as `sizeAsOf`;
  - no series and created under 48 h ago → `'pending'`;
  - no series and older → 0 B, "no objects";
  - a failed size call → `'unavailable'` for every bucket in that project, with the bucket list
    still shown.
- [ ] T055 [P] [US2] Write `tests/unit/resourceStatus.test.ts`, covering `resourceStatus(resource,
  coverage=∅, alerts=[])`:
  - Ready → unknown, "not monitored";
  - Degraded and Down pass through;
  - storage is always unknown;
  - "billing disabled" in a project → unknown with that reason.
- [ ] T056 [P] [US2] Write `tests/render/services.test.ts` with snapshots for fixtures `services`,
  `services-overflow` (30 buckets), and `denied` (Cloud SQL disabled in one project). Assert
  invariants 2 and 4 from contracts/swiftbar-output.md, and that no Cloud Storage line ever uses
  the healthy symbol.

### Implementation for US2

- [ ] T057 [P] [US2] Implement `src/sources/projects.ts` (R11).
- [ ] T058 [P] [US2] Implement `src/sources/services.ts` (R12), giving the enabled-API set and
  count per project.
- [ ] T059 [P] [US2] Implement `src/sources/run.ts`: the v1 global list, then the R4 mapping, then
  `Resource[]`, with the v2 per-region fallback. The console URL is
  `https://console.cloud.google.com/run/detail/<region>/<name>/metrics?project=<p>`.
- [ ] T060 [P] [US2] Implement `src/sources/sql.ts` (R5). The console URL is
  `https://console.cloud.google.com/sql/instances/<name>/overview?project=<p>`.
- [ ] T061 [P] [US2] Implement `src/sources/vertex.ts` (R6). The console URL is
  `https://console.cloud.google.com/vertex-ai/online-prediction/locations/<r>/endpoints/<id>?project=<p>`.
- [ ] T062 [P] [US2] Implement `src/sources/storage.ts` (R7): buckets plus a sizes timeSeries call
  per project, with a 6 h `storageSize` TTL separate from the 15 min bucket-list TTL. The console
  URL is `https://console.cloud.google.com/storage/browser/<bucket>?project=<p>`.
- [ ] T063 [US2] Implement `resourceStatus(resource, coverage, alerts)` in `src/model/status.ts`,
  following data-model.md "Status rule", and `groupStatus(items)` (worst status, with unknown
  ranked above healthy).
- [ ] T064 [US2] Extend `src/model/view.ts` with service groups:
  - groups ordered Cloud Run, Cloud SQL, Vertex AI, Cloud Storage;
  - items sorted worst status first, then project display name, then name;
  - each group capped at 25, with "and N more";
  - "Unavailable in N projects" built from failed per-project sources;
  - the bucket total size, plus the partial and pending rules (FR-023);
  - the Projects reference list with enabled-API counts.
  `overallStatus` now includes the items.
- [ ] T065 [US2] Extend `src/render/swiftbar.ts` with:
  - group headers, as count plus worst-status symbol, with "· us-central1" for Vertex and "(N
    buckets · X GB)" for Storage;
  - item lines, "name · project display name";
  - item submenus, with state, location, project, status reason, and Open in Console;
  - overflow, the unavailable note, and the Projects section.
- [ ] T066 [US2] Register the sources in `src/refresh.ts`:
  - `projects` and `services:<p>` (1 h);
  - `run:<p>`, `sql:<p>`, `vertex:<p>:<r>`, and `storage:<p>` (15 min);
  - `storageSize:<p>` (6 h).
  A source whose API is not in `enabledApis` is recorded as `{ok:false, kind:'disabled'}` without
  a request.
- [ ] T067 [P] [US2] Create fixtures `tests/fixtures/{services,services-overflow,denied}.json` with
  fake IDs.

**Checkpoint**: US1, US4, and US2 all work. Every resource is visible with its project, and is
honestly "not monitored" until US3.

---

## Phase 6: User Story 3 — Honest status and alerts (Priority: P2)

**Goal**: monitoring coverage per (project, resource type), built from enabled alert policies and
uptime checks. Open alerts are listed with severity, project, age, and link. Resource and overall
status apply the full rules in Story 3 #1–8.

**Independent Test**: `render --fixture status-matrix` covers the four cases from spec Story 3:

| Case | Status |
|------|--------|
| monitored Cloud Run, no open alert | healthy |
| Cloud Run with no coverage | unknown |
| latest revision failed | degraded |
| critical open alert | down |

Also: buckets are unknown or alert-driven only, and the overall status follows the precedence.

### Verify-in-implement for US3 (research.md)

- [ ] T068 [US3] **Verify R1 and R3.**
  - Capture redacted responses for `v3/projects/<p>/alerts?filter=state="OPEN"`, `alertPolicies`
    (at least one threshold-filter, one MQL, and one PromQL condition, if the owner has them), and
    `uptimeCheckConfigs` into `tests/fixtures/api/`.
  - Confirm the role needed for the alerts list, and record it in research.md R1 and README.md.

### Tests for US3

- [ ] T069 [P] [US3] Write `tests/sources/monitoring.test.ts`:
  - policy parsing for each condition kind (threshold, absent, MQL `fetch`, PromQL
    `monitored_resource` and metric prefix) mapped to resource types (R3 table);
  - disabled policies are ignored;
  - an unmappable policy covers nothing;
  - an uptime check on `cloud_run_revision` covers run;
  - open alerts are parsed (severity mapping, `resource.type` mapped to a type, `openTime`);
  - pagination;
  - an alerts call that fails while the policies call succeeds gives "Alerts unavailable" with
    the policy count still shown.
- [ ] T070 [P] [US3] Write `tests/unit/status.matrix.test.ts`: a table test for spec Story 3 #1–8,
  plus overall precedence:
  - all unknown → unknown;
  - one healthy plus unknowns → healthy;
  - any degraded → degraded;
  - any down → down;
  - over budget → at least degraded.
- [ ] T071 [P] [US3] Write `tests/render/alerts.test.ts` with snapshots for fixtures
  `status-matrix`, `alerts-open` (one critical, one warning, with ages and links), and
  `alerts-none` ("No open alerts · N policies").

### Implementation for US3

- [ ] T072 [US3] Implement `src/sources/monitoring.ts`: `listAlertPolicies(p)`,
  `listUptimeChecks(p)`, then `coverage: Set<'<p>:<type>'>`, and `listOpenAlerts(p)`, then
  `Alert[]` (research R1–R3).
- [ ] T073 [US3] Feed coverage and alerts into `resourceStatus` in `src/model/status.ts`:
  - an open alert matching the project and type sets the level, with critical or error as down and
    warning as degraded, and the worse of state and alert wins;
  - storage gets degraded or down only through an alert (Story 3 #8).
- [ ] T074 [US3] Extend `src/model/view.ts` and `src/render/swiftbar.ts` with the Alerts section:
  one line per alert, with severity symbol, policy name, project, and age, linking to
  `https://console.cloud.google.com/monitoring/alerting/alerts/<id>?project=<p>`, or "No open
  alerts · N policies".
- [ ] T075 [US3] Register `alerts:<p>` (5 min), `alertPolicies:<p>` (1 h), and `uptime:<p>` (1 h)
  in `src/refresh.ts`, skipped without a call when `monitoring.googleapis.com` is not enabled.
- [ ] T076 [P] [US3] Create fixtures `tests/fixtures/{status-matrix,alerts-open,alerts-none}.json`
  with fake IDs.

**Checkpoint**: all four stories work. Status meets Principle II.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T077 [P] Write `tests/integration/render.e2e.test.ts`. It runs `cli.ts render` with a mocked
  `fetch` serving every `tests/fixtures/api/*` response, and an empty cache, then asserts:
  - a complete menu renders within 2 s of local time;
  - a second run makes zero requests while the cache is fresh, and renders in **under 300 ms**
    (the plan's target). A failure above 1 s means SC-002 is not met;
  - `SWIFTBAR_PLUGIN_REFRESH_REASON=MenuAction` refetches everything (Story 4 #4).
- [ ] T078 [P] Write `tests/integration/degradation.test.ts`. For each source key in turn, make it
  fail. Assert that every other section still renders (SC-005), and that the failed one shows its
  `lastGood` value with its age, or an unavailable reason. Also cover an **all-auth-fail** case,
  where every source fails with `auth`: the title has no amount, the overall status is unknown,
  the "⚠ setup issues" line names the sign-in step, and Shortcuts still render.
- [ ] T079 [P] Write `tests/integration/readonly.test.ts`. Record every request made during the
  e2e run, and assert that each one is GET or BigQuery `queries` POST, and that every BigQuery
  body has `maximumBytesBilled` (SC-006).
- [ ] T080 Run quickstart.md §A on all four documented fixtures, and paste the outputs into the PR
  description.
- [ ] T081 Have the owner run quickstart.md §B on their Mac (install, `doctor`, live menu) and
  record the results in the PR. This is a manual step and the merge gate.
- [ ] T082 [P] Update `specs/001-cloudbar-mvp/research.md` so that every "verify in implement"
  item is marked confirmed or changed, with the fixture path.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: depends on Setup, and blocks every story.
- **US1 (Phase 3)**: depends on Foundational.
- **US4 (Phase 4)**: depends on Foundational. The doctor checks for billing (T041, T043) also use
  the US1 sources, so run it after US1.
- **US2 (Phase 5)**: depends on Foundational. It is independent of US1 and US4, and is scheduled
  after them by request.
- **US3 (Phase 6)**: depends on US2, since status needs the resources.
- **Polish (Phase 7)**: after every story.

### Within each story

1. Verify-in-implement tasks first, since they can change a source's shape.
2. Then tests, which must fail.
3. Then sources [P].
4. Then model (`status.ts`, `view.ts`).
5. Then render.
6. Then registration in `refresh.ts`.

### Files touched by several stories (do these in sequence, never in parallel)

`src/model/status.ts`, `src/model/view.ts`, `src/render/swiftbar.ts`, and `src/refresh.ts`.

## Parallel Examples

```bash
# Foundational tests together
T008 http.guard  |  T009 http.classify  |  T010 cache  |  T011 config  |  T012 format

# US1 sources together (after T027–T031 are written)
T032 billingAccounts.ts  |  T033 costs.ts  |  T034 budgets.ts  |  T039 docs  |  T040 fixtures

# US2 sources together
T057 projects  |  T058 services  |  T059 run  |  T060 sql  |  T061 vertex  |  T062 storage
```

## Implementation Strategy

1. **Setup and Foundational.** Ends with a minimal menu that renders with no credentials.
2. **US1 and US4.** **This is the first installable release**: spend, budget, the setup check, and
   shortcuts. Stop here and let the owner install it (T047, T081 partial).
3. **US2.** Every service is visible with its project, honestly "not monitored".
4. **US3.** Green appears only where monitoring proves it, and alerts are listed.
5. **Polish.** Integration, degradation, and read-only proofs, then the manual check on the Mac.

Commit after each task or logical group, and push at each checkpoint.
