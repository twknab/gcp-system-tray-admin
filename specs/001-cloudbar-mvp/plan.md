# Implementation Plan: CloudBar MVP — Google Cloud at a glance in the menu bar

**Branch**: `claude/confident-knuth-4zq72y` (spec `001-cloudbar-mvp`) | **Date**: 2026-10-13 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-cloudbar-mvp/spec.md`

## Summary

CloudBar is a SwiftBar plugin. A shell shim runs a small compiled TypeScript CLI, which:

- reads the owner's Google Cloud environment through the official REST APIs, using their existing
  gcloud sign-in;
- caches each data source locally with its own freshness window;
- prints SwiftBar menu text.

The title shows month-to-date net spend across every visible billing account, plus one overall
status. The menu shows:

- **Billing:** month-to-date, last month, budget from the cloud budget definitions, amount
  remaining, and data age.
- **Services:** Cloud Run, Cloud SQL, Vertex AI, and Cloud Storage. Each item is labelled with its
  project. Status comes from per-type monitoring evidence.
- **Alerts.**
- **A projects reference list.**
- **Shortcuts.**

Spend comes only from the billing cost export in BigQuery, through partition-filtered queries
capped by `maximumBytesBilled`. Everything is read-only. The design splits into impure fetchers
and pure model and render layers, so nearly all behaviour is tested from fixtures.

## Technical Context

**Language/Version**: TypeScript 5.x in `strict` mode on Node.js 22 or later, compiled with `tsc`
to ES2022 ESM in `dist/`.

**Primary Dependencies**: `google-auth-library`, for Application Default Credentials. The fallback
is `gcloud auth print-access-token`. Google APIs are called over REST with Node's global `fetch`.
There are no `@google-cloud/*` packages.

**Storage**:

- Cache: a JSON file in `$SWIFTBAR_PLUGIN_CACHE_PATH`, falling back to `~/Library/Caches/cloudbar`.
- Config: `~/.config/cloudbar/config.json`, created by the user. The repo ships only an example.

**Testing**: vitest. Unit tests cover the pure modules. Fetcher tests use recorded JSON fixtures
behind an injected `fetch`. Render tests use snapshots.

**Target Platform**: macOS 13 or later with SwiftBar 2.x. CI and development run on Linux and
macOS with Node 22.

**Project Type**: a single-package CLI, wrapped as a SwiftBar plugin.

**Performance Goals**:

- Rendering from a fresh cache takes under 300 ms of wall time.
- A full refresh of 10 projects takes under 30 s (SC-002).
- Requests run in parallel, capped at 8 at a time.

**Constraints**:

- Read-only (FR-016).
- Each BigQuery job has `maximumBytesBilled` set to 1 GiB (FR-017).
- Each HTTP request times out after 10 s.
- The cache always yields a renderable menu.
- No secrets are written to the repository.

**Scale/Scope**:

- One owner, up to about 50 projects, and a handful of billing accounts.
- Up to about 200 resources in total.
- Each menu group is capped at 25 visible items.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Pre-design | Post-design |
|-----------|------|------------|-------------|
| I. Read-only & No New Cost | Only `GET`/`list` calls, plus BigQuery `jobs.query` with `maximumBytesBilled` and a partition filter. No `enable`, `create`, `patch`, or `delete` anywhere. | ✅ | ✅ The HTTP client allows `GET`; the only `POST` it permits is to `bigquery…/projects/*/queries`, a read-only `SELECT` with a dry-run check first. Enforced by a unit test. |
| II. Honest Status | Healthy needs a ready state, plus monitoring covering the resource type, plus no open alert. Buckets are never healthy. Every figure carries an `asOf`. | ✅ | ✅ `model/status.ts` is pure and fully table-tested against FR-009 and Story 3. |
| III. Graceful Degradation | One source's failure never blanks the menu. | ✅ | ✅ Each source returns a `SourceResult<T>` (ok, error, or stale). Rendering takes the union. |
| IV. Lightweight & Testable | One runtime dependency. Pure model and render layers. | ✅ | ✅ |
| V. Credentials out of repo | ADC only. Config lives in `~/.config`. Fixtures use fake IDs. | ✅ | ✅ A `.gitignore` excludes `config.json`, and fixtures are linted for real-looking IDs. |

There are no violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-cloudbar-mvp/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── config.schema.json     # ~/.config/cloudbar/config.json
│   ├── cli.md                 # cloudbar render | refresh | doctor
│   └── swiftbar-output.md     # menu layout + line grammar
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
cloudbar.5m.sh            # SwiftBar shim: metadata tags, locates node, execs dist/cli.js
package.json              # type: module; scripts: build, typecheck, test, lint
tsconfig.json
config.example.json
src/
├── cli.ts                # arg parsing → render | refresh | doctor
├── config.ts             # load + validate config (hand-rolled validator, no zod)
├── auth.ts               # ADC token via google-auth-library; gcloud fallback; quota project
├── http.ts               # fetch wrapper: timeout, retry-once on 429/5xx, read-only guard, error classify
├── cache.ts              # JSON cache, per-source TTL, lock file, atomic write
├── refresh.ts            # orchestrates sources with concurrency limit → Snapshot
├── sources/              # one module per source; each returns SourceResult<T>
│   ├── projects.ts       # Resource Manager v3 projects.search
│   ├── services.ts       # Service Usage enabled-API counts
│   ├── billingAccounts.ts# Cloud Billing: accounts + project billing info
│   ├── costs.ts          # BigQuery export query (MTD, last month, exportTime)
│   ├── budgets.ts        # Budget API read
│   ├── run.ts            # Cloud Run v1 global list (v2 per-region fallback)
│   ├── sql.ts            # Cloud SQL Admin instances
│   ├── vertex.ts         # Vertex AI endpoints per configured region
│   ├── storage.ts        # buckets.list + total_bytes metric
│   └── monitoring.ts     # v3 alerts (state=OPEN), alert policies, uptime checks → coverage
├── model/
│   ├── types.ts          # Snapshot, Resource, Status, SourceResult, …
│   ├── status.ts         # PURE: resource/group/overall status rules
│   └── view.ts           # PURE: Snapshot → ViewModel (sorting, caps, partial labels)
├── render/
│   ├── swiftbar.ts       # PURE: ViewModel → SwiftBar lines
│   └── format.ts         # money, bytes, relative time
└── doctor.ts             # setup checks → findings → text (also rendered as SwiftBar)
tests/
├── fixtures/             # fake-ID API responses + snapshots (healthy, degraded, no-export, denied)
├── unit/                 # status, view, format, config, http guard
├── sources/              # each fetcher against fixture responses
└── render/               # SwiftBar output snapshots
docs/
└── billing-export-setup.md   # owner-performed steps (linked from menu + doctor)
```

**Structure Decision**: a single package. Code is split into **sources** (which talk to the
network and are impure), **model** (pure), and **render** (pure). Only `sources/`, `auth.ts`,
`http.ts`, and `cache.ts` touch I/O.

## Glossary

- **Setup check** (as the menu and spec call it) and **`doctor`** (the CLI command and
  `src/doctor.ts`) are the same feature.

## Key Design Decisions

1. **The cache is read first, and refreshes are short and bounded.**
   - Each SwiftBar run loads the cache and works out which sources are past their TTL (FR-013).
   - It refreshes only those, all in parallel, within an overall 25-second budget, then renders.
   - A source that misses the budget keeps its last good value, marked stale.
   - With `SWIFTBAR_PLUGIN_REFRESH_REASON=MenuAction` or `cloudbar refresh`, every TTL is ignored
     (Story 4 #4).
   - A lock file (`O_EXCL` create, with a 60-second stale-lock override) stops overlapping runs. A
     second run renders from the cache without fetching.
2. **Every source returns a `SourceResult<T>`:** `{ ok: true, data, fetchedAt }` or
   `{ ok: false, reason, kind: 'disabled'|'denied'|'timeout'|'network'|'auth'|'other', lastGood? }`.
   The classifier in `http.ts` maps a 403 with `SERVICE_DISABLED` to `disabled`, and other 403s to
   `denied`.
3. **Status lives in one pure function per level**: resource, then group, then overall. The rules
   follow spec Story 3 #1–8 and FR-009. Monitoring coverage is a set of `(projectId, resourceType)`
   pairs, built from alert policies and uptime checks.
4. **Spend.** For each visible billing account whose export table is configured or found, one
   BigQuery query per refresh runs:
   - It returns month-to-date and last-month net cost by `invoice.month`, plus
     `MAX(export_time)`.
   - It uses a partition filter, `maximumBytesBilled`, and a dry run on the first call.
   - Totals are summed per currency. The total is partial if any visible account is unreadable.
5. **Reading a budget never writes anything.** A `lastPeriodAmount` budget is resolved from the
   last-month figure.
6. **Rendering is plain data in, text out.**
   - `render/swiftbar.ts` takes a `ViewModel` and returns `string[]`, with no I/O.
   - Status shows as an SF Symbol plus a colour plus a text label (FR-020).
   - Icons: `checkmark.circle.fill` green, `exclamationmark.triangle.fill` yellow, `xmark.octagon.fill`
     red, `questionmark.circle` grey.
7. **The setup check, `doctor`, reuses the same sources.** It runs each one once and turns every
   failure into a plain-English finding with a next step. It never enables anything (Story 4).

## Research outcomes that changed the design

See `research.md`.

- **R1:** a public API for open alerts exists, so alert status no longer depends on a fallback.
- **R4:** the Cloud Run v2 list rejects the `-` location wildcard. CloudBar uses the v1 global
  endpoint, with v2 per region as the fallback.
- **R5:** Cloud SQL has no `STOPPED` state. Stopped means `RUNNABLE` plus `activationPolicy=NEVER`.
- **R10:** export tables must be named in config. CloudBar does not discover them. It also runs a
  dry run before the first real query.
- **R13:** with user credentials, every request carries `x-goog-user-project`, and the setup check
  validates the quota project.

Items marked "verify in implement" in research.md each get a task: capture a real fixture
and confirm.

## Complexity Tracking

None.
