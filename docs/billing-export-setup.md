# Set up the billing cost export (you do this; CloudBar never does)

CloudBar shows real spend only from Google's **Cloud Billing export to BigQuery**. The Cloud Billing
API cannot tell anyone what they've spent. CloudBar is read-only by design and will **never**
create the dataset or turn the export on for you. These steps are yours to take, once per billing
account.

## Before you start

- You need **Billing Account Administrator** (or Billing Account Costs Manager) on the billing
  account. You also need BigQuery permission to create a dataset in the project that will hold it.
- Pick a project to hold the data. A small "admin" or "billing" project you already own is ideal.
- **Cost:** storing a personal account's export is a few MB, inside BigQuery's free storage tier.
  CloudBar reads it a few times a day, and every query is capped at 1 GiB scanned, far below
  BigQuery's monthly free allowance.

## Steps

1. **Create a dataset in a multi-region location (US or EU).** Multi-region datasets get a backfill
   from the start of the previous month. Regional ones may not, so last month would stay empty.
   ```bash
   bq --location=US mk --dataset <your-project>:billing_export
   ```
   You can also use the console: BigQuery → your project → ⋮ → **Create dataset** → Location type
   **Multi-region**.
2. **Turn on the export:**
   1. Console → **Billing** → choose the account → **Billing export** → **BigQuery export** tab.
   2. Under **Standard usage cost**, choose **Edit settings**.
   3. Pick the project and the `billing_export` dataset, then choose **Save**.
3. **Wait.** First rows usually arrive within a day. The backfill of the previous month can take
   **up to 5 days**. Until then, CloudBar shows "Costs unavailable" or an empty last month.
4. **Find the table name.** It looks like
   `gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX` (your billing account ID with `_` instead of `-`):
   ```bash
   bq ls <your-project>:billing_export
   ```
5. **Tell CloudBar.** Add one line per billing account to `~/.config/cloudbar/config.json`:
   ```json
   {
     "billingExports": {
       "XXXXXX-XXXXXX-XXXXXX": "<your-project>.billing_export.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX"
     }
   }
   ```
6. **Check it.** Run the setup check from the menu (**Run setup check…**) or with
   `node dist/cli.js doctor`. It confirms the table exists and that you can query it.

## Permissions CloudBar needs to *read* it

- `roles/bigquery.dataViewer` on the dataset, or the table.
- `roles/bigquery.jobUser` on the project that runs the query. That's your quota project, or
  the dataset's project if you haven't set one.

## Several billing accounts

Repeat steps 2–5 for each account. They can share one dataset; each account gets its own table.
Accounts you can see but haven't exported are listed as "Costs unavailable", and the total is
marked **partial**.
