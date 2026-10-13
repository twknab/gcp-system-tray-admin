# Quickstart & Validation: CloudBar MVP

## A. Developer validation (any OS, no cloud access)

```bash
npm ci
npm run typecheck
npm test                       # unit + source-fixture + render-snapshot suites
npm run build
node dist/cli.js render --fixture healthy
node dist/cli.js render --fixture degraded
node dist/cli.js render --fixture no-export
node dist/cli.js render --fixture denied
```

What each fixture must render, checked against `contracts/swiftbar-output.md`:

| Fixture | The title must show | The menu must show |
|---------|---------------------|--------------------|
| `healthy` | the amount and a green symbol | Cloud Run items green (Cloud Run is monitored). Cloud SQL items grey "not monitored" (no Cloud SQL policy). Buckets grey with sizes. |
| `degraded` | a yellow symbol | One Cloud Run service shows "latest revision failed". One warning alert is listed. |
| `no-export` | a symbol and no amount | "Costs unavailable — export not set up", with a link to `docs/billing-export-setup.md` |
| `denied` | a symbol | The Cloud SQL group shows "Unavailable in 1 project", and every other group still renders (SC-005) |

## B. On the owner's Mac

1. **Prerequisites:**
   - SwiftBar (`brew install --cask swiftbar`) with a plugin folder chosen.
   - Node 22 or later.
   - The gcloud CLI, signed in.
2. **Credentials.** Use your existing sign-in; nothing is stored by CloudBar:
   ```bash
   gcloud auth application-default login
   gcloud auth application-default set-quota-project <a-project-you-own>
   ```
3. **Install:**
   ```bash
   git clone https://github.com/twknab/gcp-system-tray-admin ~/Development/cloudbar
   cd ~/Development/cloudbar && npm ci && npm run build
   mkdir -p ~/.config/cloudbar && cp config.example.json ~/.config/cloudbar/config.json
   ln -s "$PWD/cloudbar.5m.sh" "<SwiftBar plugin folder>/cloudbar.5m.sh"
   ```
4. **Setup check:** `node dist/cli.js doctor`. Expect a pass, warn, or fail line for each of:
   credentials, quota project, each API in each project, billing export, and budgets. Each warning
   or failure comes with a next step.
5. **Billing export, if the setup check reports it missing.** Follow
   `docs/billing-export-setup.md` **yourself**. CloudBar never sets it up.
   - Data may take several hours to appear.
   - Once it does, add the table to `billingExports` in the config.
6. **Expected result:**
   - The menu bar shows the cloud symbol, an amount once costs are available, and a status symbol.
   - Opening the menu shows the layout in `contracts/swiftbar-output.md`.
   - **Refresh** updates "Updated just now".

## C. Read-only and cost checks (SC-006)

- `npm test` includes `http.guard.test.ts`, which proves every request the code can make uses `GET`.
  The only exceptions are reads by `POST`: BigQuery queries and Monitoring time-series queries.
- After a week of use, the BigQuery console's "Job history" for the quota project should show only
  `SELECT` jobs, each under the configured byte cap.
- The Cloud audit log for the account should show no admin-write activity from the owner's
  account that CloudBar could have caused.
