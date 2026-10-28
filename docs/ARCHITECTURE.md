# Architecture

## System shape

Maritime Review Hub is a static browser application backed by a Google Apps
Script web app. The repository contains browser and Apps Script source, but
the current GitHub Actions workflow cannot complete because its release/build
helper scripts are absent. The backend runs under Apps Script and accesses
Google Drive and Sheets using its
deployment identity and configured scopes. Reviewer accounts and activity
records, along with eligible central website logs, are stored in Supabase
through the REST adapter defined inline in `BACKEND/backend.js`; there is
no Sheets/Supabase provider switch. Drive resources, deck/source spreadsheets,
and the UUID worksheet remain Google-backed. Legacy spreadsheets are read only
by the explicit one-time migration helper. The site and Apps Script backend
are separate deployable components; static-site workflow configuration does
not deploy or verify the backend.

## Browser document and initialization

`index.html` provides the application shell, navigation/view markup, inline
bootstrap helpers, manifest and metadata, CSS, and third-party resource
references. Static controls and generated dashboard, study, and cloze controls
use `data-action` attributes; `frontend/js/app-core.js` dispatches those events
through a fixed action allowlist. Its first-party stylesheets apply before the
shell is revealed to avoid an unstyled initial frame. The always-loaded
`frontend/js/app-theme-controller-core.js` applies theme changes to the
document and embedded PDF preview, updates the toggle control, and persists
the preference; the lazy Analytics module delegates to the same controller.
Its deferred `app-entry.js` script is the application entry point.

The entry script fetches and validates `version.json` while loading the
bootstrap and core runtime scripts. The bootstrap initializes configuration,
storage utilities, text/debug/lifecycle helpers, state, preferences, and
dashboard code; runtime scripts then include the application lifecycle
controllers and `frontend/js/app-core.js`,
`frontend/js/app-core-network.js`, `frontend/js/sync-core.js`, navigation, and
modal logic. It waits for runtime dependencies and invokes `initializeApp` in
`frontend/js/app-core.js`, which remains the single application initialization
entry point. Session, analytics, deck-review, and quiz-rendering
scripts load only when their corresponding feature is opened.
The service worker caches these optional scripts after their first request
rather than during installation, so a feature not previously opened requires
a connection on first use. Failures in bootstrap/runtime or feature loading
are logged and surfaced in the UI rather than treated as successful startup.
Browser application modules live in `frontend/js/`; styles and Tailwind source
and generated files live in `frontend/css/`. The root `app-entry.js` and
`sw.js` remain at the site root for bootstrap and root-scope service-worker
behavior. Browser navigation on localhost, GitHub Pages, and `file:` URLs
keeps dynamic routes visible without a `mrhRoute=` key or query string.
Localhost and deployed navigation use clean path segments; the `404.html`
fallback restores GitHub Pages deep links while retaining their URL and uses
theme-aware inline critical styles while it fetches the app shell. Legacy route
query strings remain readable and are migrated to clean paths where path
navigation is supported. `file:` navigation stores the route in history
state because filesystem paths cannot serve virtual app routes; session
storage restores that state after a file-based reload. History state mirrors
the route for in-app back/forward navigation. Localhost deep links require a
static server with an application-shell fallback; `npm run start:dev` provides
that fallback for browser refreshes of virtual routes and sets the app shell's
asset base to the site root so its relative assets continue loading on nested
routes. The Student Portal, Maritime Library, and Reviewer profile share the
resource view but use independent `/materials`, `/library`, and `/profile`
routes and portal modes. `/portal` and `/resources` remain accepted aliases
for the Student Portal. The Student Portal and Maritime Library retain
separate exit confirmations.
Vendored PDF.js assets live in `vendor/pdfjs/`.

## Client modules

- `frontend/js/app-core.js` is the application facade and orchestration layer. It owns
  initialization and integrates dashboard/resource views, app state, network
  operations, session behavior, and user-interface actions. Startup delegates
  scroll/UI binding, theme/skeleton setup, and interrupted-session restoration
  to focused functions.
- `frontend/js/app-bootstrap-core.js` guards runtime readiness and
  initialization re-entry. `frontend/js/app-core.js` retains
  `initializeApp()` as the sole public startup entry point and supplies the
  initialization sequence.
- `frontend/js/app-event-controller-core.js` owns delegated event listener
  registration, scroll-driven header behavior, and debounced study-progress
  persistence. AppCore supplies the action handler and state callbacks.
- `frontend/js/app-status-ui-core.js` owns sync/loading indicators, connection
  status, toast presentation, and startup skeleton state.
- `frontend/js/app-theme-controller-core.js` owns theme application,
  preference persistence, and theme-toggle rendering; AppCore retains the
  existing compatibility functions.
- `frontend/js/app-core-actions.js` owns the delegated UI action allowlist,
  event dispatch, action-attribute generation, and resource portal mode
  selector. `frontend/js/app-core.js` wires the controller and retains the
  compatibility export used by existing callers.
- `frontend/js/resource-telemetry-core.js` owns resource event construction,
  bounded batching, session filtering, flush scheduling, and unauthenticated
  page-exit beacons. `frontend/js/app-core.js` supplies session, filter,
  network, and logging dependencies and retains the resource-view call sites.
- `frontend/js/resource-dashboard-controller-core.js` owns dashboard
  auto-refresh scheduling and return-to-page listeners; AppCore supplies the
  visibility, active-tab, Reviewer-session, and data-loader callbacks.
  `frontend/js/resource-catalog-view-core.js` owns stable table reconciliation,
  catalog filtering, and sorting. It renders data supplied by AppCore and does
  not authorize or fetch Reviewer resources. Dashboard tables stay mounted
  while hidden during uncached section loads; keyed reconciliation preserves
  unchanged rows and cells during subsequent updates.
- `frontend/js/resource-portal-browser-core.js` owns public folder-listing
  requests, listing-cache validation, and stale-request suppression; AppCore
  supplies view rendering and status hooks. The backend remains responsible
  for public-root ancestry and protected-path checks.
- `frontend/js/resource-preview-controller-core.js` owns preview request
  generations and shared preview teardown. AppCore coordinates viewer setup
  and keeps the Reviewer-only access gate in its authentication boundary;
  protected preview requests remain server-authorized.
- `frontend/js/review-controller-core.js` owns review-mode start/restore
  flows, review-to-practice transitions, and deck-level quiz entry from Study
  mode. `frontend/js/app-core.js` retains the compatibility facade while
  SessionCore remains the source of the actual session lifecycle.
- `frontend/js/question-navigation-core.js` owns question movement and
  cloze/choice UI toggles without re-implementing the underlying SessionCore
  logic.
- `frontend/js/progress-service-core.js` owns deck and question favorites,
  archive state, and SRS/stat tracking helpers while delegating the canonical
  session data model to SessionCore.
- `frontend/js/session-persistence-core.js` owns saved-session checks,
  resume restoration, and route-based session recovery without duplicating the
  existing session runtime logic.
- `frontend/js/reviewer-pdf-processor-core.js` owns the PDF worker lifecycle,
  worker operation protocol, cancellation, PDF signature checks, and processing
  entry points. `frontend/js/reviewer-pdf-viewer-core.js` owns the embedded
  viewer lifecycle, status/error messaging, render watchdogs, warmup, and
  preview cleanup. `frontend/js/reviewer-pdf-download-core.js` owns encrypted
  download preparation, validation, issuance, cross-tab locking, preview-source
  retries, and PDF timing records, including the immediate protected-download
  audit call. `frontend/js/app-core.js` remains the facade and coordinates
  these controllers with Reviewer sessions and the shared Resource Portal
  preview state.
- `frontend/js/reviewer-auth-core.js` owns the client calls for Reviewer
  identity verification, session restoration, account-status refresh,
  enrollment, and revocation. `frontend/js/reviewer-session-coordinator-core.js`
  owns Reviewer request coalescing, adaptive poll timing, per-session
  cross-tab locks, and session-bound status/dashboard broadcasts.
  `frontend/js/reviewer-profile-ui-core.js` owns enrollment input
  normalization, name/email warnings, profile editing, and profile rendering.
  `frontend/js/app-core.js` coordinates their UI and app-state callbacks;
  cached profile/access values are display hints only, and backend checks
  remain authoritative for protected operations.
- `frontend/js/app-core-state.js` owns state normalization, question-database readiness,
  local state load/save, one-time migration from the legacy monolithic IndexedDB
  entry, subject-partitioned question-database hydration, verified local deck
  payload fingerprints, question indexes, and state-transfer helpers.
  `frontend/js/app-core.js` persists deck mutations to only the affected
  IndexedDB subject partition.
- `frontend/js/question-type-core.js` owns question-type classification and display names;
  `frontend/js/app-core.js` keeps the existing global functions as compatibility wrappers.
- `frontend/js/resource-course-core.js` owns course-name normalization, catalog entries,
  breadcrumb resolution, and resource filename ordering.
- `frontend/js/resource-dashboard-normalization-core.js` owns Drive resource-link
  validation and ID parsing, dashboard headings, and legacy dashboard-index
  and multi-tab normalization.
- `frontend/js/resource-dashboard-updates-core.js` owns stable dashboard row identities
  and resource update markers. `frontend/js/resource-dashboard-core.js` composes the
  normalization and update APIs for existing callers.
- `frontend/js/resource-reviewer-pdf-core.js` owns Reviewer PDF course/term headings,
  display names, and lesson-title parsing. `frontend/js/resource-catalog-core.js` combines
  these focused modules into the stable `ResourceCatalogCore` API used by
  existing `frontend/js/app-core.js` callers.
- `frontend/js/app-core-network.js` owns backend request schemas, payload/response
  validation, network timeouts, queueing, request coalescing, retries for
  selected idempotent reads, Reviewer session-key persistence and per-request
  proofs, and deck/cache/sync network operations.
- `frontend/js/sync-coordinator-core.js` owns the AppCore sync-controller and
  leader-election lifecycle, composing the existing engine in
  `frontend/js/sync-core.js`. `sync-core.js` coordinates retries, snapshots,
  summary application, polling, and cancellation; the coordinator retains the
  engine's tested API rather than duplicating it.
- `frontend/js/sync-cache-manager-core.js` owns sync/cache timestamps and
  cache-invalidation and backend-status broadcasts.
- `frontend/js/deck-summary-mapper-core.js` normalizes compact and legacy
  summaries, strips access metadata before persistence, and generates stable
  summary signatures.
- `frontend/js/deck-refresh-queue-core.js` owns pending payload refresh
  deduplication, bounded concurrency, retry tracking, and queue continuations.
  It invokes AppCore callbacks for deck storage and network access.
- `frontend/js/deck-repository-core.js` owns serialized subject-partitioned
  IndexedDB saves and deletes, including validation and maintenance of the deck
  index. `frontend/js/deck-database-lifecycle-core.js` owns database-wide
  question-cache clearing so destructive lifecycle operations stay separate
  from ordinary deck persistence.
- `frontend/js/deck-loader-core.js` owns backend deck-request coalescing,
  generation invalidation, and stale-response checks; AppCore supplies deck
  processing and UI callbacks.
- `frontend/js/deck-access-state-core.js` interprets the client-visible
  locked, hidden, and folder-unlocked state. This is a UI/cache interpretation
  only; backend authorization remains authoritative.
- `frontend/js/deck-category-model-core.js` builds the nested category data used
  by Grid folder cards and owns DOM-free nested-folder counts and metadata.
- `frontend/js/deck-navigation-controller-core.js` owns folder entry,
  breadcrumb path changes, and stale-parent click rejection.
  `frontend/js/deck-nav-core.js` retains its existing API and delegates folder
  navigation to this controller.
- Leader elections use `BroadcastChannel` heartbeats and peer expiry. The sync
  controller delegates
  retry scheduling, snapshot retrieval/control-response handling, summary
  timestamp verification, foreground request execution, summary
  application, background status handling and applied-snapshot completion,
  and polling/visibility request coordination to focused internal helpers. A
  pending-sync state helper owns deferred summaries and coordinates the
  applied timestamp/cache checkpoint shared by background and prefetched sync.
- `frontend/js/storage-utils.js` wraps browser local/session storage,
  namespacing, serialization, and restricted-context fallbacks.
- `frontend/js/preferences-core.js`, `frontend/js/dashboard-core.js`,
  `frontend/js/deck-nav-core.js`, `frontend/js/deck-review-core.js`,
  `frontend/js/session-core.js`, and
  `frontend/js/quiz-rendering-core.js` provide preference/dashboard controls,
  navigation, review rendering, practice-session behavior, and question
  rendering.
- `frontend/js/analytics-core.js` renders dashboard charts;
  `frontend/js/ui-modal-core.js` provides shared modal behavior.
- `app-entry.js` coordinates release checks, feature loading, service-worker
  registration, and safe update application. `sw.js` manages offline static
  assets and navigation responses.
  These files use browser globals and are loaded as scripts; there is no
  framework bundler or root application build script in the package manifest.

## Backend and integrations

`BACKEND/backend.js` contains the Apps Script web-app routes,
request validation, deck access and sync, reviewer authorization, resource
APIs, cache/build logic, and audit/logging paths.
`BACKEND/helpers.js` contains setup/diagnostic helpers, and
`BACKEND/jsrsasign.js` bundles the RSA signature verifier.
`BACKEND/appsscript.json` selects the V8 runtime, declares Drive and
Sheets advanced services and OAuth scopes, sets the timezone, and configures
the web app as `USER_DEPLOYING` with `ANYONE_ANONYMOUS` access.
The checked-in root `.clasp.json` uses `BACKEND` as its source root. No staging
backend source tree is checked in; any staging deployment requires a
separately prepared and reviewed source workspace and its own Apps Script
project. The checked-in files do not establish which Apps Script revision is
deployed.

The frontend posts JSON to the configured Apps Script URL in `frontend/js/app-config.js`.
Apps Script `doPost` parses and validates the request and dispatches on its
`type`; `doGet` supports sync/status and deck retrieval flows. Responses are
JSON produced through Apps Script `ContentService`. Google integrations
include Google Identity Services, Google token-info verification endpoints,
Drive/Advanced Drive, Sheets/Spreadsheet services, and Apps Script Properties,
Cache, Lock, Trigger, and Mail services. Supabase is the current server-side
store for Reviewer accounts and activity records. Only eligible central
website logs are persisted to Supabase; routine request traces remain in Apps
Script execution logs. Reviewer sessions and the notification worker's
recipient/cursor state remain in Script Properties. An optional one-minute
time-driven worker emails the configured administrator about new applications,
reading activity records from Supabase. The Supabase schema prerequisites and
staged legacy-data import procedure are documented in
[`SUPABASE_MIGRATION.md`](./SUPABASE_MIGRATION.md).
The frontend request/response contract is unchanged by the storage backend.
Reviewer sign-in writes its audit event to Supabase before creating a session.
Third-party browser assets are declared in `index.html`; some CDN assets use
Subresource Integrity.

## Request, authorization, and trust boundaries

The browser validates outbound requests for correctness and limits, but the
Apps Script backend independently validates the request body, supported
version, request schema, fields, and route-specific access. Because the
web-app deployment is anonymously callable and executes as the deployer,
authorization must be enforced on the server for every protected operation.
Reviewer endpoints verify Google identity or an issued backend session and
check account approval; protected PDF requests additionally require current
Reviewer index membership and current non-trashed PDF metadata. They do not
check the file's folder ancestry or Drive permissions. Since the backend runs
as the deployer, it can deliver an indexed PDF to an approved Reviewer even
when that person has no direct Drive access. The resource portal instead
authorizes access by configured public-root ancestry and exclusion of
protected paths. Details and limitations are in
[SECURITY.md](./SECURITY.md) and
[resources-security.md](./resources-security.md).

## State, caching, synchronization, and errors

`frontend/js/app-core-state.js` stores the question database in IndexedDB key `mrh_db`
(through `idb-keyval`) and user statistics, preferences, summary, and
navigation state in browser storage. Save requests are queued/coalesced. The
client starts IndexedDB retrieval while parsing local state, normalizes and
indexes questions, and reports load failures rather than enabling review with
unavailable data. `frontend/js/storage-utils.js` supplies an in-memory fallback where
browser storage cannot be accessed; that fallback is not durable across page
lifetimes.

Cross-tab leadership is a coordination optimization, not a server-side lock.
Tabs exchange heartbeats on `mrh_leader_election`; if `BroadcastChannel` is
unavailable or setup fails, a tab proceeds as leader. Backend mutation and
cache construction use Apps Script locks. The backend uses `CacheService` for
temporary/cacheable values and Drive files plus Script Properties for selected
persistent cache/build/session state. Cache versions/timestamps and metadata
are used to detect stale sync snapshots; resource listing caches are
revalidated against current folder ancestry before being returned. Cache
payload batches are bounded by both chunk count and serialized byte size, and
pending UUID-sheet rebuilds fall back to the scheduled sync if a resume trigger
cannot be queued. Scheduled sync also repairs an over-age `RUNNING` build
status when no resume trigger remains, then forces a rebuild.

The network module aborts timed-out requests, validates JSON/content types and
response sizes, and adds correlation/request identifiers. It retries only a
defined set of read-safe request types; other POSTs are not automatically
retried. Backend errors use JSON objects with a `status`, `code`, and
`message`; unexpected server exceptions are logged and returned with a
correlation ID. Apps Script locks, trigger-based resumption, and cache
recovery handle backend concurrency and interrupted database builds.

## Offline and release updates

`sw.js` precaches app-shell assets, uses network-first navigation and
stale-while-revalidate behavior for static resources, and leaves API/fetch/XHR
requests untouched. On the canonical GitHub Pages site, a 404 for a deep-link
navigation is passed through so `404.html` can restore the app even when the
service-worker cache is empty. Large optional assets may be cached on demand.
`app-entry.js` checks deployed version metadata and defers updates during
active work; the worker can notify clients that a newer release is
available. The precise versioning contract is in
[release-versioning.md](./release-versioning.md).

## Reviewer PDF pipeline

The backend authorizes each `get_reviewer_pdf_preview` request by reviewer
session, current account approval, and current Reviewer index membership
before reading or delivering source bytes. It checks direct PDF metadata and
type, but does not verify folder ancestry or Drive ACLs. It returns source and
verified watermark identity to the browser. `frontend/js/app-core.js` sends the operation to the
dedicated worker in `reviewer-pdf-service/reviewer-pdf-worker.js`, which
validates and watermarks PDF pages and prepares encrypted downloads. Source
and prepared bytes are not persisted in application storage according to the
worker README. Since an authorized browser receives clean source bytes,
watermarking and download encryption do not prevent that recipient from
extracting the source.

## Deployment

`.github/workflows/deploy.yml` is configured to run on pushes to `main` and
manual dispatch, but its active job references missing release/build helper
scripts; its earlier validation steps are commented out. It is not a
currently functioning CI/publishing pipeline in this checkout. The Apps
Script backend has a separate manifest and clasp project configuration and
must be deployed separately. Deployment credentials, production Script
Properties, live Drive permissions, and production deployment parity are not
established by the source tree.
