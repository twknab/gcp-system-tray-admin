# Feature Specification: CloudBar MVP — Google Cloud at a glance in the menu bar

**Feature Branch**: `claude/confident-knuth-4zq72y` (spec directory `001-cloudbar-mvp`)

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "CloudBar MVP: a macOS menu bar dashboard (SwiftBar plugin) that gives a
single owner of a personal set of Google Cloud projects one glanceable, trustworthy view of their
environment — spend, what's running, alerts, overall status — strictly read-only."

## Clarifications

### Session 2026-10-13

- Q: What counts as "monitored" for a resource? → A: Per resource type within a project. A
  policy for a type covers all resources of that type in the project. The menu leads with
  resources grouped by service type, each labelled with its project. A view organised by project
  comes later.
- Q: Where does the monthly budget come from? → A: Only from the budgets defined on the billing
  account in Google Cloud. If none exist, CloudBar shows "No budget set". There is no local
  budget setting.
- Q: Which billing accounts count towards spend? → A: Every billing account visible to the owner's
  sign-in. Totals are per currency. Any account whose costs can't be read makes the total "partial".
- Q: When is cost data stale? → A: After 24 hours. Stale data gets a label on the spend figures
  only, and the overall status is unaffected.
- Q: Should Cloud Storage buckets be in the MVP? → A: Yes, as a full group. Each bucket shows its
  project, location, and size; the header shows the total size. Buckets show as unknown (not
  monitored) unless an alert is open.

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
4. **Given** no budget is defined on the billing account in Google Cloud, **When** the owner opens
   the billing summary, **Then** the budget and remaining lines say "No budget set", with a link to
   the console's Budgets page. They never show $0, and they are not left out.
5. **Given** a budget is defined on the billing account in Google Cloud, **When** the owner opens
   the billing summary, **Then** the budget amount shown is that budget's monthly amount, labelled
   with the budget's name. CloudBar only reads it and never creates or edits budgets.
6. **Given** month-to-date spend exceeds the budget, **When** the owner views the summary, **Then**
   the remaining amount is shown as overspent, and the overall status is at least degraded.

---

### User Story 2 - See everything I'm using, with its status and project (Priority: P1)

The owner opens the menu and sees the things they actually run, grouped by kind of service:

- Cloud Run services
- Cloud SQL instances
- Vertex AI endpoints
- Cloud Storage buckets, each with its size, and the total size in the group header

Each item shows its name, a status marker, and the project it belongs to. Hovering an item opens a
small submenu with its state, location, project, and a link to its page in the Cloud Console. Each
group header shows how many items it holds and the worst status among them.

A view organised by project, with every resource listed under its project, is a later enhancement.
The MVP leads with services because the owner's question is "is the stuff I use OK?", and project
is shown as a label on each item.

**Why this priority**: this is the second half of the "one view" promise. It replaces opening the
console service by service and project by project.

**Independent Test**: use an account with two projects, one with a Cloud Run service and one with
a Cloud SQL instance. Each resource appears under its service group with its state and its
project's display name, and each console link opens the matching page.

**Acceptance Scenarios**:

1. **Given** the owner has resources across several projects, **When** they open the menu, **Then**
   resources are grouped by service type (Cloud Run, Cloud SQL, Vertex AI). Each group header
   shows a count and the group's worst status. Each item shows its name, status marker, and project
   display name.
2. **Given** a resource is listed, **When** the owner hovers it, **Then** a submenu shows its
   reported state, location, project, status reason, and a link that opens it in the Cloud Console.
3. **Given** no project has a given resource type, **When** the menu renders, **Then** that group
   is left out entirely, and no error is shown.
4. **Given** a resource type cannot be read in some project (the service is not enabled, or
   permission is denied), **When** the menu renders, **Then** that group lists everything it could
   read, plus one line such as "Unavailable in 2 projects" whose submenu names each project and
   reason. The rest of the menu displays normally.
5. **Given** Vertex AI regions are configured (default `us-central1`), **When** endpoints are
   listed, **Then** only those regions are checked, and the Vertex AI group says which regions
   were checked.
6. **Given** the owner can access N projects, **When** they open the menu, **Then** a single
   "Projects (N)" line is shown. Its submenu lists each project with a console link and its count
   of enabled APIs. This is a reference list, not the project view deferred above.

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

1. **Given** a resource reports ready or running, and its project has an active alert policy or
   uptime check covering that resource's **type** (for example, any Cloud Run policy for a Cloud
   Run service), with no open alert, **When** status is computed, **Then** the resource is
   **healthy**.
2. **Given** a resource reports ready or running, but its project has no active alert policy or
   uptime check covering that resource's type, **When** status is computed, **Then** the resource
   is **unknown (not monitored)**, never healthy, and its line says "not monitored". This holds
   even if the project monitors other resource types.
3. **Given** a resource's newest deployment failed while an older version still serves, or an alert
   at warning level is open, **When** status is computed, **Then** the resource or project is
   **degraded**.
4. **Given** a resource reports a failed or stopped-unexpectedly state, or a critical alert is
   open, **When** status is computed, **Then** it is **down**.
5. **Given** alerts are open, **When** the owner opens the Alerts section, **Then** each alert shows
   its name, project, severity, and how long it has been open, and links to the Cloud Console.
6. **Given** no alerts are open, **When** the owner opens the Alerts section, **Then** it reads "No
   open alerts", followed by the number of alert policies across the listed projects.
7. **Given** any mix of resource statuses, **When** the overall status is computed, **Then**:
   - it is **down** if anything is down;
   - otherwise **degraded** if anything is degraded, including spend over budget;
   - otherwise **healthy** if at least one resource is healthy;
   - otherwise **unknown**.

   Unknown items never pull the overall status down, and never make it look healthy on their own.
8. **Given** a Cloud Storage bucket exists, **When** status is computed, **Then** it is **unknown
   (not monitored)**, because buckets have no running state to report. If an open alert names
   the bucket's project and storage, it is **degraded** or **down** by that alert's severity. A
   bucket is never shown as healthy.

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
   - the cost-data location for each billing account
   - the Vertex AI regions
   - projects to exclude

---

### Edge Cases

- **No network or a timeout:** the menu still renders from the last good data, with a visible
  "offline, showing data from X ago" note. If there is no cached data at all, the menu shows a
  minimal state: indicator, unknown status, and setup check.
- **Credentials expired mid-month:** the status is unknown, the title omits the amount or marks it
  stale, and the setup check names the sign-in step.
- **Many resources or projects:** within each service group, items are sorted worst status
  first, then by project, then by name. The owner can exclude projects in settings.
- **A group with more than 25 items** (common for buckets): the first 25 are shown in sort order,
  followed by "and N more", which links to that service's console page. The header count and
  total size still cover every item.
- **A newly created bucket** whose size isn't reported yet shows "size pending" and is left out
  of the total, with the total labelled partial.
- **Same resource name in two projects:** both are listed. The project label tells them apart.
- **Archived projects or projects with billing disabled:** shown as unknown with the reason
  "billing disabled", or left out if pending deletion.
- **Start of the month:** month-to-date may legitimately be $0.00 or not yet reported. Show the
  amount with its data age, never "unavailable" just because it is small.
- **Several budgets on one billing account:** a budget scoped to the whole billing account is
  preferred over budgets scoped to particular projects or services. If more than one remains, each
  is shown on its own line with its name. Their amounts are not added together.
- **Budget set to "last month's spend":** the amount shown is last month's net spend from the cost
  data, labelled as such. If last month is unavailable, it shows "Budget amount unavailable".
- **Budgets cannot be read** (missing permission or API not enabled): the budget lines show
  "Unavailable" with the reason, and the setup check names the fix. Spend still displays.
- **Credits exceed charges:** net spend can be negative or zero. It is shown as reported.
- **Cost data lag:** the data age is always visible. Cost data more than **24 hours** old is
  labelled stale on the spend figures. Stale cost data does **not** change the overall status,
  which reflects only whether services are working.
- **Two refreshes overlap** (scheduled and manual): only one fetch runs, and the other uses its
  result.
- **More than one billing account:** the header total covers **every** billing account the owner's
  sign-in can see. Amounts are summed per currency; if currencies differ, each is shown separately
  rather than added. The billing summary has a submenu listing each account's month-to-date and
  last-month spend, and its budget.
- **Some billing accounts have no cost export:** accounts without readable cost data are listed as
  "Costs unavailable" with the reason. The total covers only the accounts that could be read, and
  is labelled "partial (2 of 3 accounts)" so it is never mistaken for the full figure.
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
- **FR-022**: Spend totals MUST cover every billing account visible to the owner's sign-in, not
  only the accounts linked to listed projects. A total that omits any visible account MUST be
  labelled partial and name how many accounts it covers.
- **FR-004**: Spend figures MUST come from the account's exported billing cost data, and MUST NOT
  be estimated from resource lists or prices.
- **FR-005**: When the cost export is not available, the billing section MUST say "Costs
  unavailable", give the reason, and link to setup steps the owner performs.

- **FR-021**: The budget MUST be read from the budget definitions on the owner's billing account in
  Google Cloud. If none exist, CloudBar shows "No budget set". It MUST NOT create or change
  budgets.

**Projects and resources**

- **FR-006**: The menu MUST group resources by service type: Cloud Run services, Cloud SQL
  instances, Vertex AI endpoints in the configured regions, and Cloud Storage buckets. Each group
  header shows its count and its worst status. Each item shows its name, status marker, and project display name.
  Projects excluded in settings are left out. Groups with no items are omitted.
- **FR-007**: Each resource's submenu MUST show its reported state, location, project, status
  reason, and a link to its page in the Cloud Console.
- **FR-023**: The Cloud Storage group MUST show each bucket's project, location, and stored size.
  The group header shows the total stored size across all listed buckets, in readable units (for
  example "8 buckets · 412 GB"). Size figures may be up to a day old. They are labelled with their
  as-of date and count as stale after 48 hours. A bucket whose size cannot be read shows "size
  unavailable", and the total is labelled partial.
- **FR-008**: The menu MUST include a "Projects (N)" reference line. Its submenu lists each
  accessible project with a console link and its count of enabled APIs. A view that lists each
  project's resources beneath it is deferred to a later feature.

**Status and alerts**

- **FR-009**: Status MUST be computed by the rules in User Story 3. A resource is **healthy**
  only with positive evidence: a ready or running state, plus an active alert policy or uptime
  check in its project covering its **resource type**, and no open alert. Deployed or enabled
  without monitoring of its type MUST be **unknown**.
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
- **FR-015**: The menu MUST display when it was last updated. A figure MUST be marked stale in
  either of two cases:
  - its last successful fetch is older than its freshness window, for example because refreshes
    keep failing;
  - for spend only, the cost data itself is more than 24 hours old, even if it was fetched just
    now.

  Staleness never changes the overall status.

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
  - cost-data location for each billing account
  - Vertex AI regions (default `us-central1`)
  - excluded projects
- **FR-020**: Status MUST be conveyed by both colour and symbol shape or text, so it is readable
  without colour perception, and in both light and dark menu bar appearance.

### Key Entities

- **Project**: a Google Cloud project the owner can access, with a display name, an identifier,
  whether billing is enabled, and the count of enabled APIs. In the MVP it appears as a label on
  each resource and in the Projects reference list.
- **Resource**: a Cloud Run service, Cloud SQL instance, Vertex AI endpoint, or Cloud Storage
  bucket (which also carries its stored size and the size's as-of date), with a type, name,
  location, owning project, reported state, computed status with reason, and console link.
- **Billing account**: an account visible to the owner, with its name, currency, its own spend
  figures, its budgets, and whether its cost data is readable.
- **Billing summary**: totals across all visible billing accounts. Month-to-date net spend, last month's net spend, currency, budget, remaining
  amount, and the time the data was last updated. It may instead be unavailable, with a reason.
- **Alert**: an open monitoring incident or alert, with a name, project, severity, opened time, and
  console link. The count of alert policies is kept alongside.
- **Status**: one of healthy, degraded, down, or unknown, with an optional short reason.
- **Source result**: for each kind of data, the value or the failure reason, when it was fetched,
  and whether it is stale.
- **Settings**: cost-data location per billing account, Vertex AI regions, and excluded projects.
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
- The budget comes **only** from budgets defined on the billing account in Google Cloud. It is read,
  never written. There is no budget setting in CloudBar.
- **"Monitored"** is judged per **resource type** within a project. A Cloud Run policy or uptime
  check covers every Cloud Run service in that project; a Cloud SQL policy covers every Cloud SQL
  instance. Matching individual resources to policies is not attempted in the MVP.
- Vertex AI is checked only in the configured regions, defaulting to `us-central1`.
- **Out of scope:**
  - spend forecasts
  - cost per service or per project
  - push-based budget notifications
  - macOS notifications
  - any write actions (start, stop, deploy, enable)
  - resource types other than Cloud Run, Cloud SQL, Vertex AI endpoints, and Cloud Storage buckets
  - per-object listings or storage cost breakdowns for buckets
  - a view that lists each project's resources beneath it (planned as a follow-up feature)
