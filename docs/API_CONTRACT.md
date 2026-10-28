# Apps Script API contract

This reference reflects `doGetInternal`, `doPostInternal_`, their request
schemas, relevant handlers, and the frontend schemas in
`frontend/js/app-core-network.js`. It describes checked-in code, not a live
deployment. Responses are JSON objects; several route families return
variable or larger payloads, so this document summarizes their shapes rather
than claiming a complete response schema.

Both methods use the Apps Script web-app URL configured as `databaseUrl` in
`frontend/js/app-config.js`; this endpoint is a checked-in frontend setting,
not a shell environment variable. GET requests use query parameters; POST
requests send a JSON object in the request body.

## Common request behavior

- The frontend sends POST JSON to the URL configured in
  `frontend/js/app-config.js`.
- It adds `appVersion` and a generated UUID `requestId`. `requestId` is
  accepted by the backend but is not a required schema field. The backend
  checks the client version before dispatch on POST and every parameterized
  GET.
- Backend version checks accept numeric releases with optional `mrh-` and
  `release-` prefixes, an optional numeric build suffix, and an optional
  trailing short hexadecimal commit hash, while applying the same
  minimum-version policy. The current backend floor is
  `26.10.20` (`MINIMUM_SUPPORTED_CLIENT_VERSION` in
  `BACKEND/backend.js`); it is independent of the website release version.
- POST bodies are limited to 500,000 UTF-8 bytes. Unknown request types,
  unsupported fields, invalid values, missing required values, malformed
  UUIDs, and unsupported client versions return JSON errors.
- String limits are validated server-side. POST pagination `page` and `limit`
  accept JSON numbers or numeric strings and must be positive integers. The
  common schema limit for `limit` is 1,000; `get_deck` further limits it to
  100, matching the GET deck-page limit, and `get_deck` limits `page` to
  1,000,000. Other field limits are defined by `BACKEND_POST_STRING_LIMITS` in
  `BACKEND/backend.js`.
- Frontend request and response validation is additional client-side
  correctness handling; it is not backend authorization.
- Standard error objects are `{status:"error", code, message}`; some server
  failures include `correlationId`. Success shapes vary by handler.

## GET interface

Routes are selected from query parameters in `doGetInternal`:

| Query parameters | Behavior |
| --- | --- |
| None | Returns sync status (`status`, payload schema version, sync timestamp, cache version, summary/build readiness, server time, and related status fields). |
| `v` or `appVersion`, with neither `sync=1` nor a non-empty `subject` | Requires a supported client version, then returns the cached deck summary or a cold-start response if the summary is unavailable. |
| `sync=1`, optional `since`, `sinceCacheVersion`, and `v`/`appVersion` | Returns a conditional sync snapshot. `since` is limited to 100 characters and `sinceCacheVersion` to 200; both reject control characters. The response can be pending, cold-start, not modified, or include summary data. |
| `subject` and `v`/`appVersion` | Returns a public deck when the subject exists and is not hidden or password-protected. Subjects are limited to 500 characters and reject control characters. Optional positive-integer `page` and `limit` request a page; defaults are page 1 and limit 100, with a maximum page of 1,000,000 and maximum limit of 100. Password-protected decks must use POST. |

The no-parameter status path does not require a client version. Parameterized
GET routes require `v` or `appVersion`. When both `sync=1` and a non-empty
`subject` are supplied, the sync route takes precedence. Other query keys do
not select additional routes and are ignored after version validation.
Query validation, hidden-hierarchy checks, password requirements,
not-found/not-ready behavior, and access-filtered summaries are implemented
in `doGetInternal`, `handleGetDeckRequest`, and the sync handlers. The exact
legacy/full deck payload shape depends on stored deck content and is not
reproduced here.

## POST interface

Every row lists the request fields required by the backend schema. Other fields
shown under “Optional” are accepted by that schema. Every POST also needs the
common supported `appVersion`; `requestId` is optional to the backend.
`type` is required and must be one of the listed values. The frontend may apply
additional schema checks.

| `type` | Required fields | Optional fields |
| --- | --- | --- |
| `get_reviewer_auth_config` | — | — |
| `verify_reviewer_access` | `idToken`, `eventId`, `sessionPublicKey` | — |
| `log_reviewer_sign_in` (legacy) | `sessionId`, `eventId` | `sessionProof` |
| `restore_reviewer_session` | `sessionId` | `sessionProof` |
| `sign_out_reviewer` | `sessionId`, `eventId` | `sessionProof` |
| `get_reviewer_account_status` | — | `idToken`, `sessionId`, `sessionProof` |
| `request_reviewer_enrollment` | `eventId` | `idToken`, `sessionId`, `sessionProof`, `lastName`, `firstName`, `middleInitial` |
| `get_reviewer_dashboard` | `eventId` | `idToken`, `sessionId`, `sessionProof` |
| `get_reviewer_pdf_preview` | `sessionId`, `eventId`, `fileId` | `sessionProof`, `course`, `courseName`, `year`, `semester`, `category`, `cachedSourceVersion`, `issuancePurpose` |
| `log_module_access` | `eventId` | `idToken`, `sessionId`, `sessionProof` |
| `log_resource_file_click` | `eventId`, `resourceArea`, `fileName`, `fileId` | `course`, `year`, `semester`, `category`, `idToken`, `sessionId`, `sessionProof` |
| `log_resource_dashboard_action` | `eventId`, `resourceArea`, `action` | `detail`, `resource`, `course`, `year`, `semester`, `category`, `fileId`, `issuanceReference`, `idToken`, `sessionId`, `sessionProof` |
| `batch_log_resource_events` | `events` | — |
| `get_deck` | `subject` | `password`, `page`, `limit` |
| `verify_folder_access` | `subject`, `password` | — |
| `verify_access` | `subject`, `password` | — |
| `get_cache_version` | — | — |
| `get_sync_status` | — | — |
| `list_public_resources` | — | `folderId`, `pageToken` |
| `get_resource_preview` | `fileId` | `previewMode` |
| `get_resource_dashboard` | `eventId` | `version`, `idToken`, `sessionId`, `sessionProof` |

The backend schemas also allow the common `type`, `appVersion`, and
`requestId` fields. They reject fields not explicitly listed for a route.
`eventId` must be a UUID for relevant reviewer, resource-logging, and dashboard
routes; the backend performs the route-specific UUID check. `get_deck` and
`verify_*access` use subject hierarchy/password checks; their optional
`password` field is accepted only where listed.

`batch_log_resource_events` accepts 1–10 event objects per request. Each event
must match the existing `log_resource_dashboard_action` or
`log_resource_file_click` schema, including its own UUID `eventId`; nested
events are validated and then passed through those existing handlers.
Protected `PDF_DOWNLOAD` audit events remain on the immediate
`log_resource_dashboard_action` route. If a batch is only partly recorded, the
batch response is an error with per-event status and code results; successful
events are not rolled back.

`log_resource_dashboard_action` accepts the dashboard areas `LIBRARY`,
`SUBJECTS`, `SYLLABUS`, `MODULES`, `REVIEWERS`, and `PROFILE`. Activity events,
including Library tab clicks, are stored in the Supabase
`mrh_activity_logs` table. Public-area events may have no account identity
when the visitor is not signed in.
The frontend queues routine dashboard and file-click telemetry and flushes
at most 10 entries per request, after 5 seconds or when the batch is full.
On page exit, unauthenticated events use `navigator.sendBeacon` when available;
authenticated events are flushed through the signed backend request path.
Both paths are best-effort; PDF-download audit logging remains immediate.

## Route families and response behavior

- **Reviewer identity/session:** account-config/status, sign-in, enrollment,
  session restoration and revocation return status/account/session fields or
  explicit codes such as invalid/expired session, pending/denied account,
  restricted account, rate limit, unavailable identity provider, or
  `SESSION_ACCOUNT_CAPACITY` / `SESSION_CAPACITY` when session limits are
  reached. Account status can be `TRUE`, `FALSE`, `DENIED`, `RESTRICTED`, or
  `NOT_FOUND`.
  `verify_reviewer_access` writes the sign-in audit before creating a session,
  so audit failures fail verification rather than issuing an unaudited session.
  Audit-write failures return an explicit backend error (including
  `TEMPORARY_UNAVAILABLE` for lock contention). The
  `log_reviewer_sign_in` compatibility route remains available, but
  session-based calls to it require the same key proof as other protected
  operations.
  `verify_reviewer_access` requires the client's RSA public key. Every request
  authenticated with `sessionId` must also carry `sessionProof`, an
  RSA-SHA-256 signature over the UTF-8 JSON serialization of the complete
  request body with only `sessionProof` omitted.
  The backend binds that key to the session and checks current account approval
  on protected operations. `sign_out_reviewer` permits an unsigned session
  identifier only to revoke that session and return revocation status; it
  cannot return account or resource data. Existing sessions without a bound
  key require Google reauthentication.
- **Reviewer dashboard/PDF:** dashboard returns authorized reviewer data.
  PDF response includes source data and attribution/issuance metadata after
  backend session, approval, current Reviewer-index membership, and direct PDF
  metadata/type checks. The PDF route does not check folder ancestry or Drive
  permissions; because Apps Script runs as its deployer, any approved Reviewer
  can retrieve an indexed PDF the deployment identity can read. The
  browser-side watermarking pipeline is not an authorization check.
- **Resources:** listing returns `status`, current folder, breadcrumbs, item
  array, page token, next page token and truncation state. In-site preview
  returns name, MIME type and base64 `data`; `previewMode:"drive"` returns
  `deliveryMode:"drive"` plus name/MIME metadata. Listing and preview access
  is bounded to the configured public resource hierarchy, excluding protected
  paths. Preview additionally denies file IDs in the Reviewer PDF index even
  if the file has moved elsewhere in Drive. If that index cannot be read, the
  preview handler logs the lookup failure and continues with the hierarchy and
  protected-path checks.
- **Deck and access:** `get_deck` returns stored deck data or a paginated
  payload; access verification returns success for an authorized subject.
  Protected/hidden/missing/not-ready decks and incorrect passwords return
  errors. Password attempts are limited to 20 per subject and Apps Script
  temporary active-user key within 60 seconds; if that key is unavailable, the
  backend uses a shared anonymous bucket.
- **Deck refresh:** compact sync summaries include each deck's
  `PayloadVersion` fingerprint. The frontend skips payload retrieval only when
  its saved local fingerprint matches and the cached deck has the expected
  question count; otherwise it fetches and verifies the current payload.
- **Sync/cache:** status returns build/cache readiness and version fields.
  `get_cache_version` returns `version` and `timestamp`. Sync snapshots may
  return `notModified`, cold-start/pending information, or an access-filtered
  summary.
- **Logging:** logging routes return a success status when the corresponding
  handler accepts the event; validation, identity, account and persistence
  failures remain errors. If shared Apps Script lock contention prevents an
  access-log write, the backend returns `TEMPORARY_UNAVAILABLE` rather than
  a generic server error. Logging requests are not automatically retried by
  the frontend.

## Limits, timeouts, caching, and retry semantics

- Frontend network default timeout is 15 seconds; callers may provide another
  positive timeout. State synchronization configuration separately sets a
  60-second sync request timeout.
- Frontend limits POST payloads to 500,000 bytes and parsed responses to 66
  MiB, with a 46 MiB cap for reviewer PDF responses.
- The backend caps public resource in-site preview bytes at 32 MiB. Reviewer
  PDF code has a 16 MiB source and 46 MiB response cap.
- Backend routes use Apps Script CacheService for cacheable data, with
  route-specific TTL/version policies. Cached deck/sync results are keyed or
  checked against cache metadata; resource listing cache hits still re-check
  folder ancestry. Chunked payloads are written in batches of at most four
  chunks and 80,000 bytes of serialized UTF-8 data; unusually encoded chunks are
  subdivided to fit the byte budget. The count marker is published only after
  all batches succeed, so an incomplete write is treated as a cache miss.
  Cached content can lag until its route's invalidation/TTL conditions are met.
- The frontend retries only `get_reviewer_auth_config`,
  `restore_reviewer_session`, `get_reviewer_account_status`,
  `get_reviewer_dashboard`, `get_deck`, `get_cache_version`,
  `get_sync_status`, `list_public_resources`, `get_resource_preview`, and
  `get_resource_dashboard`. It does not automatically retry other POSTs.
  Dashboard authorization failures trigger a session restore check with at
  most one retry; ordinary saved-session restoration opts out of retries.
  This is the source-defined set, not a claim that all listed operations are
  globally side-effect-free in every deployment.
- Transient browser transport errors, timeouts, and server-side errors are
  retried only for those read-safe request types. Reviewer dashboard requests
  allow three retries after the initial attempt, with exponential delays
  starting at 500 ms and capped at 4 seconds. This helps recover from
  intermittent Apps Script/Google response-redirect or network failures, but
  cannot guarantee availability during sustained outages or quota limits.

## Details not specified as a stable contract

The repository does not define an OpenAPI/schema artifact, generated client,
formal semantic-versioning guarantee for individual response fields, or
complete per-route error enumeration. Some stored deck and dashboard response
structures depend on sheet/Drive content and backend helpers; consult the
handler source before changing a consumer.
