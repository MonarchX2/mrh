# Data flows

This document follows the checked-in implementation. It does not establish
that the deployed website or Apps Script version matches this worktree.

## Startup and initialization

1. The browser loads `index.html`; the deferred `app-entry.js` derives the app
   base URL and fetches `version.json` without using a cached response.
2. `startApplicationBootstrap` loads bootstrap scripts and application runtime
   scripts. Practice, study, analytics, and deck-review modules load only when
   the corresponding feature is opened; the service worker caches each module
   after it is first requested.
3. After release metadata and runtime dependencies are ready, the entry script
   registers the service worker and calls `initializeApp` in `frontend/js/app-core.js`.
   `frontend/js/app-bootstrap-core.js` guards dependency readiness and
   initialization re-entry; AppCore remains the single entry point.
4. Initialization loads persisted state, binds UI behavior through
   `frontend/js/app-event-controller-core.js`, applies the startup theme through
   `frontend/js/app-theme-controller-core.js`, and starts sync
   and app services. Missing dependencies or failed initialization are logged
   and displayed as a startup error.
5. After bootstrap completes, AppCore starts loading the configured public
   Documents folder in the background. A validated session listing can render
   immediately, and a first click on Documents shares an in-flight request
   rather than starting a duplicate load.

Navigation keeps dynamic routes visible without a `mrhRoute=` key or query
string. Localhost and deployed routes use path segments; the GitHub Pages
`404.html` fallback restores deep paths without changing their visible URL.
Previously generated route query strings migrate to clean paths where path
navigation is supported. `file:` navigation stores route state in
`history.state.mrhPath` and session storage, since filesystem paths cannot
serve virtual app routes. Localhost deep-link refreshes require a development
server with an application-shell fallback; run `npm run start:dev` instead of
a static server that returns 404 for unknown routes.
The Student Portal uses `/materials` (`/portal` and `/resources` are accepted
aliases); Maritime Library uses `/library`; and Reviewer profile settings use
`/profile`. These routes share the resource view but keep separate portal
modes, including when deep-linking or navigating with browser history. Exit
confirmations remain separate for Student Portal and Maritime Library.

**Trust/failure boundaries:** release metadata and script assets come from the
static site origin and permitted CDN references. The client must have a
supported version before normal backend calls. The backend independently
rejects unsupported client versions on its versioned API routes.

## Backend request and response

`AppNetwork.callBackend` in `frontend/js/app-core-network.js` selects a fixed request
schema, checks allowed/required fields and sizes, adds `appVersion` and a
generated `requestId`, signs requests carrying a Reviewer session with its
session-bound private key, validates the resulting payload, serializes JSON,
and sends a POST to the configured Apps Script web-app URL. Batched resource
events are signed individually when they carry a Reviewer session. Requests
use a timeout/abort path, `no-store`, JSON
response parsing, response-size caps, and connection-pool handling. Only
designated read-safe types are retried. The Apps Script `doPostInternal_` in
`BACKEND/backend.js` independently validates payload size, JSON object
shape, supported version, allowed keys, required values and event/request IDs
before dispatching to a handler.

Responses are JSON. Route errors include a status/code/message; unexpected
exceptions are logged with a correlation ID and returned as a server error.
The client validates response content type and shape and raises errors rather
than treating an invalid response as success.

## Questions, database, and local state

- The backend builds a cacheable database from configured Google Drive/
  spreadsheet sources. `buildDatabaseCache` coordinates work with an Apps
  Script lock, uses cache and Drive-backed build/index files, and may resume
  interrupted work through triggers.
- The frontend loads question decks from subject-keyed IndexedDB entries
  (`mrh_deck:<subject>`) listed in `mrh_deck_index_v1`, while `loadState`
  reads stats, preferences, summary, and navigation data from browser storage.
  It normalizes questions, filters locked subjects, and builds subject/ID
  indexes. Older installations are migrated once from the legacy `mrh_db`
  array; the legacy entry is removed after the partitioned decks and index
  have been written.
- Deck downloads, updates, and removals persist only the affected subject
  entry and update the small subject index through
  `frontend/js/deck-repository-core.js`. Its serialized write queue prevents
  concurrent partition/index mutations from overwriting each other. The
  separate `frontend/js/deck-database-lifecycle-core.js` service performs
  database-wide question-cache clearing; ordinary saves and deletes do not
  enumerate or erase unrelated IndexedDB data. A protected-deck purge removes
  only the affected subject entries rather than rewriting all cached
  questions. State writes are queued and coalesced by dirty-state category;
  failures are logged and surfaced.
- `frontend/js/deck-loader-core.js` coalesces matching backend fetches and
  coordinates per-subject generations with app-clear freshness checks.
  AppCore applies validated responses to memory and IndexedDB only while the
  request is current. `frontend/js/deck-access-state-core.js` derives the
  frontend's locked/hidden/unlocked presentation from the client-visible
  summary and session-local folder state; it does not authorize backend data
  access.
- Dashboard category summaries are shaped into nested folder data by
  `frontend/js/deck-category-model-core.js`, which supplies DOM-free folder
  counts and metadata for Grid cards. Path changes and stale folder-click
  protection are handled by `frontend/js/deck-navigation-controller-core.js`.
- Browser storage utilities use native local/session storage where available;
  restricted contexts use a memory fallback, which is not durable.

**Persistence boundary:** question data is locally stored in IndexedDB;
progress and settings are stored client-side. The checked-in design does not
show an automatic server-side account sync or a built-in cross-device transfer
mechanism for personal progress.

## Summary and synchronization

`frontend/js/sync-coordinator-core.js` owns the AppCore lifecycle for the
controller in `frontend/js/sync-core.js`, including tab leadership. The sync
controller asks the backend for status and conditional deck snapshots. The
`frontend/js/sync-cache-manager-core.js` module owns cache timestamps and
cross-tab status/invalidation messages, while
`frontend/js/deck-summary-mapper-core.js` validates and normalizes compact
summary rows and creates signatures. The backend response carries fields such as
`syncTimestamp`, `cacheVersion`, `hasSummary`, build status, and a compact
access-filtered summary. Matching timestamp and cache version may yield a
`notModified` response; an in-progress build can return a pending response.
Changed summaries are applied and persisted by the client.
After the first successful backend sync, the header connection icon remains
checked during background polling. AppCore changes it to a warning only after
three consecutive sync failures and restores the check after a successful
retry; transient progress messages do not change the icon.
`frontend/js/deck-refresh-queue-core.js` deduplicates pending deck payload
refreshes, bounds concurrent requests, and schedules retries; AppCore supplies
the storage and network operations used to validate and persist each deck.
For downloaded decks, the client retains the payload version associated with
the local IndexedDB partition. If a pending refresh finds that version matches
the summary fingerprint and the cached question count is complete, it clears
the pending refresh without requesting the deck payload. Otherwise it fetches
and verifies the payload before replacing the local partition.

Tabs coordinate background work using heartbeats over
`BroadcastChannel("mrh_leader_election")`. A sorted tab ID election selects a
leader and stale peers expire. This reduces duplicate requests but is
best-effort browser coordination: backend locks remain necessary for
server-side shared mutations.

## Reviewer identity and session

1. The browser invokes Google Identity Services and receives an identity
   token. It generates an RSA key pair, retains a non-extractable private
   `CryptoKey` in memory, and sends the public key with sign-in verification.
2. `verify_reviewer_access` submits the token, event ID, and public key to
   Apps Script.
3. The backend verifies the token with Google token-info endpoints, including
   configured client audience, expiry, issuer, and verified-email claims.
4. The backend writes the sign-in audit using the request event ID to
   Supabase's `mrh_activity_logs` table. If the audit cannot be recorded,
   verification fails and no session is issued.
5. After the audit succeeds, the backend creates an opaque session ID and
   stores a record keyed by a SHA-256 hash of that ID in Script Properties,
   binding the session to the public key and a bounded expiry. The browser
   stores the session ID in local storage and the non-extractable private key
   in IndexedDB under a session-specific key. The browser does not make a
   separate sign-in audit request.
6. Reviewer requests include an RSA-SHA-256 proof over the complete request;
   the backend verifies that proof against the session's registered public
   key and revalidates current account status from `mrh_accounts` (using a
   30-second cache that backend account mutations invalidate).
   Protected dashboard and PDF actions additionally require the account to
   have a complete profile and an explicit active/approved state.

The browser delegates auth-route calls to `reviewer-auth-core.js`, cross-tab
status/dashboard coordination and poll timing to
`reviewer-session-coordinator-core.js`, and enrollment/profile rendering to
`reviewer-profile-ui-core.js`. These modules coordinate the client experience;
the Apps Script backend still verifies identity, session proofs, and current
approval on protected operations.

On page reload, a fresh same-account Reviewer dashboard snapshot may be
rendered from the current tab's session storage while the saved session is
revalidated. This cache only avoids a blank/loading transition; it does not
authorize protected requests, and refreshed dashboard data is reconciled
against the displayed snapshot.

Unbound sessions issued before this protocol are rejected by protected
operations and require Google reauthentication. Signing proves possession of
the session key but does not protect against active same-origin script
injection, which can use the browser as a signing oracle.

The browser's profile state, local session storage, or UI locks do not confer
authorization. Backend validation is decisive. Identity-provider errors,
invalid/expired sessions, pending/denied accounts, and backend misconfiguration
return explicit failures.

While a Reviewer session is active, visible-tab status checks begin at
10-second intervals for the first 30 seconds after sign-in, enrollment, or a
status change, then back off to 30, 60, and 120 seconds while the status remains
unchanged. The poll timer is canceled while the document is hidden; returning
to a visible tab triggers an immediate status check.

## Protected PDF viewing and download

1. `frontend/js/app-core.js` coordinates the Reviewer preview and requests
   `get_reviewer_pdf_preview` with session ID, event ID, file ID, and optional
   course/filter/cache/issuance context; the network layer adds the session-key
   proof before sending.
2. Apps Script checks identity/session and current approval, Reviewer PDF
   index membership, and current non-trashed PDF metadata/type before source
   bytes are read. It does not check folder ancestry or Drive permissions. As
   the web app executes as its deployer, approved Reviewers can receive
   indexed PDFs even without direct Drive access. It enforces the 16 MiB
   source limit, a 46 MiB response limit, and issuance limits/auditing.
3. The backend returns authorized source bytes, filename/type and verified
   attribution data as JSON/base64. Failures before source delivery return an
   error.
4. `reviewer-pdf-processor-core.js` transfers bytes to the dedicated PDF
   worker for watermarking or download preparation.
   `reviewer-pdf-viewer-core.js` manages the protected preview frame and its
   lifecycle, while `reviewer-pdf-download-core.js` validates and issues each
   encrypted download and immediately records its protected audit event. The
   README states the clean source and prepared PDF are not persisted in app
   storage or written back to Drive.

**Security limitation:** the authorized browser receives the source, so a
recipient can inspect or save it from network traffic or memory. Watermarking
and encryption do not replace backend authorization or prevent extraction by
an authorized recipient.

## Public resources

The resource portal requests `list_public_resources` with an optional folder
ID and page token. Apps Script resolves the folder, walks its ancestry to the
configured public root, excludes protected folders and out-of-tree shortcuts,
and returns a bounded page of allow-listed item data. Listing responses are
cached by folder/page/policy context, but current ancestry is checked before
returning a cached listing.
The Resource Portal browser controller manages listing cache validation and
request generations, while AppCore renders the returned data. The dashboard
controller owns refresh timing, and the catalog view owns dashboard row
filtering, sorting, and stable table reconciliation. The preview controller
coordinates preview request generations and teardown; it does not determine
whether a Reviewer request is permitted.

The BSMT Library's Documents tab uses this listing to render the selected
folder's immediate children in the site. It uses Grid view; each Grid card is
a single link that opens its Drive folder or file in a new tab. The last
successful public Documents listing is retained in session storage and
restored immediately after a page refresh while the backend is queried again.
Refreshed listings reconcile only changed rows without replacing unchanged
row nodes; a name, modified date, or thumbnail change updates only that item's
corresponding content. Unchanged data does not invoke the row renderer.
Breadcrumbs are also updated only when their displayed values change. Refresh
failures remain visible without discarding the last rendered listing, but an
explicit backend denial removes the cached and displayed listing. The browser
does not recursively list or preview those Documents items in-site.

The Library's selected Documents or Subjects section is stored in browser
local storage under `mrh_maritime_library_last_section_v1` and restored when
the Library route is opened again.

`get_resource_preview` takes a file ID and optional `previewMode`. The backend
rechecks file ancestry; `previewMode: "drive"` returns native preview
metadata, while the in-site path returns base64 content (Google Workspace
documents are exported as PDF). In-site transport is limited to 32 MiB.
Public-resource membership, not per-visitor Drive ACL, is the documented
portal access boundary. See [resources-security.md](./resources-security.md)
for resource-specific behavior and risks.
