# Frontend/backend performance validation

## Current validation status

As of the current checkout, `scripts/` contains only `dev-server.js`. The
large set of `check:*` and `verify:acceptance` commands declared in the root
`package.json` point to missing files, so they cannot be used to produce fresh
performance or regression results. The only checked-in test suite is the
synthetic PDF worker suite under `reviewer-pdf-service/`; it is not a general
application performance test. No browser E2E, repeatable frontend benchmark,
or live Apps Script benchmark command is checked in.

The historical measurements below are records of earlier worktree/browser
observations only. They are not results for the current source, not a
before/after comparison, and not measurements of a current production
deployment. Re-run them with a maintained test harness before relying on
their values.

## Current one-off worker smoke benchmark

On 2026-10-28, a local Node worker smoke test generated an 8.7 KiB PDF with
80 blank pages and watermarked it in approximately 686 ms (about 6 ms parse,
521 ms watermark layout, and 157 ms serialization). This validates the worker
path and shows that page count alone is not enough to explain a 30-second
production average. The input did not contain realistic text, images, fonts,
or complex content streams; this is not a representative PDF benchmark and
does not measure backend, network, browser startup, or PDF.js rendering time.
Do not use it as a production latency estimate.

## Historical local measurements

The previous version of this document recorded local simulations and a
Chromium cold-start run performed on 2026-10-19. Reported examples included
question database initialization with 650 records, a synthetic pagination
simulation with 12,000 questions, and browser startup observations using a
193-item summary. Those measurements belong to the worktree and environment
tested on that date. Their harness scripts are not present in this checkout,
so the results cannot be reproduced using the current repository as-is.

The historical measurements were not production network timings or Google
Apps Script execution metrics. The browser test used a local origin and did
not validate a successful Reviewer sign-in. It did not establish current
production performance or prove an improvement against a baseline.

## Current architectural performance characteristics

The source contains several performance-oriented mechanisms, including
lazy-loading optional study/review modules, local IndexedDB storage for
question decks, compact sync summaries, conditional sync requests, and
request coalescing for deck/resource operations. Their presence is visible in
the source but does not by itself quantify user-perceived performance.

The backend uses Apps Script services and cache/build paths. Its execution
time, quotas, cold-start delay, Drive/Sheets latency, and Supabase availability
depend on live configuration and data and cannot be established by static
inspection.

The Reviewer preview path is intentionally whole-document for watermarking:
the worker parses, watermarks every page, and serializes the prepared PDF
before the viewer receives it. PDF.js then progressively renders visible
pages, but the first page still waits for processing to finish. On repeat
previews in the same authorized session, the frontend may reuse its bounded
source and watermarked-output cache after the backend reauthorizes the request
and confirms the current source version. A verified source-cache hit avoids
another Storage signed-URL request and download; an output-cache hit also
avoids another worker parse/watermark/serialize pass. Neither path bypasses
the backend's issuance limit or audit.

After checking index metadata for freshness, the backend can reuse a cached
Reviewer PDF index entry keyed by index ID, modification time, and file ID.
Version mismatches continue through the existing full-index cache/rebuild path.
Timing events include `indexEntryCacheHit` (schema version 8) so deployed
measurements can confirm whether this optimization is active.

Within one browser-worker operation, Unicode watermark runs are shaped once
and reused for glyph subsetting and output generation. Glyph outline operators
are also reused when the same glyph is drawn repeatedly. Page placement,
watermark content, and final PDF serialization still run for every page;
these changes remove duplicate setup work, not required watermarking or
security checks. A local three-page synthetic smoke test
successfully reopened Latin- and Arabic-identity outputs, but it does not
measure a production latency improvement. Use the representative-corpus
procedure below before making quantitative claims.

Frontend timing logs include the backend request round trip, source download,
worker parse/layout/serialization, worker startup, preview setup, and
first-page render. Backend structured timing events include authorization,
issuance-store RPC, source lookup, Storage URL/cache, audit, and response
construction. Compare these by the shared correlation ID; the server's `totalMs`
does not include browser download, processing, or rendering time.

The browser also logs request preparation (including session-proof signing and
payload serialization), connection-pool wait, HTTP/body-read round trip,
response JSON parse time, and attempt count. This distinguishes client queueing
from the Apps Script execution and from PDF processing. On a first preview,
expect sequential stages: backend request -> signed Storage source download ->
worker parse + all-page watermark + full-document serialization -> PDF.js
first-page render. Do not optimize away the sequential authorization checks,
issuance limit, audit write, or full-document watermark based only on duration.
The worker transfers the serialized output buffer directly when it is a
full-buffer view, avoiding an extra full-PDF copy; non-full-buffer views retain
the bounded copy needed to transfer only the PDF bytes. This removes a memory
copy but has not been measured as a material wall-clock improvement.
The Reviewer browser path also avoids a redundant permissive signature scan
because it immediately enforces the stricter `%PDF-` prefix check; atomic
backend audit updates reuse the already formatted audit timestamp.

## Profiling and comparison procedure

1. In Chrome DevTools Network, record the Apps Script preview request, signed
   Storage GET, response sizes, request start/response end, and cache state.
   In Performance, record worker startup, main-thread long tasks, PDF.js first
   page, and worker parse/layout/serialization timings; use Memory to inspect
   peak heap on maximum-size input.
2. Match the frontend `correlationId` to the backend
   `reviewer_pdf_request_timing` record. Compare server `totalMs` and its
   authorization, issuance-store, Drive/index, Storage, and audit stages with
   client request-preparation, queue, network, download, worker, and render
   stages. A large difference between client HTTP round trip and backend
   `totalMs` points to network/queue/transport overhead, not PDF CPU time.
3. Use a representative, approved corpus spanning source byte size, page
   count, image-heavy scans, vector-heavy pages, embedded fonts, and scripts.
   Run at least 30 cold and 30 warm previews per cohort on a recorded browser,
   device, network, and deployment revision. Report p50/p90/p95 and failure
   rates for time-to-first-page and total preparation; do not infer production
   results from blank synthetic PDFs.
4. Apps Script executions and the structured timing events are the applicable
   backend profilers here; Python `cProfile`, Node `clinic`, worker-thread, or
   server-process recommendations do not apply to this Apps Script deployment.
   Do not deploy backend changes that skip authorization, per-issuance rate
   limiting, or audit semantics to improve a timing metric.

## How to measure future changes

For a useful comparison, record the exact Git revision, browser/device,
network conditions, deployed frontend and backend versions, test data shape,
cache/service-worker state, and number of repetitions. Separate cold and warm
runs and report medians and ranges rather than a single best case. Measure
browser readiness and actual first-usable task milestones independently from
background sync completion.

Production tests require explicit deployment and data authorization. Test
matching frontend/backend revisions and distinguish synthetic local results
from measurements using real Google services. Do not include production
credentials, user data, protected PDFs, or private logs in benchmark artifacts.
