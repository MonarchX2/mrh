# Resources access and viewing

This document describes behavior implemented in the checked-in source. It
does not verify live Apps Script settings, the deployed code, Google Drive
permissions, or production data. The backend source is in
[`BACKEND/backend.js`](../BACKEND/backend.js), with Apps Script configuration
in [`BACKEND/appsscript.json`](../BACKEND/appsscript.json).

## Public resource portal

The Student Portal and BSMT Library use resource dashboard and public-resource
routes in the Apps Script backend. Public listings are limited to descendants
of the configured resource root and exclude protected Reviewer paths. This is
a tree-membership policy running under the Apps Script deployment identity;
it is not a per-visitor Drive ACL check. Changing a Drive sharing permission
alone does not remove a file from this portal.

Folder listings are paginated and cached for a short period. The backend
rechecks folder ancestry and protected-path status when serving cached
listings. Preview requests also validate the target path. Shortcuts are
included only when their targets remain inside the public resource hierarchy.
The backend caps in-site resource preview bytes at 32 MiB. The UI can use
Google Drive's native preview for supported files, avoiding the in-site
base64 size limit for those cases.

To remove a resource from the portal, remove it from the permitted hierarchy
or place it in an excluded protected path, then verify that the listing and
preview endpoints no longer return it. Treat this as a change to an access
boundary, not merely a presentation update.

## Reviewer accounts and authorization

Google sign-in establishes identity; it does not itself grant Reviewer access.
The backend validates the identity token and checks the account's current
approval status in Supabase before protected operations. Account records are
stored in `mrh_accounts`, and activity/audit records are stored in
`mrh_activity_logs`. New enrollment and changed profile details require
administrator approval before protected access is available.

Reviewer sessions are stored in Apps Script Script Properties. The backend
binds a session to a browser-held RSA key and checks signed requests in
addition to the session identifier. The source sets a 30-day session lifetime
and a limit of ten concurrent sessions per account. Browser storage, UI state,
and cross-tab coordination are not authorization controls; server-side checks
remain authoritative.

An optional notification worker can email the account that installs it when
new Reviewer applications are recorded. It is not enabled just by the source
being present; installation requires an authorized Apps Script setup
operation. See [SUPABASE_MIGRATION.md](./SUPABASE_MIGRATION.md) for the
account/audit storage boundary and setup considerations.

## Protected Reviewer PDFs

The `get_reviewer_pdf_preview` backend route requires an authorized Reviewer
session, current account approval, current Reviewer-index membership, and
current PDF metadata/type checks. It does not check the file's folder
ancestry or the reviewer's individual Drive ACL. Because the web app executes
as its deploying user, the endpoint can return an indexed PDF that the
deployment identity can read even if the Reviewer cannot access it directly.
Keep the Reviewer index and deployment identity's Drive permissions limited
to intended files.

The backend limits PDF source bytes to 16 MiB and the response to 46 MiB.
Authorized source bytes are delivered to the browser, where the dedicated
worker prepares watermarked previews/downloads. A recipient can inspect or
save the source from browser memory or network traffic; watermarking and
download processing do not prevent extraction by an authorized user. These
controls are attribution and access checks, not DRM.

The backend also detects repeated requests for distinct PDF IDs not found in
the Reviewer index: five distinct IDs from the same verified account within
ten minutes can restrict the account. This is a risk-control path, not a
replacement for reviewing the index and permissions. See
[`reviewer-pdf-service/README.md`](../reviewer-pdf-service/README.md) for the
worker implementation and its synthetic test scope.

## Data and secrets

Supabase URL/secret values, OAuth configuration, and other server-side
configuration belong in Apps Script Script Properties or the appropriate
provider settings, never in browser assets or documentation. Never commit
tokens, private keys, account records, approval details, or protected resource
content. Routine request traces use Apps Script execution logs; account and
resource activity and eligible central website logs use the configured
Supabase tables.

## Verification limits

The checked-in manifest declares an anonymous Apps Script web app that
executes as the deploying user. This makes server-side authorization and
careful scope/Drive access configuration essential. The repository does not
establish the live deployment version, current Apps Script properties,
effective OAuth grants, Supabase constraints, account approvals, Google Drive
ACLs, or current Pages configuration.

The root `.github/workflows/deploy.yml` references release/build helpers that
are absent from the tracked `scripts/` directory. Its source-check steps are
commented out, so the checked-in workflow is not evidence that tests passed or
that a site was published. See [SECURITY.md](./SECURITY.md) for the broader
trust boundaries and [TESTING.md](./TESTING.md) for local validation limits.
