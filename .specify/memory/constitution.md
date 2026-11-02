<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Principles defined:
  I. Read-only & No New Cost
  II. Honest Status
  III. Graceful Degradation
  IV. Lightweight & Testable
  V. Credentials Stay Out of the Repo
- Added sections: Operating Constraints, Development Workflow, Governance
- Removed sections: none
- Templates:
  ✅ .specify/templates/plan-template.md (generic "Constitution Check" gate; no edit needed)
  ✅ .specify/templates/spec-template.md (no mandatory-section change)
  ✅ .specify/templates/tasks-template.md (no principle-driven task type removed)
- Deferred TODOs: none
-->

# CloudBar Constitution

CloudBar is a read-only macOS menu bar dashboard (a SwiftBar plugin, written in TypeScript on
Node.js) that gives one person a single view of their personal Google Cloud environment.

## Core Principles

### I. Read-only & No New Cost

- CloudBar MUST NOT create, modify, or delete any Google Cloud resource.
- CloudBar MUST NOT enable APIs, billing exports, budgets, or notification channels.
- Every BigQuery query MUST filter on the table's partition and set `maximumBytesBilled`, so a
  query that would scan more than expected fails instead of billing.
- A capability that needs new infrastructure, such as turning on the billing export, MUST be
  documented as a step the user performs. It is never automated.

**Rationale:** the tool watches the account. If it could change the account or run up a bill,
the user could no longer trust it to run every few minutes unattended.

### II. Honest Status

- A resource being "deployed" or an API being "enabled" MUST NOT be reported as "healthy".
- Green (🟢) requires positive evidence: the resource reports a ready or running state **and**
  monitoring covers it, with no open alert.
- Unknown, unmonitored, and permission-denied states MUST render as unknown (⚪), never green.
- Every number shown MUST state how old its data is.
- Spend MUST come only from the Cloud Billing export in BigQuery. The Cloud Billing API does not
  report actual costs and MUST NOT be used to infer them.

**Rationale:** a dashboard that shows green by default teaches people to ignore it. Unknown has
to look different from fine.

### III. Graceful Degradation

- A data source that fails, is slow, or returns 403 MUST NOT blank or block the menu.
- When a source fails, the menu shows the last good cached data with its age, plus a plain-English
  reason ("Monitoring API not enabled in project X").
- Every network call has a timeout. The menu MUST always render, even with no network.

**Rationale:** a personal account always has some projects with an API turned off or a missing
role. That is the normal case, not an error.

### IV. Lightweight & Testable

- Runtime dependencies are limited to `google-auth-library` and Node built-ins. Google APIs are
  called over REST with `fetch`. Adding any other runtime dependency requires a written
  justification in the plan.
- The status logic and the SwiftBar rendering MUST be pure functions, covered by tests that run
  from fixtures.
- Cold start MUST stay fast, because SwiftBar runs the script every few minutes.

**Rationale:** the client packages pull in gRPC and many megabytes of code, which suits a server,
not a script that starts every few minutes. Pure functions keep almost every test off the network.

### V. Credentials Stay Out of the Repo

- Authentication MUST use Application Default Credentials or the user's existing gcloud login.
- Keys, tokens, billing account IDs, and project IDs MUST NOT be committed. Test fixtures use
  obviously fake identifiers.
- User configuration lives in the user's home directory (`~/.config/cloudbar/`), never in the
  repository.

**Rationale:** the repository may become public. The user's account identity must not be in it.

## Operating Constraints

- **Target:** macOS with SwiftBar. The output follows SwiftBar's plugin format: a header line,
  `---` separators, `--` for each nested submenu level, and `|` line parameters such as
  `sfimage=`, `href=`, `bash=`, and `refresh=`.
- **Runtime:** Node.js 22 or later, TypeScript in strict mode.
- **Caching:** results are cached in SwiftBar's per-plugin cache directory, with a TTL per data
  source. A manual refresh may bypass the TTL.
- **IAM:** only viewer-level permissions are assumed.

## Development Workflow

- Non-trivial features go through Spec Kit: specify → clarify → plan → tasks → analyze →
  implement. The artifacts live in `specs/<NNN-feature>/`.
- `npm run typecheck` and `npm test` MUST pass before any push.
- Every pull request description MUST state that it complies with Principles I and II, or name the
  deviation and justify it.

## Governance

- This constitution overrides other practice documents in this repository.
- Amendments are made by pull request, editing this file and bumping its version:
  - **MAJOR:** a principle is removed or redefined.
  - **MINOR:** a principle or section is added, or guidance is materially expanded.
  - **PATCH:** clarifications and wording only.
- Reviewers check the plan's Constitution Check against these principles. Any added complexity
  is recorded in the plan's Complexity Tracking table.

**Version**: 1.0.0 | **Ratified**: 2026-10-13 | **Last Amended**: 2026-10-13
