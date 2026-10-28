# Protected Reviewer PDF processing

Reviewer PDF source requests are authorized by the Google Apps Script backend.
After checking the session, current account approval, Reviewer index
membership, and direct PDF metadata/type, it returns source bytes and verified
watermark identity. It does not check folder ancestry or Drive ACLs. Because
the web app executes as its deployer, an approved Reviewer can receive any
indexed PDF the deployment identity can read, regardless of the Reviewer's
direct Drive access. The browser coordinates preview lifecycle through
`frontend/js/reviewer-pdf-viewer-core.js`, encrypted download issuance through
`frontend/js/reviewer-pdf-download-core.js`, and PDF worker operations through
`frontend/js/reviewer-pdf-processor-core.js`. The worker applies all PDF
changes.
The worker output is used for viewing and downloading; neither source nor
prepared bytes are persisted in application storage or written back to Drive.
For signed delivery, the browser may retain the most recently previewed source
and, for prepared output no larger than 16 MiB, the watermarked PDF in
session-scoped in-memory caches. Each preview still reauthorizes with the
backend. Cached source bytes are reused only when the backend confirms the
same source version and length; cached watermarked output additionally
requires the same verified identity, issuance reference, and download
filename. Both caches are cleared when the Reviewer session changes or ends.
When the browser advertises a valid in-memory signed-delivery source cache,
the backend may return freshly authorized metadata without minting another
Storage signed URL, but only after its current source-version check matches.
Otherwise the normal signed-URL delivery path is unchanged.

This deliberately means an authorized recipient can inspect or save the
unwatermarked source from the network response or browser memory. Backend
authorization blocks unauthorized requests, but client-side watermarking
cannot conceal the source from a user already authorized to receive it.

## Access and attribution

Before reading a source, the backend revalidates the reviewer session and
current `mrh_accounts` approval, confirms that the file remains in the current
Reviewer PDF index, and fetches current direct PDF metadata to verify that the
indexed item exists, is not trashed, and is a PDF. It does not inspect folder
ancestry or Drive permissions. The Apps Script web app executes as its
deployer and brokers file bytes to approved Reviewers, so Drive's owner-only
sharing does not restrict who can retrieve an indexed PDF through this
endpoint. The index and reviewer approval are the request-path access
controls; administrators are responsible for keeping the index correct.

The backend derives the full name from the approved account record and the
email from verified sign-in identity, then sends those values to the
authorized browser. Server logs redact user names, emails, credentials, and
session identifiers; PDF audit rows use a SHA-256 account fingerprint rather
than the real name or email. The Web Worker embeds the verified values in the
PDF as its author, subject, and keywords, and prints them repeatedly across
each page. It embeds Noto Sans subsets for Latin extensions, Cyrillic, Greek,
Indic scripts, Thai, Khmer, Lao, Myanmar, Georgian, Armenian, and Ethiopic
names, plus Japanese, Simplified Chinese, Traditional Chinese, Korean, and
symbol fallbacks. Font files are separate, pinned, self-hosted worker assets;
the worker loads only the subset(s) needed for that identity and script, then
checks each grapheme against the selected font before embedding. Mixed-script
names fall back to the subset that contains each glyph; a missing glyph or
font-loading failure causes an explicit processing error, never a partial or
unwatermarked result. Identity text is NFC-normalized (not compatibility
transliterated), and names beyond the supported length are rejected rather
than silently truncated. Fontkit shapes supported script runs; the worker
positions each embedded glyph using the shaper's advance and offset metrics.
Arabic and Hebrew runs use bidi-js embedding levels and fontkit
OpenType shaping, then paint the shaped glyph outlines as PDF vector paths
using those same advances, offsets, and page transforms. The corresponding
embedded-font text remains in the PDF with Unicode mappings and logical
`ActualText`, but uses invisible text rendering so unreliable RTL subset glyph
outlines cannot corrupt the visible watermark. Missing glyphs and font-loading
failures still fail the entire operation; no RTL identity is silently omitted
or transliterated. The backend-provided filename becomes the PDF title.

The existing watermark layout is preserved: small edge and perimeter marks
plus the interior diagonal/horizontal pattern, all with the existing 18%
opacity. The worker keeps the source's text and vector structure and does not
rasterize pages; only shaped RTL watermark glyphs are emitted as vector
outlines. The two-line name/email placement remains unchanged.

Watermarks are a redistribution deterrent and an attribution aid, not
tamper-proof protection. A recipient can still remove PDF objects, crop,
redact, screenshot, photograph, or OCR the document. This design does not
claim otherwise.

Each preview or download issuance receives a random, non-sequential `MRH-...`
reference in the form `MRH-1234-5678`, derived from a backend-generated UUID.
This compact visible label is not an authorization credential; the separate
UUID audit event ID remains the unique log key.
Apps Script validates only the `%PDF-` signature within the first 1024 source
bytes; it does not parse or modify PDF content. The reference is printed as a
third line within the existing watermark blocks is no more than half the email
line size; the name retains its established size, the email is 80% of the
name size, and line spacing is compact. The issuance reference also appears in
every page footer; watermark positions remain unchanged. A very faint
(2.5%-opacity) tiled `MRH` vector overprint adds a subtle micro-pattern without
rasterizing the source. The reference, a SHA-256 account fingerprint, source
file ID/title, and issuance time are associated in the protected Reviewer
access log; the log omits the account's real email and name. Each download
click makes a fresh authenticated request and receives a new reference rather
than reusing the preview copy.

While viewing, a separate low-opacity overlay displays the MRH brand and
verified full name/email. It moves around the viewer every five seconds and
stays fixed relative to the viewer while pages are scrolled. Websites cannot
reliably detect or block screenshots. The overlay discourages clean captures
but does not prevent screenshots or screen recording. Invisible OCR-sabotage
text is intentionally excluded to preserve accessibility and legitimate text
extraction.

Bulk-extraction friction is account-scoped: at most 30 PDF issuances in a
ten-minute interval and 20 distinct documents in an hour. Repeated issuances
of one document count toward the request cap but not the distinct-document
cap. A structured Apps Script log alert is emitted at 12 distinct documents.
These controls are deterrents, not guarantees against a determined user.
They use per-account cache values without a global ScriptLock to avoid blocking
unrelated application requests. Cache reads and writes do not form an atomic
transaction, so simultaneous requests can exceed the stated thresholds.

The request endpoint does not gate PDF delivery on Drive ACLs. The separate
administrative `auditReviewerPdfDrivePermissions()` and guarded revocation
workflow remain available for reviewing and managing Drive sharing; they do
not affect endpoint authorization. The local tests cannot inspect live Drive
ACLs.

## Flattening and document quality

The processed PDF remains a PDF containing its original text/vector objects
and an overlaid vector watermark. This preserves searchability, accessibility,
and the exact existing mark placement. Flattening a complete document into
page images would require rendering and recompressing every page, increase
client processing time and memory, often increase file size (especially for charts or
scans), reduce text clarity when zoomed, and remove searchable/selectable
text. It would not stop screenshots, OCR, or access to an original through
Drive permissions. It is intentionally not used.

## PDF library and deployment setup

- `@cantoo/pdf-lib` **2.11.1**, pinned in `reviewer-pdf-service/package.json`,
  with its AES-256 encryption-capable browser bundle and MIT license in
  `reviewer-pdf-service/vendor/`.
- `@cantoo/fontkit` **2.0.12**, pinned in `reviewer-pdf-service/package.json`,
  with its MIT notice in
  `reviewer-pdf-service/vendor/runtime/reviewer-pdf-fontkit-2.0.12-LICENSE.md`,
  and Noto Sans, Noto Sans Symbols, and Noto Sans Symbols 2 **5.3.0** subsets,
  pinned in the root `package.json`. The symbol subsets are the final fallback
  after script-specific fonts. The worker also loads pinned
  `regenerator-runtime` **0.14.1** to support fontkit's complex-script shaping.
- `bidi-js` **1.1.0**, pinned in the root `package.json`, provides Unicode
  Bidirectional Algorithm processing. Its self-hosted runtime bundle and MIT
  notice are in `reviewer-pdf-service/vendor/runtime/`.
- All bundled Noto Sans font families are OFL-1.1; the license is included in
  `reviewer-pdf-service/vendor/watermark-fonts/OFL-1.1.txt`, alongside the
  independently loadable font subsets.
- `scripts/vendor-reviewer-pdf-fontkit.js` generates the fontkit and
  watermark-font runtime assets in `reviewer-pdf-service/vendor/`. Each
  Japanese, Simplified Chinese, Traditional Chinese, or Korean subset is
  SHA-256 pinned in the generator and loaded only when that subset is selected.
- Unsupported or malformed Unicode, missing names, and invalid email values
  fail with an actionable worker error; watermark processing never emits an
  unwatermarked fallback. Account names and email addresses are not included
  in error messages.
- `scripts/vendor-reviewer-pdf-lib.js` generates the browser bundle
  `reviewer-pdf-service/vendor/cantoo-pdf-lib-2.11.1.min.js` from the pinned local
  package. It is loaded only by `reviewer-pdf-service/reviewer-pdf-worker.js`
  and published as a content-hashed website asset under the same directory.
- The browser worker, runtime bundles, licenses, font bundles, and source font
  subsets are consolidated under `reviewer-pdf-service/`. Deployment copies
  only the worker and required runtime bundles to the matching website paths;
  test tooling, package dependencies, and source WOFF files are not published.
- The production Apps Script project uses `backend (main)/main.js` and
  `backend (main)/appsscript.json`; no staging backend source tree is checked
  in. Apps Script does not load pdf-lib or watermark PDFs.

To update the browser library, run `npm run vendor:reviewer-pdf-lib`; rebuild
the static website assets using its normal deployment process. To deploy
backend changes, update `main.js` and the manifest, save, and deploy a new
Apps Script web-app version. The web app must execute as the owner
(`USER_DEPLOYING`) with the Drive advanced service enabled. The existing
`drive` scope is required. Do not publish backend files as website assets.

## Local tests

From the repository root:

```powershell
npm ci
npm ci --prefix reviewer-pdf-service
npm run vendor:reviewer-pdf-lib
npm run vendor:reviewer-pdf-fonts
npm test --prefix reviewer-pdf-service
npm run check:reviewer-pdf-security
npm run check:reviewer-authorization
npm run check:deployment-assets
```

The PDF tests run the browser worker against synthetic PDFs. They verify the
existing name/email placement, reference and MRH pattern, metadata, source
text preservation, input immutability, invalid input, 16 MiB source and
46 MiB serialized-output limits, and the 80-page processing limit. A focused
PDF.js + canvas regression rasterizes generated output and compares its pixels
with the clean source to prove the embedded watermark is visible. Unicode
regressions cover multi-script and right-to-left names, combining-mark
positioning, mixed-direction text, canonical normalization, and visible
rendering. Unsupported glyphs and overlong names must fail closed rather than
being omitted or truncated. The local source checks verify session/account
and index enforcement, direct PDF metadata checks, and that request-time PDF
retrieval does not inspect ancestry or ACLs. These tests do not replace
deployment validation: after
deployment, test an approved account, a revoked account, an unlisted PDF, and
direct Drive access to representative original files.

To save source/output PNG contact sheets while running the Unicode regression
tests, set `MRH_PDF_VISUAL_EVIDENCE_DIR` to a local output directory before
running `node --test reviewer-pdf-service/browser-worker.test.js`. The
generated sheets compare identical-resolution source and watermarked renders
for representative mixed-script, Arabic, Devanagari, Thai, Japanese, and
long-name pages. Keep generated images outside the repository unless they are
specifically needed for a reviewed change.

The live endpoint returned a JSON `SESSION_INVALID` response to a request with a
deliberately invalid reviewer session and no PDF data. This confirms rejection
for that unauthenticated request only. The deployed endpoint rejected the
workspace's current client version as outdated, so this test does not establish
that the workspace's code is deployed or that an approved request reaches the
new authorization and logging path. Before relying on the controls, verify the
deployed version returns the authorized source and reference for an approved
request, and explicit JSON errors for revoked, unlisted, and cross-account
requests. A Drive ACL change alone is not expected to deny the endpoint; test
Drive access separately if validating direct-link privacy. The local
POST-route checks do not substitute for those live successful-path tests.
An approved browser response intentionally contains clean source bytes, so this
design does not claim to hide a source from an authorized recipient.

## Request flow

1. The browser calls `get_reviewer_pdf_preview` with an opaque reviewer
   session, event ID, and indexed file ID.
2. Apps Script revalidates the session and current account approval, index
   membership and current PDF metadata. It does not check folder ancestry or
   Drive permissions; the Reviewer index determines which Drive-readable
   PDFs approved Reviewers may retrieve through the app.
3. Apps Script assigns a unique issuance reference, records the protected-view
   or download audit event, and returns clean source bytes with verified
   identity/filename metadata. It checks only the bounded PDF signature and
   does not parse or modify content; failures before delivery return an
   explicit error.
4. The browser worker validates the PDF, embeds identity and issuance reference
   in its metadata, and watermarks every page before viewing or download.
5. Each download click makes a new authenticated request so every downloaded
   copy is reauthorized and audited against the user's permanent issuance
   reference. If the source version is unchanged, the
   request reuses the source bytes already held in page memory instead of
   rereading and retransferring them; session/approval/index checks, download
   auditing, and client-side watermarking still run for every click.
   A changed source version triggers a fresh source read.
6. Download output is AES-256 encrypted with the final four digits of its
   reference. This encryption pass is deferred until the user requests a
   download so it does not compete with preview rendering; the viewer reports
   while the protected copy is being prepared. Its filename is
   `[XXXX] filename (LAST NAME, FIRST NAME).pdf`.
   Since the password appears in the filename, this provides a password prompt
   for casual friction, not meaningful confidentiality.

An unauthorized request must fail before source bytes are read or returned.
Once delivered to an authorized browser, the clean source is available to
that recipient; browser-side watermarking cannot enforce non-extraction.
