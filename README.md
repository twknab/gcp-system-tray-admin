# CloudBar

A read-only Google Cloud dashboard for the macOS menu bar, built as a
[SwiftBar](https://github.com/swiftbar/SwiftBar) plugin in TypeScript.

```
✓☁︎ $24.82
───────────────
Billing
October to date   $24.82
September         $31.45
Budget “Monthly cap” $50.00 · $25.18 left
Cost data as of 3h ago
───────────────
Cloud Run (4)              ✓
  api · Hughes Intelligence ✓
Cloud SQL (1)              ?  not monitored
Cloud Storage (8 buckets · 412 GB)
───────────────
Alerts: No open alerts · 7 policies
Projects (6)
───────────────
Updated 3m ago · Refresh · Run setup check… · Settings…
```

## What it promises

- **Read-only.** CloudBar never creates, changes, deletes, starts, stops or **enables** anything.
  Every request goes through a guard that allows only `GET`, plus BigQuery `SELECT` queries
  (`src/http.ts`, tested in `tests/unit/http.guard.test.ts`).
- **No new cost to speak of.** Spend comes from your billing export in BigQuery. Every query is
  filtered to recent partitions and capped with `maximumBytesBilled` (1 GiB by default), so an
  unexpectedly large query fails for free instead of billing you.
- **Honest status.** ✓ green appears only when a resource is up **and** monitoring covers its
  type, with no open alert. Something that is deployed but not watched shows `?` "not monitored".
  Every number shows how old it is.
- **Degrades gracefully.** A failing, slow or permission-denied source shows "unavailable" with a
  reason. Everything else still renders.
- **No credentials of its own.** It uses your existing gcloud sign-in (Application Default
  Credentials). Config lives in `~/.config/cloudbar/`, never in this repo.

## Install

Prerequisites: macOS with SwiftBar (`brew install --cask swiftbar`), Node.js 22+, and the gcloud
CLI.

```bash
# 1. Sign in (your own account; nothing is stored by CloudBar)
gcloud auth application-default login
gcloud auth application-default set-quota-project <a-project-you-own>

# 2. Build
git clone https://github.com/twknab/gcp-system-tray-admin ~/Development/cloudbar
cd ~/Development/cloudbar && npm ci && npm run build

# 3. Configure
mkdir -p ~/.config/cloudbar && cp config.example.json ~/.config/cloudbar/config.json
#    edit it: billing export tables, quota project, Vertex AI regions, projects to exclude

# 4. Check setup
node dist/cli.js doctor

# 5. Add to SwiftBar (symlink into your SwiftBar plugin folder)
ln -s "$PWD/cloudbar.5m.sh" "<SwiftBar plugin folder>/cloudbar.5m.sh"
```

Spend needs the **billing export to BigQuery**, which you turn on yourself. See
[docs/billing-export-setup.md](docs/billing-export-setup.md). Until then the menu shows "Costs
unavailable" and everything else still works.

## Roles

Viewer-level access is enough. As the owner of your projects you already have all of this.

| What | Role |
|------|------|
| Projects, Cloud Run, Cloud SQL, Vertex AI, buckets, enabled APIs | `roles/viewer` on each project (or the specific viewer roles, e.g. `roles/run.viewer`, `roles/cloudsql.viewer`, `roles/aiplatform.viewer`, `roles/serviceusage.serviceUsageViewer`, plus `storage.buckets.list`) |
| Alerts, alert policies, uptime checks, bucket sizes | `roles/monitoring.viewer` |
| Billing accounts and budgets | `roles/billing.viewer` on the billing account |
| Spend from the export | `roles/bigquery.dataViewer` on the export dataset, and `roles/bigquery.jobUser` on the quota project |
| Quota project | `serviceusage.services.use` on it (part of Owner/Editor, or `roles/serviceusage.serviceUsageConsumer`) |

## Configuration

`~/.config/cloudbar/config.json` (schema: `specs/001-cloudbar-mvp/contracts/config.schema.json`):

| Key | Default | Meaning |
|-----|---------|---------|
| `billingExports` | `{}` | billing account ID → `project.dataset.gcp_billing_export_v1_…` |
| `quotaProject` | ADC's quota project | sent as `x-goog-user-project`; also runs the BigQuery job |
| `vertexRegions` | `["us-central1"]` | regions checked for Vertex AI endpoints |
| `runRegions` | `["us-central1"]` | fallback regions if the global Cloud Run list is unavailable |
| `excludeProjects` | `[]` | project IDs to hide |
| `maxBytesBilled` | `1073741824` | hard cap per BigQuery job |
| `ttlOverrides` | see schema | per-source refresh intervals, in seconds |
| `nodePath` | auto | node binary for the SwiftBar shim |

## Commands

```bash
node dist/cli.js                       # render the menu (what SwiftBar runs)
node dist/cli.js refresh               # refetch everything now
node dist/cli.js doctor                # setup check; exits 1 if something needs fixing
node dist/cli.js render --fixture healthy   # render a test fixture, no network
```

## Development

```bash
npm ci
npm run lint        # typecheck + fixture ID check
npm test            # vitest: units, sources against fixtures, menu snapshots
npm run build
node scripts/build-fixtures.mjs   # regenerate tests/fixtures/*.json
```

The feature was built with Spec Kit: `specs/001-cloudbar-mvp/` has the spec, plan, research, data
model, contracts and tasks. The project principles are in `.specify/memory/constitution.md`.
