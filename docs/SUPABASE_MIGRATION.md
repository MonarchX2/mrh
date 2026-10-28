# Supabase storage and legacy import

## Current storage boundary

The checked-in Apps Script source in [`BACKEND/backend.js`](../BACKEND/backend.js)
uses Supabase for Reviewer account records (`mrh_accounts`), account/resource
activity and audit events (`mrh_activity_logs`), and eligible central web-app
logs (`mrh_website_logs`). Routine request traces remain in Apps Script
execution logs. There is no runtime Sheets/Supabase provider switch.

Google Drive, deck/source spreadsheets, and the UUID worksheet remain
Google-backed. The spreadsheet importer described below is an explicit,
one-time legacy migration path; it is not runtime storage. Reviewer session
records remain in Apps Script Script Properties under hashed `Session_...`
keys, as do notification cursor/recipient state; none of these values are
migrated by this helper.

## Supabase prerequisites

Store the project URL and server secret key only in Apps Script
**Project Settings → Script Properties**:

| Environment | Required properties |
| --- | --- |
| Production | `MRH_SUPABASE_URL`, `MRH_SUPABASE_SECRET_KEY` |
| Staging | `MRH_ENVIRONMENT=staging`, `MRH_SUPABASE_URL_STAGING`, `MRH_SUPABASE_SECRET_KEY_STAGING` |

When `MRH_ENVIRONMENT` is unset, the backend selects production. Keep the
staging project, credentials, and imported source spreadsheets separate from
production. Never put a Supabase secret key in source files, browser code,
logs, or documentation.

Before running setup, provision the following tables with the listed columns:

| Table | Required columns |
| --- | --- |
| `mrh_accounts` | `id`, `email`, `last_name`, `first_name`, `middle_initial`, `active`, `created_date`, `created_time`, `last_access_date`, `last_access_time`, `permanent_pdf_issuance_id`, `legacy_metadata`, `updated_at` |
| `mrh_activity_logs` | `id`, `area`, `source_event_id`, `audit_event_id`, `legacy_source`, `legacy_row`, `legacy_date`, `legacy_time`, `email`, `last_name`, `first_name`, `middle_initial`, `event`, `course_code`, `year`, `semester`, `category`, `course`, `resource`, `issuance_reference`, `source_file_id`, `record`, `created_at` |
| `mrh_website_logs` | `id`, `log_group`, `logged_at`, `legacy_source`, `legacy_row`, `legacy_date`, `legacy_time`, `severity`, `event`, `outcome`, `method`, `handler`, `request_type`, `correlation_id`, `duration_ms`, `response_code`, `client_version`, `error_name`, `error_message`, `stack`, `active_user_available`, `verified_account_email`, `activity`, `resource_id`, `resource_name`, `resource_area`, `course`, `year`, `semester`, `category`, `issuance_reference`, `audit_event_id`, `detail`, `query_parameters`, `payload_text`, `summary`, `record` |

The runtime validator checks that these columns can be selected; it does not
create tables or validate their types, indexes, or constraints. Use a
generated numeric `id` suitable for ordering and notification cursors. The
account table needs a unique constraint on `email`. Both log tables need a
unique constraint on `(legacy_source, legacy_row)` for repeatable legacy
imports. Review the remaining column types against the values written by the
backend before provisioning; the Apps Script initializer is not a SQL
migration.

After provisioning, run `initializeMRHAccountsSpreadsheet()` from the
appropriate Apps Script editor. Despite its legacy name, it validates the
Supabase configuration and required columns; it does not create or initialize
a spreadsheet.

## Optional one-time spreadsheet import

`migrateMRHSpreadsheetsToSupabase()` imports account, activity, and central
website-log rows from configured Google spreadsheets. It does not alter or
delete source spreadsheets. The helper validates source tabs and headers and
rejects conflicting account records before importing. It imports accounts
only when the email is not already present, preserving account changes made
in Supabase; activity and website log rows use their legacy source and row
number as repeatable import keys. The operation is not one database
transaction, so a partial import can leave completed batches in place; the
import keys allow a reviewed retry.

Configure source IDs in Script Properties before an authorized import:

| Environment | Account source | Central website-log source |
| --- | --- | --- |
| Production | `MRH_ACCOUNTS_SPREADSHEET_ID` | `MRH_CENTRAL_LOG_SOURCE_SPREADSHEET_ID` |
| Staging | `MRH_ACCOUNTS_SOURCE_SPREADSHEET_ID` | `MRH_CENTRAL_LOG_SOURCE_SPREADSHEET_ID_STAGING` |

The production website-log source also accepts the existing
`MRH_CENTRAL_LOG_SPREADSHEET_ID` setting when the dedicated source property is
absent. For staging, the account and website-log source IDs must be staging
resources and must differ from the configured production sources. The helper
stops if staging source IDs point to production. Review the selected source
IDs and headers before running it.

On its first successful import, the helper initializes the Reviewer
notification cursor to the latest activity row and marks the baseline. This
prevents old imported application events from generating new notification
emails. The helper returns processed counts and a note confirming that source
spreadsheets were not modified. Do not run it against production without
explicit operational authorization; this code-level procedure does not
authorize access to live data.

## Cutover and verification

1. Prepare and verify a separate staging Supabase project, tables, constraints,
   Apps Script project, source spreadsheets, and OAuth configuration.
2. Set `MRH_ENVIRONMENT=staging`, the staging Supabase properties, and staging
   migration source IDs. Confirm the IDs are staging-owned and distinct from
   production.
3. Run `initializeMRHAccountsSpreadsheet()` and review its result. It performs
   a schema/configuration check only.
4. If importing staged legacy data is required, review the source tabs and
   headers, then run `migrateMRHSpreadsheetsToSupabase()` in that staging
   Apps Script project.
5. Test account enrollment, approval/denial, session checks, activity logging,
   PDF authorization, and notification behavior against staging-owned data.
   Local VM checks do not establish deployed Apps Script or live Supabase
   behavior.
6. Production migration or deployment requires a separate authorized
   operational plan. Do not copy production secrets or user data into staging.

The frontend request and response contract does not change when this storage
backend is used. Apps Script execution logs remain the destination for routine
request traces; only eligible central failures/security events are persisted
to `mrh_website_logs`.
