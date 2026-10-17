# Research: CloudBar MVP

Sources: official Google Cloud documentation (now hosted on `docs.cloud.google.com`) and the
SwiftBar repository README and source, read on 2026-10-13. Items marked **verify in implement**
were not confirmed on a doc page. They must be confirmed against a real response, captured as a
fixture, before the related task is closed.

## R1. Open alerts

- **Decision:** use `GET https://monitoring.googleapis.com/v3/projects/{p}/alerts?filter=state="OPEN"`.
  - Page with `pageSize=1000` and `pageToken`.
  - Use from each `Alert`: `name`, `openTime`, `resource.type` and `resource.labels`, and the
    `policy` snapshot (`displayName`, `severity`).
- **Severity mapping:** `CRITICAL` and `ERROR` mean down. `WARNING` and unset mean degraded.
- **Rationale:** a public method exists. It gives open state directly, plus the monitored-resource
  type, so an alert can be tied to a resource type without parsing anything.
- **Policy count:** `GET …/v3/projects/{p}/alertPolicies` supplies the "N policies" figure and the
  monitoring coverage (R3).
- **Gotchas:**
  - The method page gives no launch stage, and gcloud exposes it only under alpha and beta.
  - The source is therefore wrapped like every other one. A failure leaves the Alerts section
    showing "Alerts unavailable: <reason>" and never hides policies.
  - The role is `roles/monitoring.viewer` or `roles/monitoring.alertViewer`. The exact permission
    string is **verify in implement**.
- **Alternatives considered:**
  - Alert policies plus our own time-series evaluation. Rejected: it reimplements alerting and
    gets it subtly wrong.
  - Pub/Sub notification channels. Rejected: they require new infrastructure (Principle I).

## R2. Uptime checks

- **Decision:** `GET …/v3/projects/{p}/uptimeCheckConfigs` is used only as **coverage evidence**.
  A config whose `monitoredResource.type` is `cloud_run_revision` adds `(project, run)` to the
  coverage set. `uptime_url` checks are not mapped to a type in the MVP.
- **Gotcha:** configs carry no pass or fail state. Failures arrive through alert policies, which
  R1 already covers. Reading `uptime_check/check_passed` time series is deferred.

## R3. Mapping an alert policy to a resource type

- **Decision:** scan every condition of every **enabled** policy:
  - `conditionThreshold.filter` and `conditionAbsent.filter` with
    `/resource\.type\s*=\s*["']([^"']+)["']/`.
  - `conditionMonitoringQueryLanguage.query` with `/fetch\s+([a-z0-9_.\/]+)/i`.
  - `conditionPrometheusQueryLanguage.query` with `monitored_resource="…"`, falling back to the
    metric prefix (`run_googleapis_com:` means run, `cloudsql_googleapis_com:` means sql, and so
    on).
- **Mapping to types:**

  | Monitored resource | CloudBar type |
  |--------------------|---------------|
  | `cloud_run_revision`, `cloud_run_job` | run |
  | `cloudsql_database`, `cloudsql_instance_database` | sql |
  | `aiplatform.googleapis.com/Endpoint` | vertex |
  | `gcs_bucket` | storage |
  | anything else | ignored |

- **Rationale:** this is the standard filter grammar. A policy that can't be mapped covers nothing,
  which is the honest default.
- **Verify in implement:** capture real policy fixtures for each of the three condition kinds.

## R4. Cloud Run

- **Finding:** the v2 `projects.locations.services.list` method **rejects the `-` location
  wildcard**, so listing would mean one call per region.
- **Decision:** list with the v1 global endpoint,
  `GET https://run.googleapis.com/apis/serving.knative.dev/v1/namespaces/{projectId}/services`.
  It returns services across regions; regions it could not reach come back in `unreachable[]`.
  - Use `metadata.name` and the `metadata.labels["cloud.googleapis.com/location"]` label.
  - Use `status.conditions[type=Ready]`, which has `status` (`True`, `False`, or `Unknown`),
    `reason`, and `message`.
  - Use `status.latestReadyRevisionName`, `status.latestCreatedRevisionName`, and `status.url`.
  - Cross-region listing is **verify in implement**. If it doesn't hold, the fallback is v2 per
    region over `config.runRegions`, which defaults to `["us-central1"]`.
- **State mapping:**

  | Condition | Mapped state |
  |-----------|--------------|
  | Ready=True, and latestReady equals latestCreated | Ready |
  | Ready=False, latestReady non-empty and ≠ latestCreated | Degraded ("latest revision failed, previous still serving") |
  | Ready=False, latestReady empty | Down |
  | Ready=Unknown | Unknown ("deploying"). The values are transient while reconciling, so no green and no red. |

- Any regions in `unreachable[]` become an "Unavailable in …" note on the Cloud Run group.

## R5. Cloud SQL

- **Decision:** `GET https://sqladmin.googleapis.com/v1/projects/{p}/instances`.
- **There is no `STOPPED` state.** An instance stopped by its owner has `state=RUNNABLE` and
  `settings.activationPolicy=NEVER`.
- **State mapping:**

  | Instance | Mapped state |
  |----------|--------------|
  | `RUNNABLE` with activationPolicy `ALWAYS` | Ready |
  | `RUNNABLE` with activationPolicy `NEVER` | Unknown ("stopped") |
  | `MAINTENANCE`, `REPAIRING` | Degraded |
  | `FAILED`, `SUSPENDED` | Down |
  | `PENDING_CREATE`, `PENDING_DELETE` | Unknown ("provisioning" or "deleting") |

## R6. Vertex AI endpoints

- **Decision:** for each region `r` in `config.vertexRegions`, call
  `GET https://{r}-aiplatform.googleapis.com/v1/projects/{p}/locations/{r}/endpoints`.
  - Use `displayName`, `deployedModels[]`, and `updateTime`.
  - An endpoint with deployed models is Ready.
  - An empty `deployedModels` is Unknown ("idle, no models deployed"), not an error.
- The permission `aiplatform.endpoints.list` (`roles/aiplatform.viewer`) is **verify in
  implement**.

## R7. Cloud Storage buckets and sizes

- **Buckets:** `GET https://storage.googleapis.com/storage/v1/b?project={p}`, using `name`,
  `location`, and `storageClass`.
- **Sizes:** one Monitoring call per project:
  ```
  GET …/v3/projects/{p}/timeSeries
    ?filter=metric.type="storage.googleapis.com/storage/total_bytes"
    &interval.startTime=<now-26h>&interval.endTime=<now>
    &aggregation.alignmentPeriod=93600s&aggregation.perSeriesAligner=ALIGN_MAX
    &aggregation.crossSeriesReducer=REDUCE_SUM&aggregation.groupByFields=resource.label.bucket_name
  ```
- **Gotchas:**
  - The value is **measured once a day**, so its as-of date is the latest point's time (stale
    after 48 h, per FR-023).
  - Soft-deleted objects are excluded.
  - Buckets with no objects have no series. A bucket with no series that was created less than
    48 h ago shows "size pending"; older ones show "0 B, no objects".
  - The 26-hour window covers the daily sample. Cache TTL is 6 h.

## R8. Billing accounts and project billing

- **Decision:**
  - `GET https://cloudbilling.googleapis.com/v1/billingAccounts` lists every account the caller
    can view. Use `name`, `displayName`, `open`, and `currencyCode`. Closed accounts are listed and
    left out of totals.
  - `GET …/v1/projects/{p}/billingInfo` gives `billingEnabled` and `billingAccountName` for each
    project.
- **Why:** this directly provides the "every visible billing account" set (FR-022) and the
  "billing disabled" project state.

## R9. Budgets

- **Decision:** `GET https://billingbudgets.googleapis.com/v1/billingAccounts/{id}/budgets`.
  - `amount.specifiedAmount` is a Money value (`units` plus `nanos`), converted to minor units.
  - `amount.lastPeriodAmount` is resolved from last month's net spend (R10).
  - A `budgetFilter` with no `projects`, `services`, or `resourceAncestors` counts as
    account-scoped.
  - A `customPeriod` budget is shown with "(custom period)" and is not used for "remaining".
- **The API does not report current spend**, which confirms that spend comes only from R10.
- **Permission:** `billing.budgets.list` (`roles/billing.viewer`). Reads are capped at 800 per
  minute.

## R10. Spend from the BigQuery billing export

- **Table:** the standard usage cost export, `gcp_billing_export_v1_<ACCOUNT_ID>` with dashes
  shown as underscores. That naming is **verify in implement**.
  - The table name is **required in config** for each account; there is no discovery. The setup
    check lists the dataset's tables to validate it with
    `GET bigquery/v2/projects/{p}/datasets/{d}/tables`.
- **Query** (one per account per refresh):
  ```sql
  SELECT invoice.month AS month, currency,
         SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net,
         MAX(export_time) AS fresh
  FROM `<table>`
  WHERE DATE(_PARTITIONTIME) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE('America/Los_Angeles'), MONTH), INTERVAL 1 MONTH)
    AND invoice.month IN (FORMAT_DATE('%Y%m', CURRENT_DATE('America/Los_Angeles')),
                          FORMAT_DATE('%Y%m', DATE_SUB(CURRENT_DATE('America/Los_Angeles'), INTERVAL 1 MONTH)))
  GROUP BY month, currency
  ```
  - Invoice months follow US Pacific time.
  - `invoice.month` gives invoice-accurate totals, and `_PARTITIONTIME` limits how much is
    scanned. Whether the table is partitioned on `_PARTITIONTIME` is **verify in implement**. The
    first run uses `dryRun:true`, and the result must be under `maxBytesBilled` before the real
    query runs.
- **The call:** `POST https://bigquery.googleapis.com/bigquery/v2/projects/{jobProject}/queries`
  with body `{query, useLegacySql:false, maximumBytesBilled:"<cap>", timeoutMs:20000,
  useQueryCache:true}`.
  - A query over the cap **fails without charge**, which is the FR-017 guarantee.
  - `jobProject` is `config.quotaProject`, falling back to the table's project.
  - Requires `bigquery.jobs.create` on `jobProject` and `bigquery.tables.getData` on the dataset.
- **Freshness:** `MAX(export_time)` gives the data's as-of time, stale after 24 h (FR-015b).
- **Backfill:** when the export is first enabled with a multi-region dataset, Google backfills
  from the start of the previous month, which can take up to 5 days. Regional datasets may not
  backfill. The setup guide recommends a US or EU multi-region dataset.
- **Cost:** about 180 queries a month over a few MB stays well within BigQuery's free monthly
  query allowance (1 TiB per month; **verify in implement**).

## R11. Projects

- **Decision:** `GET https://cloudresourcemanager.googleapis.com/v3/projects:search?query=state:ACTIVE`,
  paginated.
- **Why:** it returns every project the caller can `get`, which `projects.list` does not.
- **Gotcha:** it is eventually consistent, so a brand-new project may appear a little later.

## R12. Enabled APIs and classifying errors

- **Enabled APIs:** `GET https://serviceusage.googleapis.com/v1/projects/{p}/services?filter=state:ENABLED&pageSize=200`.
- **Skipping calls:** a source whose API is not enabled is skipped without calling it, and marked
  `disabled`. This saves calls and avoids noisy 403s.
- **Error classifier** (`http.ts`), based on `error.details[]` entries with
  `@type=type.googleapis.com/google.rpc.ErrorInfo`:

  | Reason | Kind |
  |--------|------|
  | `SERVICE_DISABLED` | `disabled` |
  | `BILLING_DISABLED` | `disabled` ("billing disabled") |
  | `USER_PROJECT_DENIED` | `auth` (quota project problem) |
  | any other 403 | `denied` |
  | 401 | `auth` |
  | 429 | `quota` (one retry with jitter) |
  | 5xx | one retry, then `other` |

## R13. Credentials and quota project

- **Enforcement:** read-only behaviour is enforced by the request guard in `http.ts`, and checked
  by tests T008 and T079. OAuth scopes do **not** enforce it. A user ADC refresh token keeps the
  scopes it was minted with, which is usually `cloud-platform`, so requesting narrower scopes is
  best-effort at most.
- **Decision:**
  - `google-auth-library` `GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform.read-only']})`.
  - `cloud-platform.read-only` does not cover BigQuery `jobs.query`, so add the `bigquery.readonly`
    scope. Whether that scope permits creating query jobs is **verify in implement**; if not, use
    the `bigquery` scope for that one client.
  - With user credentials, send `x-goog-user-project: <quotaProject>` on every request. The quota
    project comes from `config.quotaProject`, falling back to ADC's `quota_project_id`.
  - Fallback: if ADC isn't present, shell out to `gcloud auth print-access-token`, located through
    the same PATH search as node.
- **Setup check:** confirm a quota project is set, that the caller has `serviceusage.services.use`
  on it, and that the APIs CloudBar needs are enabled **in the quota project**. Report each gap
  as a step for the owner; never enable anything.

## R14. SwiftBar output

- **Confirmed:**
  - The header is everything before the first `---`; each later `---` is a separator.
  - Parameters: `sfimage`, `sfcolor` (accepts `light,dark`), `sfconfig` (base64 JSON for palette
    rendering), `color` (`light,dark`), `font`, `size`, `length` (the full text goes in the
    tooltip), `trim`, `tooltip`, `dropdown`, `href`, `bash` (absolute path), `param0`–`param10`,
    `terminal`, `refresh`, `shortcut`.
  - Environment variables: `SWIFTBAR_PLUGIN_CACHE_PATH`, `SWIFTBAR_PLUGIN_DATA_PATH`,
    `SWIFTBAR_PLUGIN_REFRESH_REASON` (`MenuAction`, `Schedule`, `FirstLaunch`, `WakeFromSleep`,
    `MenuOpen`, …), and `OS_APPEARANCE`.
  - Metadata tags: `swiftbar.hideRunInTerminal`, `hideLastUpdated`, `hideDisablePlugin`,
    `hideAbout`, `refreshOnOpen`.
  - `swiftbar://refreshplugin?name=` refreshes a plugin from outside.
- **Decisions:**
  - Submenus use `--` nesting, the xbar-compatible syntax SwiftBar implements. It isn't spelled
    out in the README, so it is **verify in implement**: a manual check on the Mac during
    quickstart B.
  - Force a full refresh when the reason is `MenuAction` (the Refresh item), `WakeFromSleep`, or
    `FirstLaunch`.
  - Status colours use `light,dark` pairs for contrast in both appearances.
  - The plugin is a bash shim, `cloudbar.5m.sh`, so the default `runInBash` is fine.
