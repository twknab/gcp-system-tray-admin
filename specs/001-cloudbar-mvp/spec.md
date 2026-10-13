# Feature Specification: CloudBar MVP — Google Cloud at a glance in the menu bar

**Feature Branch**: `claude/confident-knuth-4zq72y` (spec directory `001-cloudbar-mvp`)

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "CloudBar MVP: a macOS menu bar dashboard (SwiftBar plugin) that gives a
single owner of a personal set of Google Cloud projects one glanceable, trustworthy view of their
environment — spend, what's running, alerts, overall status — strictly read-only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See this month's spend and overall status at a glance (Priority: P1)

The owner looks at the menu bar and, without clicking, sees a cloud indicator, how much they have
spent so far this month, and one overall status. Opening the menu shows a billing summary:

- spend this month so far
- last month's total
- the monthly budget
- how much of the budget is left
- how old the cost figures are

**Why this priority**: the owner's main worry is an unexpected bill. Showing spend without opening
the Cloud Console is the single most valuable outcome. It is useful even before any per-project
detail exists.

**Independent Test**: point CloudBar at an account with cost data. The title shows month-to-date
spend that matches the Cloud Console billing report for the same period, within normal reporting
lag. The billing summary shows this month, last month, the budget, the remaining amount, and the
data age.

**Acceptance Scenarios**:

1. **Given** cost data is available, **When** the owner glances at the menu bar, **Then** the title
   shows the cloud indicator, month-to-date net spend (after credits) in the account's currency, and
   the overall status.
2. **Given** cost data is available, **When** the owner opens the menu, **Then** the billing summary
   shows month-to-date spend, last month's total, the monthly budget, the remaining amount, and when
   the cost data was last updated.
3. **Given** the billing cost export has **not** been set up, **When** the owner opens the menu,
   **Then** the billing section reads "Costs unavailable", gives a one-line reason, and offers an
   item that opens written setup steps for the owner to follow. The title shows the indicator and
   status but no amount. CloudBar does not set anything up itself.
4. **Given** no monthly budget is configured, **When** the owner opens the billing summary, **Then**
   the budget and remaining lines say "No budget set" instead of showing $0 or leaving the lines out.
5. **Given** month-to-date spend exceeds the budget, **When** the owner views the summary, **Then**
   the remaining amount is shown as overspent, and the overall status is at least degraded.

---

### User Story 2 - Browse projects and what is running in each (Priority: P1)

The owner opens the menu and sees every Google Cloud project they can access, each with a status
marker. Hovering a project opens a submenu with:

- the project's Cloud Run services and their state
- its Cloud SQL instances and their state
- its Vertex AI endpoints
- how many APIs it has enabled
- a link to the project's page in the Cloud Console

**Why this priority**: this is the second half of the "one view" promise. It replaces opening the
console project by project.

**Independent Test**: use an account with at least two projects, one of which has a Cloud Run
service. Every accessible project is listed, the Cloud Run service appears under the right project
with its state, and each console link opens the matching page.

**Acceptance Scenarios**:

1. **Given** the owner can access N projects, **When** they open the Projects section, **Then** the
   section header shows the count N and each project appears once, by its display name, with a
   status marker.
2. **Given** a project has Cloud Run services, Cloud SQL instances, or Vertex AI endpoints, **When**
   the owner opens that project's submenu, **Then** each resource appears under its own heading with
   its current state, and clicking a resource opens its page in the Cloud Console.
3. **Given** a project has none of a resource type, **When** its submenu opens, **Then** that
   heading is either left out or shows a count of 0, and never shows an error.
4. **Given** a resource type cannot be read in a project (the service is not enabled, or permission
   is denied), **When** the submenu opens, **Then** that heading is marked unavailable with a
   plain-language reason ("Cloud SQL API not enabled") and the rest of the submenu displays
   normally.
5. **Given** Vertex AI regions are configured (default `us-central1`), **When** endpoints are
   listed, **Then** only those regions are checked, and the submenu says which regions were checked.

---

### User Story 3 - Know honestly whether anything is broken (Priority: P2)

The owner trusts the status markers because they reflect evidence. Green means a resource is up
**and** monitoring is watching it, with nothing alarming. A resource that is merely deployed or
enabled, with nothing watching it, shows as unknown. An Alerts section lists open alerts, each with
a link. When nothing is open, it says so and shows how many alert policies exist.

**Why this priority**: the status is what makes the dashboard trustworthy instead of decorative. It
depends on Story 2's resource listing, so it comes second.

**Independent Test**: use fixture accounts for four cases: (a) a running service with alert
policies and no open alert, (b) a running service with no monitoring, (c) a service whose latest
deployment failed, and (d) a project with an open alert. These must produce healthy, unknown,
degraded, and down respectively.

**Acceptance Scenarios**:

1. **Given** a resource reports ready or running and its project has active monitoring with no open
   alert, **When** status is computed, **Then** the resource is **healthy**.
2. **Given** a resource reports ready or running but its project has no active alert policy or
   uptime check, **When** status is computed, **Then** the resource is **unknown (not monitored)**,
   never healthy, and its line says "not monitored".
3. **Given** a resource's newest deployment failed while an older version still serves, or an alert
   at warning level is open, **When** status is computed, **Then** the resource or project is
   **degraded**.
4. **Given** a resource reports a failed or stopped-unexpectedly state, or a critical alert is
   open, **When** status is computed, **Then** it is **down**.
5. **Given** alerts are open, **When** the owner opens the Alerts section, **Then** each alert shows
   its name, project, severity, and how long it has been open, and links to the Cloud Console.
6. **Given** no alerts are open, **When** the owner opens the Alerts section, **Then** it reads "No
   open alerts", followed by the number of alert policies across the listed projects.
7. **Given** any mix of project statuses, **When** the overall status is computed, **Then** it is
   the worst status among the listed projects, with one exception: if every project is unknown, the
   overall status is unknown, not healthy.

---

### User Story 4 - Diagnose setup and keep the dashboard working (Priority: P2)

From the menu, the owner can:

- refresh now
- open settings
- run a setup check
- open the Cloud Console

The setup check lists in plain language what works and what is missing, and for each missing item,
what the owner can do about it:

- credentials or sign-in
- permissions
- APIs not enabled in a project
- billing cost export not set up

**Why this priority**: a personal account almost always has gaps. Without this, the owner sees
"unavailable" and cannot fix it. It is needed for a good first run but is not the core value.

**Independent Test**: run the setup check against fixtures with no credentials, missing
permissions, and no cost export. Each problem is named with a concrete next step, and nothing in
the cloud environment changes.

**Acceptance Scenarios**:

1. **Given** the owner is not signed in, **When** they run the setup check, **Then** it says
   credentials are missing and shows the exact sign-in step to run.
2. **Given** the cost export is not set up, **When** the setup check runs, **Then** it explains
   that spend requires it, and gives the owner the steps to set it up themselves, noting that it
   may take some time before data appears.
3. **Given** an API is not enabled in a project, **When** the setup check runs, **Then** it lists
   the project and the API as "not enabled, so this section stays unavailable", and offers a
   console link. It never enables the API.
4. **Given** the owner chooses Refresh, **When** the menu re-renders, **Then** every source is
   fetched fresh regardless of how old the cached data is, and the "Updated" time resets.
5. **Given** the owner chooses Settings, **When** it opens, **Then** they can edit:
   - the monthly budget
   - the cost-data location
   - the Vertex AI regions
   - projects to exclude

---

### Edge Cases

- **No network or a timeout:** the menu still renders from the last good data, with a visible
  "offline, showing data from X ago" note. If there is no cached data at all, the menu shows a
  minimal state: indicator, unknown status, and setup check.
- **Credentials expired mid-month:** the status is unknown, the title omits the amount or marks it
  stale, and the setup check names the sign-in step.
- **Many projects:** the list stays usable. Projects are sorted with the worst status first, then
  by name. The owner can exclude projects in settings.
- **Archived projects or projects with billing disabled:** shown as unknown with the reason
  "billing disabled", or left out if pending deletion.
- **Start of the month:** month-to-date may legitimately be $0.00 or not yet reported. Show the
  amount with its data age, never "unavailable" just because it is small.
- **Credits exceed charges:** net spend can be negative or zero. It is shown as reported.
- **Cost data lag:** the data age is always visible. Cost data more than 48 hours old is labelled
  stale.
- **Two refreshes overlap** (scheduled and manual): only one fetch runs, and the other uses its
  result.
- **More than one billing account:** spend is summed per currency. If currencies differ, each is
  shown separately rather than added.
- **Very long resource names:** truncated in the menu, with the full name available in the
  tooltip.

## Requirements *(mandatory)*

### Functional Requirements

**Menu bar title**

- **FR-001**: The title MUST show a cloud indicator, month-to-date net spend when available, and a
  single overall status (healthy / degraded / down / unknown) as a coloured symbol.
- **FR-002**: When spend is unavailable, the title MUST still show the indicator and status. The
  amount is omitted, never replaced with a fabricated or zero value.

**Billing**

- **FR-003**: The billing summary MUST show month-to-date net spend, last month's total, the
  monthly budget, the remaining amount (or overspend), and when the cost data was last updated.
- **FR-004**: Spend figures MUST come from the account's exported billing cost data, and MUST NOT
  be estimated from resource lists or prices.
- **FR-005**: When the cost export is not available, the billing section MUST say "Costs
  unavailable", give the reason, and link to setup steps the owner performs.

**Projects and resources**

- **FR-006**: The menu MUST list every project the owner can access, minus any excluded in
  settings. Each project shows its display name, a status marker, and a submenu.
- **FR-007**: Each project submenu MUST show:
  - Cloud Run services with their state
  - Cloud SQL instances with their state
  - Vertex AI endpoints in the configured regions
  - the count of enabled APIs
  - a link to the project in the Cloud Console
- **FR-008**: A totals line MUST summarise counts across projects: Cloud Run services, Cloud SQL
  instances, and Vertex AI endpoints.

**Status and alerts**

- **FR-009**: Status MUST be computed by the rules in User Story 3. A resource or project is
  **healthy** only with positive evidence: a ready or running state, active monitoring, and no
  open alert. Deployed or enabled without monitoring MUST be **unknown**.
- **FR-010**: The Alerts section MUST list open alerts with name, project, severity, age, and a
  console link. With none open, it shows "No open alerts" and the count of alert policies.

**Shortcuts and setup check**

- **FR-011**: The menu MUST offer:
  - Refresh, which fetches everything fresh
  - Settings
  - Run setup check
  - Open Cloud Console
- **FR-012**: The setup check MUST report, in plain language, the state of credentials,
  permissions, each needed API per project, and the cost export. Every problem comes with a
  concrete next step the owner can take.

**Reliability and freshness**

- **FR-013**: Each kind of data MUST be kept locally between runs and re-fetched only once it is
  older than its freshness window:
  - alerts: about 5 minutes
  - resource states: about 15 minutes
  - project and API lists: about 1 hour
  - spend: about 4 hours
- **FR-014**: When any single source fails, times out, or is denied, the menu MUST still render
  everything else. That item shows "unavailable" with a reason, plus its last good data and age if
  any exists.
- **FR-015**: The menu MUST display when it was last updated. Any figure older than its freshness
  window MUST be marked stale.

**Read-only and cost safety**

- **FR-016**: CloudBar MUST NOT create, change, delete, start, stop, or enable anything in the
  cloud environment, including APIs, exports, budgets, and notification channels.
- **FR-017**: Reading spend MUST be bounded so that a single refresh cannot read more than a small
  fixed amount of data. A refresh that would exceed the bound fails safely and is reported, rather
  than incurring cost.

**Credentials and settings**

- **FR-018**: CloudBar MUST use the owner's existing Google Cloud sign-in on the machine. It MUST
  NOT ask for, store, or ship credentials or keys of its own.
- **FR-019**: Settings MUST be stored on the owner's machine outside the code repository:
  - monthly budget
  - cost-data location
  - Vertex AI regions (default `us-central1`)
  - excluded projects
- **FR-020**: Status MUST be conveyed by both colour and symbol shape or text, so it is readable
  without colour perception, and in both light and dark menu bar appearance.

### Key Entities

- **Project**: a Google Cloud project the owner can access, with a display name, an identifier,
  whether billing is enabled, the count of enabled APIs, a computed status, and the resources in it.
- **Resource**: a Cloud Run service, Cloud SQL instance, or Vertex AI endpoint, with a type, name,
  location, reported state, computed status, and console link.
- **Billing summary**: month-to-date net spend, last month's net spend, currency, budget, remaining
  amount, and the time the data was last updated. It may instead be unavailable, with a reason.
- **Alert**: an open monitoring incident or alert, with a name, project, severity, opened time, and
  console link. The count of alert policies is kept alongside.
- **Status**: one of healthy, degraded, down, or unknown, with an optional short reason.
- **Source result**: for each kind of data, the value or the failure reason, when it was fetched,
  and whether it is stale.
- **Settings**: budget, cost-data location, Vertex AI regions, and excluded projects.
- **Setup finding**: one checked item with pass, warning, or fail, a plain-language explanation,
  and a next step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can read month-to-date spend and overall status from the menu bar in under
  2 seconds, without clicking.
- **SC-002**: The menu opens and renders in under 1 second when cached data is fresh. A full
  refresh of an account with up to 10 projects completes in under 30 seconds.
- **SC-003**: Month-to-date spend matches the Cloud Console's billing report for the same month to
  within $0.01, allowing for reporting lag.
- **SC-004**: In the fixture scenarios of User Story 3, 100% of resources that are deployed but
  unmonitored are reported as unknown, and 0% are reported as healthy.
- **SC-005**: With any one data source failing, 100% of the other sections still render.
- **SC-006**: Over 30 days of continuous use, CloudBar makes zero changes to the cloud environment,
  and the cost it adds is less than $0.10 per month.
- **SC-007**: A first-time owner goes from installation to a working menu, or a setup-check report
  naming every remaining step, in under 10 minutes.
- **SC-008**: The owner needs to open the Cloud Console for a daily status check on fewer days
  than before. Target: a daily check needs no console visit unless something is degraded or down.

## Assumptions

- There is a single owner using one Mac with SwiftBar installed. Multi-user and team views are out
  of scope.
- The owner already has a working Google Cloud command-line sign-in, and roughly viewer-level
  access (or Owner) on their projects and billing account.
- The billing cost export is probably **not** set up yet. Setting it up is a step the owner
  performs, guided by the setup check. Spend history from before it was enabled may be partial or
  missing, so last month may be unavailable at first.
- Cost data lags real usage by hours. That lag is acceptable as long as the data age is shown.
- The budget figure comes from settings. Reading budgets defined in the cloud account is a possible
  enhancement and is not required.
- **"Monitored"** means the project has at least one enabled alert policy or uptime check. The MVP
  works at project level, not per resource.
- Vertex AI is checked only in the configured regions, defaulting to `us-central1`.
- **Out of scope:**
  - spend forecasts
  - cost per service or per project
  - push-based budget notifications
  - macOS notifications
  - any write actions (start, stop, deploy, enable)
  - resource types other than Cloud Run, Cloud SQL, and Vertex AI endpoints
  - Cloud Storage bucket counts and other extra totals from the original mockup
