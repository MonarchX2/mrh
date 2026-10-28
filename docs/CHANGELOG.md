# Changelog

## 26.10.28-1 - 2026-10-28

### Fixed

- Recover deployment scripts for GitHub Actions workflow (resolve-semver-version.js, stamp-release-version.js, verify-release-version.js, public-pages-deployment.js, prepare-pages-assets.js).
- Adapt deployment scripts to work with date-based versioning (YY.MM.DD-N) instead of semantic versioning.
- Remove Supabase secrets from helpers.js to resolve GitHub push protection violations.

## 26.10.27-2 - 2026-10-27

### Fixed

- Resolve frontend CSS and JavaScript issues in styles, app-core, resource-telemetry-core, and session-core modules.

## 26.10.27-1 - 2026-10-27

### Improved

- Redesign changelog modal with modern polished design, improved visual hierarchy, and category badges.
- Implement collapsible changelog releases with smooth animations and accordion behavior.
- Add pagination (3 versions per page) to changelog modal for better navigation.
- Remove breadcrumb navbar background color while preserving outline.
- Keep "Folders (X)" and "Cards (X)" in their respective sections in the Grid view.
- Align section headers with toolbar controls in dashboard layout.
- Add text clipping to section headers to prevent wrapping in small spaces.

### Fixed

- Ensure consistent spacing around "Cards (X)" section headers.
- Remove background color from "No decks match your filter" message while retaining outline.
- Fix changelog modal body height to prevent header/pagination from being hidden by entries.

## 26.10.26-2 - 2026-10-26

### Improved

- Move Home source, sort, and Study/Quiz controls into the deck list beside the Folders/Cards heading.
- Tighten deck card spacing and the gaps between the Student Portal, breadcrumb, and deck controls.
- Place Study defaults and Deck Navigation Buttons side by side in Settings.
- Add Settings toggles for Show Explanations and Show ABCD Markers, with ABCD markers off by default.
- Animate source, sort, and quiz filter dropdowns and keep them working after the deck list re-renders.

### Fixed

- Keep Reviewer dashboard loading from blocking other Student Portal tabs.
- Keep source and sort labels in sync after changing those filters.

## 26.10.26-1 - 2026-10-26

### Improved

- Remove file type suffixes from DOCUMENTS section filenames when file type is displayed separately.
- Make HANDBOOK entry always visible in SYLLABUS section regardless of filters, pinned to top of list.
- Display "2025" as the second line under HANDBOOK entries.

### Security

- Remove NAV3-specific course heading logic from Reviewer dashboard normalization.

## 26.10.25-3 - 2026-10-25

### Improved

- Rename Student Portal "Subjects" tab navigation, search icon, and search placeholder to "Courses".
- Rename Student Portal table column header and display toggle from "Subjects" to "Course Name".
- Standardize Documents file and folder count status message formatting with consistent item count phrasing.
- Preserve folder names directly in Documents listing and breadcrumb navigation.
- Improve performance of folder navigation and large resource listings.

## 26.10.25-2 - 2026-10-25

### Fixed

- Fix "Study defaults" and "Deck Navigation Buttons" settings not being toggleable
  when not in an active deck session. These sections now properly set global
  preferences while deck-specific session settings (set from modal toggles during
  active sessions) continue to take priority for individual decks.

## 26.10.25-1 - 2026-10-25

### Improved

- Adjust dashboard spacing: remove sort box left padding and match Learning
  Materials/BSMT Library spacing to deck gaps.

### Fixed

- Fix study session URL to show proper /study suffix instead of /deck-review.
- Fix DOCUMENTS section file names not updating when renamed in Google Drive.
- Remove unnecessary quiz session restoration notification.

## 26.10.24-1 - 2026-10-24

### Improved

- Refine dashboard controls, responsive deck layouts, and study-session
  navigation.
- Improve document loading and thumbnail availability while keeping background
  synchronization unobtrusive.
- Improve folder filtering and Favorite/Archive actions, including nested
  folders.
- Keep local deep-link refreshes working through the SPA-aware development
  server on port 5500.

### Fixed

- Fix archive confirmation wording to show only the immediate folder name.
- Fix dashboard and folder actions that did not respond when selected.

### Verified

- Expand regression checks for dashboard layouts, navigation, resource
  loading, and archive behavior.

## 26.10.22-4 - 2026-10-22

### Improved

- Improve application performance and reliability through internal code organization.

### Verified

- Expand regression checks for application stability.

## 26.10.22-3 - 2026-10-22

### Improved

- Improve Reviewer PDF preview loading performance.

### Security

- Strengthen data handling practices.

## 26.10.22-2 - 2026-10-22

### Improved

- Refine Student Portal and resource dashboard layouts for narrow screens and
  long labels.
- Keep Reviewer dashboard results visible while refreshing and improve
  feedback when a refresh cannot complete.
- Separate Syllabus dashboard data from Reviewer materials and refresh
  Reviewer PDF access checks.

## 26.10.22-1 - 2026-10-22

### Improved

- Restore signed-in profile information immediately after refresh and avoid
  rebuilding unchanged profile content.
- Refine spacing between dashboard filters and their table.

## 26.10.22-0 - 2026-10-22

### Improved

- Improve study data loading, resource access, and application reliability.
- Enhance navigation, review workflows, and dashboard usability.

### Fixed

- Improve recovery from interrupted updates and prevent stale information from
  replacing current application data.
- Improve reliability when loading protected learning materials.

### Verified

- Expand automated checks for application startup, account access, resources,
  and frontend behavior.

## 26.10.21-7 - 2026-10-21

### Improved

- Improve account access workflows and operational reliability.

### Removed

- Remove QR-based progress transfer and its bundled encoder/decoder assets.

## 26.10.21-6 - 2026-10-21

### Improved

- Improve tracking of Library dashboard visits.
- Restore saved study/quiz preferences before revealing the app shell.
- Keep Reviewer PDF verification and download fallback visible during preview
  initialization, without exposing the filename password reminder.
- Improve resource dashboard mobile spacing and keep preview/update guidance
  available throughout Reviewer access states.

### Fixed

- Prevent the default study/quiz toggle state from overwriting the saved mode
  during startup.
- Show the prepared-PDF download fallback as soon as authorized bytes are
  ready, instead of leaving an intermediate loading status on screen.

## 26.10.21-5 - 2026-10-21

### Improved

- Check reviewer approval more frequently while a tab is visible without
  changing background-tab polling.
- Keep Deck Navigation Buttons settings expanded and remove the Danger Zone
  controls from Settings.

### Fixed

- Apply first-party app styles before revealing the shell, and keep the
  GitHub Pages deep-link fallback styled while it loads.
- Let the service worker pass through canonical deep-link 404 responses so
  the app can recover after its offline cache has been cleared.

### Verified

- Focused settings, routing, startup, service-worker, browser-contract, and
  deployment-asset checks pass.

## 26.10.19-7 - 2026-10-19

### Improved

- Use standard PDF fonts for common English and Latin text, with a visible
  fallback watermark when Unicode font assets cannot load.
- Center the download confirmation and restore its “Password:” reminder.
- Enlarge the second line of the Reviewer PDF preview title.
- Add a small gap between the viewer's preview-error message and password hint.
- Hide the stale loading spinner when the viewer recovery dialog appears, even
  if PDF.js never completes its startup handshake.
- Center the recovery dialog in the PDF viewer after the loading status clears.
- Keep preview initialization and rendering failures inside the PDF viewer,
  with the embedded recovery dialog and download control remaining visible.
- Label preview interruptions so unexpected exits can be traced to the exact
  tab, access-status, sign-out, or viewer-return action.

### Fixed

- Keep the viewer open when its ready handshake or first-page render stalls,
  instead of replacing the viewer-owned recovery dialog with a second prompt.
- Change the viewer recovery message to “The PDF preview did not initialize.”
- Reject and discard the PDF processing worker when its hard operation deadline
  expires, so unresponsive worker jobs cannot leave preview preparation pending.

### Verified

- Reviewer dashboard, PDF security, portal, and deployment asset checks pass.
- All 32 Reviewer PDF worker tests pass.

## 26.10.19-3 - 2026-10-19

### Improved

- Use the built-in English font for ASCII watermarks and defer Unicode font
  libraries until Unicode text needs them.
- Keep the PDF loading fallback to a single dialog and emphasize the download
  password reminder.

### Verified

- Focused Reviewer dashboard, authorization, PDF security, and asset checks pass.
- All 32 Reviewer PDF worker tests pass.

## 26.10.19-2 - 2026-10-19

### Improved

- Clarify the PDF download confirmation and keep its password reminder compact
  and italicized.
- Keep Reviewer download records compatible with previous releases while
  preserving a consistent download experience.

### Fixed

- Show a clear PDF preview failure and download fallback when the viewer
  handshake or document transfer fails, instead of leaving “Loading preview”
  visible indefinitely.

### Verified

- Focused Reviewer dashboard, authorization, and PDF security checks pass.
- All 31 Reviewer PDF worker tests pass.

## 26.10.19-1 - 2026-10-19

### Improved

- Reduce legacy synchronization latency by overlapping summary retrieval with
  final cache-consistency verification while retaining stale-snapshot checks.
- Improve request diagnostics and timestamp consistency.
- Refresh the protected PDF worker runtime and multilingual watermark
  dependencies, and keep PDF.js workers ready for Reviewer previews.

### Fixed

- Register the PDF viewer's parent error handler before PDF.js document loading
  so a watchdog failure cannot be lost while the preview remains loading.
- Preserve cached-first home rendering without allowing cached Reviewer data
  to authorize protected actions.

### Verified

- All 41 repository acceptance checks and all 31 Reviewer PDF worker tests
  pass.

## 26.10.18-15 - 2026-10-19

### Improved

- Improve application responsiveness and data loading performance.
- Enhance resource listing reliability and navigation.
- Consolidate PDF processing components.
- Improve diagnostics for resource loading and synchronization.

### Fixed

- Prevent stale data from overwriting current state.
- Improve error handling for unavailable or protected resources.
- Improve recovery from delayed storage or network conditions.

### Verified

- All 41 repository acceptance checks and all 29 Reviewer PDF worker tests pass.
- JavaScript syntax and whitespace checks pass.

## 26.10.18-14 - 2026-10-19

### Improved

- Resume bounded background synchronization when the site becomes visible or
  connectivity returns, coalesce in-flight syncs, and reduce duplicate
  Reviewer status and dashboard requests across tabs.
- Improve account update reliability and background synchronization.

### Fixed

- Retry failed summary synchronization without advancing its timestamp, and
  discard hidden-tab sync responses instead of applying stale data.
- Improve recovery from interrupted account and sign-out updates.
- Preserve compatibility with existing account records while rejecting
  unsupported formats.

### Verified

- All 36 repository check scripts, JavaScript syntax checks, production
  dependency audit, and `git diff --check` pass.

## 26.10.18-13 - 2026-10-18

### Improved

- Improve request diagnostics and data handling.
- Keep Reviewer PDF previews responsive with clearer loading and error states.
- Reduce unnecessary backend checks while the website is idle without delaying
  requests that require current account or access state.

### Fixed

- Prevent stale data from replacing current state.
- Improve resource request validation and handling.

## 26.10.18-12 - 2026-10-18

### Fixed

- Clear stale Reviewer PDF preview status and advance the loading indicator as
  the authorized PDF is received and rendered.

## 26.10.18-11 - 2026-10-18

### Improved

- Improve Reviewer PDF preview rendering and display.
- Improve request reliability and session management.
- Default Student Portal filters to All and retain user selections.
- Improve deck and folder layout and mobile navigation.

### Fixed

- Improve loading state visibility during account verification.
- Report runtime exceptions during startup.
- Prevent duplicate navigation prompts.
- Hide obsolete settings sections.

## 26.10.18-10 - 2026-10-18

### Improved

- Bound frontend–GAS request and response handling, validate server-side POST
  schemas and GET parameters, and keep request timeouts active through response
  body parsing.

## 26.10.18-9 - 2026-10-18

### Fixed

- Prevent retries of state-changing backend requests, discard synchronization
  responses after cancellation, and validate PDF response types and signatures
  before previewing.

## 26.10.18-8 - 2026-10-18

### Improved

- Improve Reviewer PDF watermark placement and access control.

### Fixed

- Prevent recursive dashboard rendering during session restoration.

## 26.10.18-7 - 2026-10-18

### Improved

- Improve reliability of the sign-in and account access experience.

### Fixed

- Show the website's download confirmation above the fullscreen PDF preview.

## 26.10.18-6 - 2026-10-18

### Fixed

- Improve PDF watermark placement and fix initialization issues.
- Improve account and PDF loading states.
- Improve account restoration and download confirmation.
- Improve PDF processing validation.
- Improve Student Portal navigation and error handling.
- Detect incompatible browsers and provide alternative access options.
- Prevent automatic line breaks in formatted text.

## 26.10.18-4 - 2026-10-18

### Fixed

- Keep automatic list line breaks out of answer choices while preserving
  math-aware choice formatting.

## 26.10.18-3 - 2026-10-18

### Improved

- Simplify deck browsing to a responsive grid, group folders before cards, and
  keep deck labels readable across all cards.
- Render math-aware formatting in practice and review answer choices.
- Add a dedicated focus control to the Student Portal Subjects search.

## 26.10.18-2 - 2026-10-18

### Improved

- Expand About MRH with an overview of study tools, Student Portal resources,
  Reviewer access, syncing, and responsible use.
- Move Changelogs beside About MRH in Settings and group patch releases by
  version date.
- Keep About MRH available across views, center the displayed version, and
  hide the Changelogs link outside Settings.

## 26.10.18-1 - 2026-10-18

### Improved

- Rerender visible mobile Reviewer PDF pages at higher resolution when users
  pinch to zoom.
- Remove hidden or removed decks from the browser's cached questions and
  summary after a successful backend sync.
- Keep protected deck questions in memory only and remove outdated browser
  copies when their status is known.
- Improve Reviewer PDF preview loading and performance.

## 26.10.17-19 - 2026-10-17

### Improved

- Improve account access reliability and error handling.
- Improve synchronization across open tabs.
- Expand checks for application recovery and concurrent requests.

## 26.11.3 - 2026-10-17

### Improved

- Improve Reviewer PDF preview performance.
- Improve PDF preview performance.
- Improve PDF preview loading and performance.

## 26.11.2 - 2026-10-17

### Added

- Improve access to learning materials for signed-in users.

### Improved

- Keep Student Portal resource chips content-sized, with centered labels and
  left-aligned file icons.
- Validate temporary permissions and Drive links before navigation, recognize
  existing access, and revoke grants that Drive does not confirm correctly.

## 26.11.1 - 2026-10-17

### Improved

- Stream Student Portal PDFs and unsupported Modules files through Drive's
  native preview, with return navigation and an in-site PDF fallback.
- Keep Reviewer PDF previews responsive on mobile with the bundled PDF.js
  viewer and preserve native browser playback for audio and video files.
- Show the Reviewer PDF download fallback only after a preview error or a
  missing viewer-load signal.

## 26.10.17-4 - 2026-10-17

### Improved

- Stream Student Portal PDFs and unsupported Modules files through Drive's
  native preview, with return navigation and an in-site PDF fallback.
- Keep Reviewer PDF previews responsive on mobile with the bundled PDF.js
  viewer and preserve native browser playback for audio and video files.
- Show the Reviewer PDF download fallback only after a preview error or a
  missing viewer-load signal.

## 26.10.17-3 - 2026-10-17

### Improved

- Keep Reviewer PDF previews responsive on mobile, include the full course
  title, and provide a working download option when an embedded preview fails.
- Add consistent return navigation throughout nested Modules previews.
- Improve Subjects table centering and content-sized horizontal scrolling.
- Restore a retryable offline page when the app starts without a connection,
  and show the welcome banner by default after app data is cleared.

## 26.10.17-2 - 2026-10-17

### Improved

- Remove Facebook click identifiers from the browser address bar after startup.

## 26.11.0 - 2026-10-17

### Added

- Populate the Student Portal SUBJECTS catalogue with centralized course
  titles, ordering labels, searchable entries, and a consistently centered
  table with an always-visible Year column.
- Add inline clear controls to reviewer name fields.

### Improved

- Keep Semester selectable across all four Student Portal sections when Year
  is set to All, and preserve valid semester choices when changing years.
- Make reviewer Middle Initial optional, clear the entire value on deletion,
  and show Resubmit for denied profiles.
- Support combined resource-index data, numeric sequence ordering, and fixed
  3.1 catalogue terms for the designated courses.
- Refine in-site resource navigation, reviewer activity logging, and browser
  PDF processing.

### Fixed

- Prevent an unavailable saved semester from leaving the Subjects catalogue
  empty after changing the Year filter.

## 26.10.35 - 2026-10-17

### Improved

- Preload Reviewer data as soon as approved access is verified, alongside the
  public Modules and Syllabus dashboard data.
- Hide full folder paths, add compact Up navigation and list/grid folder views,
  and show a non-bold BSMT term beneath course names when Semester is All.
- Improve tracking of profile and resource navigation.
- Simplify PDF processing and remove obsolete background work.

## 26.10.34 - 2026-10-17

### Improved

- Improve Reviewer PDF preview and download performance.
- Simplify PDF processing and improve document handling.

## 26.10.33 - 2026-10-17

### Improved

- Improve the reliability of protected PDF previews and downloads.
- Improve PDF processing efficiency.
- Restore the last Student Portal section for signed-in users and improve
  folder navigation.
- Improve folder preview styling and download notifications.

## 26.10.32 - 2026-10-17

### Improved

- Improve PDF preparation and validation for previews and downloads.
- Improve resource navigation and file preview handling.
- Improve asset caching and delivery.

## 26.10.31 - 2026-10-17

### Improved

- Improve PDF preparation for previews and downloads.
- Improve consistent PDF page layout for preview and download.
- Improve Student Portal filter controls and indicator styling.
- Optimize website payload size.

## 26.10.30 - 2026-10-17

### Improved

- Restore independent Year, Semester, and Category selections for MODULES,
  REVIEWERS, and SYLLABUS when users switch sections or return.
- Keep Reviewer PDF preview and download output consistent, and reuse prepared
  files instead of creating duplicate copies.
- Improve validation and reliability for Reviewer PDF previews.
- Optimize download performance.
- Optimize website payload size.
- Remove optional dashboard settings.
- Improve filter control animations and styling.
- Improve PDF preview layout and restrictions.
- Center the PDF preview spinner and its “Loading PDF preview...” label.

- Improve dashboard chip styling and change badge behavior.

## 26.10.29 - 2026-10-17

### Fixed

- Improve offline screen navigation.
- Improve resource preview layout.
- Improve PDF preview and download formatting.
- Enlarge table headings throughout the Student Portal.

## 26.10.28 - 2026-10-17

### Fixed

- Improve session expiration handling during PDF download or preview.

## 26.10.27 - 2026-10-17

### Fixed

- Bold all text in the resource dashboard COURSE column.
- Improve session expiration handling.
- Improve sign-in flow.

## 26.10.26 - 2026-10-17

### Improved

- Improve PDF icon styling consistency.
- Improve online PDF preview layout and loading states.
- Improve request prioritization.

## 26.10.17-18 - 2026-10-17

### Fixed

- Keep PDF icons on all table resource chips dark red in both themes, without
  changing the preview-window icon.

## 26.10.17-17 - 2026-10-17

### Fixed

- Match PDF icons on table resource chips to the preview icon without changing
  the preview icon styling.

## 26.10.17-16 - 2026-10-17

### Fixed

- Make the offline Retry button, restored-connection handler, and browser
  refresh navigate to the canonical website URL.

## 26.10.17-15 - 2026-10-17

### Fixed and improved

- Keep the Reviewer PDF preview course name bold while using regular weight for
  the lesson details below it.
- Show a PDF icon to the left of PDF preview titles, using the same light and
  dark theme colors as the PDF resource chips.
- Defer automatic website updates until a Reviewer PDF download finishes.

## 26.10.17-14 - 2026-10-17

### Fixed

- Use regular-weight text for both lines of the Reviewer PDF preview title.

## 26.10.17-13 - 2026-10-17

### Improved

- Improve sign-in setup and Reviewer PDF delivery reliability.
- Format Reviewer PDF preview titles and table chips as compact two-line
  course/lesson labels.
- Improve dashboard filter control layout.

## 26.10.17-12 - 2026-10-17

### Improved

- Update the portal notice to say file updates may take up to a minute.

## 26.10.17-11 - 2026-10-17

### Improved

- Reuse recently previewed Reviewer PDF bytes within the current tab.
- Disable Reviewer category filters that have no resources for the selected
  year and semester.

## 26.10.17-10 - 2026-10-17

### Fixed

- Show NEW and UPDATED badges for changed resources in MODULES and SYLLABUS.
- Improve Student Portal welcome banner spacing and layout.

## 26.10.17-9 - 2026-10-17

### Fixed

- Clarify profile completion and account access states.
- Improve synchronization performance and cache reliability.

## 26.10.17-8 - 2026-10-17

### Improved

- Improve synchronization performance and cache reliability.
- Improve mobile Reviewer PDF viewer layout and performance.
- Improve PDF preview performance for larger files.

### Fixed

- Improve Reviewer session restoration reliability.



### Fixed

- Improve Reviewer table visibility during session revalidation.
- Add View Profile shortcut and Verify account action.
- Improve profile submission validation.
- Improve settings layout on small screens.
- Improve Google sign-in layout and reliability.

## 26.10.17-6 - 2026-10-17

### Fixed

- Improve profile setup without overwriting existing data.
- Improve account status refresh and badge display.
- Keep account status current and protected materials properly gated.
- Improve resource-change indicator behavior.
- Improve unverified user display in welcome banner.
- Improve small-screen banner spacing.

## 26.10.17-5 - 2026-10-17

### Fixed

- Improve account status update reliability.
- Improve Reviewer table visibility during session restoration.
- Improve resource-change badge styling.

## 26.10.17-1 - 2026-10-17

### Fixed

- Keep Reviewer resource data current when changes are made.
- Improve request error handling and resource loading diagnostics.
- Improve temporary file handling reliability.
- Apply account-status changes promptly.
- Improve profile validation warnings.
- Improve pagination styling.
- Improve PDF preview text selection behavior.

### Improved

- Keep account status updates responsive while reducing unnecessary background
  requests.

## 26.10.25 - 2026-10-17

### Fixed

- Improve Review Materials table caching and loading.
- Improve PDF preview and download formatting.
- Improve dashboard recovery and request reliability.

## 26.10.24 - 2026-10-17

### Fixed

- Apply account access updates promptly while the site is open.

## 26.10.23 - 2026-10-17

### Fixed

- Highlight individual resource cells that changed.
- Improve account access update efficiency.
- Match file-update notice timing.

### Improved

- Use Review Materials in visible labels.
- Improve account-status polling efficiency.

## 26.10.22 - 2026-10-17

### Fixed

- Improve PDF download timeout handling.

## 26.10.21 - 2026-10-17

### Fixed

- Improve reliability when PDF preparation takes longer than expected.

## 26.10.20 - 2026-10-17

### Fixed

- Keep reviewer resource table visible during refresh.
- Improve PDF viewer layout.

### Improved

- Improve protected PDF preview performance.
- Improve PDF preview and download layout.

## 26.10.19 - 2026-10-17

### Fixed

- Improve deck sync snapshot consistency.
- Improve account approval refresh rate.

### Improved

- Improve reviewer resource caching and refresh.
- Improve PDF preview and download handling.
- Reduce PDF file sizes.

## 26.10.17 - 2026-10-17

### Improved

- Add secure in-site Reviewer PDF previews and improve document validation.

- Deploy the Reviewer PDF backend and update all website version markers.

## 26.10.16-51 - 2026-10-16

### Improved

- Add a responsive Student Portal welcome banner with profile details, adjustable
  visibility, and a saved show/hide preference.
- Center the banner when it stacks above the portal card, shorten long names
  when stacked, enlarge its side-by-side profile picture, tighten the greeting
  and email spacing, show the visibility toggle only when stacked, and refine
  dashboard spacing. Restore the cached profile immediately on page refresh.

## 26.10.16-50 - 2026-10-16

### Improved

- Add an account-aware welcome panel beside the Student Portal entry on the
  dashboard, center it whenever it stacks above the portal entry, allow its
  visibility choice to persist, show full names when they fit and last names
  when space is short, and clarify its Syllabus, Modules, and Reviewers subtitle.
- Shorten the reviewer enrollment action to `Submit`.
- Add Date and Time account-creation columns to `ACCOUNTS`, populate the first
  available blank account row, and preserve creation times when profiles change.

## 26.10.16-49 - 2026-10-16

### Fixed

- Keep the Syllabus and Modules row summary visible when switching away from
  a loading Reviewer table.
- Store combined year/semester resource context in the matching Year and
  Semester log columns, including when migrating existing log rows.

## 26.10.16-48 - 2026-10-16

### Fixed

- Keep the Student Portal title visible on small screens instead of replacing
  it with a home icon.
- Automatically request the current website release when the backend rejects
  an outdated client, while preserving local study data.
- Keep the Google sign-in button manual by disabling the automatic account
  prompt and account selection.

### Improved

- Default Modules and Reviewers to Finals, then Midterms and Prelims when a
  preferred category is unavailable.
- Improve account activity reporting and resource interaction tracking.
- Reduce casual copying of resource links and show `Submit` for denied-profile
  corrections.
- Synchronize the About MRH release history from this changelog and update
  Reviewer table content incrementally.

## 26.10.16-47 - 2026-10-16

### Improved

- Show a consistent Google sign-in prompt when signed out and a visible
  "Signing in..." state while verifying a sign-in.
- Simplify reviewer profile enrollment by removing the redundant Edit button,
  uppercasing names as they are typed, and confirming name accuracy before
  submission.
- Remove the redundant Year column from Syllabus, Modules, and Reviewer tables
  while retaining year and semester filtering.

## 26.10.16-46 - 2026-10-16

### Improved

- Send formal reviewer status emails with Maritime Review Hub as the displayed
  sender name.
- Keep the Reviewer dashboard on Loading until its authorized table response
  arrives, and show a clear empty state when the loaded data has no resources.
- Place profile enrollment and correction forms below the profile details.

## 26.10.16-45 - 2026-10-16

### Maintenance

- Synchronize deck-navigation formatting and update its multiline regression
  check to match the current helper signature.
- Redeploy the validated Reviewer backend with the current website release.

## 26.10.16-44 - 2026-10-16

### Improved

- Clarify that a middle initial may be any single letter followed by a period,
  not one specific initial.

## 26.10.16-43 - 2026-10-16

### Fixed

- Validate reviewer names and the one-letter-plus-period middle initial in the
  browser before sending an enrollment request, and keep profile drafts intact
  during status refreshes.
- Show only the Reviewer loading state while a saved session is being restored.

### Improved

- Clarify reviewer profile warnings and email/name matching, and send pending,
  access-granted, and access-denied status emails.
- Refine profile status and sign-out presentation, and disable Reviewer filters
  while dashboard data is loading.

## 26.10.16-41 - 2026-10-16

### Improved

- Simplify the locked Reviewer prompt with a red lock icon and concise sign-in
  action.
- Cache reviewer display details for instant Profile and header rendering
  while validating sessions and refreshing resources silently in the
  background.
- Open Reviewer resources by default for signed-in users and refine Profile actions.

## 26.10.16-40 - 2026-10-16

### Improved

- Show Popular badges on General Knowledge, BSMT Competencies, and Review
  Notes for Deck Officers decks.
- Keep unavailable Student Portal filter choices visible but disabled, and omit empty table columns.
- Show horizontal table scrolling only when populated columns exceed the
  dashboard width while preserving full-width row and header decorations.
- Enlarge the Profile avatar and remove redundant approval and sign-in loading status indicators.

## 26.10.16-39 - 2026-10-16

### Fixed

- Keep authorized Reviewer resources visible when public dashboard refreshes
  return the intentionally empty protected-tab placeholder.
- Preserve the last loaded Reviewer rows during temporary refresh failures
  and refresh them when returning to the Reviewer tab.
- Match reviewer account email addresses without case sensitivity when
  retaining loaded Reviewer data.

## 26.10.16-38 - 2026-10-16

- Persist reviewer sign-in across browser restarts with server-validated
  application sessions and cross-tab sign-out synchronization.
- Move Student Portal to the top of Home and refine dashboard and breadcrumb spacing.
- Auto-size the Resource Dashboard box around its content and wrap dashboard
  navigation instead of clipping it.
- Centralize the semantic release baseline in `version.json` and regenerate
  app, worker, manifest, and runtime release metadata during deployment.
- Preserve reviewer authentication state after temporary verification failures and offer a retry.

## 26.10.16-37 - 2026-10-16

### Improved

- Center resource tables and show the syllabus link column as SYLLABUS.
- Keep reviewer navigation in place while sign-in is being verified and reuse
  authorized reviewer data during the session.
- Show progress indicators during dashboard data loads and reviewer sign-in checks.

## 26.10.16-36 - 2026-10-16

### Improved

- Center dashboard navigation links when they fit and keep them scrollable on narrow screens.
- Tighten the Category dropdown and retain versioned dashboard payloads
  longer to avoid repeated index rebuilds.

## 26.10.16-35 - 2026-10-16

### Changed

- Place the Profile settings button at the right side of the Resource Dashboard title bar.

## 26.10.16-34 - 2026-10-16

### Changed

- Add contextual usage notes and filter explanations throughout the Resource Dashboard.
- Make the Category filter more compact and hide phase columns that are not selected.
- Reduce horizontal spacing between resource table columns.
- Keep Resource Dashboard tabs on one row on small screens, with horizontal scrolling when needed.
- Use a clipboard-check icon for the Reviewers tab.
- Ignore stale Google sign-in, approval-poll, and profile-submission
  responses after account state changes.
- Improve sign-in error feedback.

## 26.10.16-33 - 2026-10-16

### Fixed

- Keep the profile name editor open and preserve unsaved changes while
  reviewer approval status refreshes.

## 26.10.16-32 - 2026-10-16

### Changed

- Improve account restoration after refresh.

## 26.10.16-31 - 2026-10-16

### Fixed

- Improve profile submission reliability.
- Improve tracking of resource interactions.

## 26.10.16-30 - 2026-10-16

### Added

- Add a PRELIMS, MIDTERMS, FINALS, or All category filter to the Modules and
  Reviewers dashboards, defaulting to All.

## 26.10.16-29 - 2026-10-16

### Added

- Let signed-in users edit profile details and improve account status updates.

### Fixed

- Hide the Google sign-in control after authentication and keep approval
  status visible without duplicate Profile copy.

### Changed

- Simplify Profile guidance and improve account restoration after refresh.
- Improve resource loading and reduce unnecessary repeat requests.
- Improve resource interaction reliability.

## 26.10.16-28 - 2026-10-16

### Fixed

- Keep the Reviewer name-entry form and its First Name field within the
  Profile dialog on narrow screens.

## 26.10.16-27 - 2026-10-16

### Fixed

- Keep the Modules and Syllabus table frame sized to its content while
  aligning it with the dashboard filters.

## 26.10.16-26 - 2026-10-16

### Fixed

- Expand the Resource Dashboard to the available page width and add
  consistent spacing across profile, navigation, filters, and resource
  tables.

## 26.10.16-25 - 2026-10-16

### Fixed

- Keep cached deck access enabled when the backend confirms the cached summary is already current.

## 26.10.16-24 - 2026-10-16

### Added

- Clarify account access and profile correction steps.
- Refresh account access while users are signed in so status changes take
  effect without a page reload.

### Changed

- Simplify account matching and improve account data consistency.
- Improve the display of access dates and account status.
- Open the Resource Dashboard on Profile and confirm before exiting it.

## 26.10.16-23 - 2026-10-16

### Fixed

- Improve sign-out behavior and account restoration after refresh.

### Changed

- Improve account recovery when signing in from a new browser or after browser
  data is cleared.

## 26.10.16-22 - 2026-10-16

### Changed

- Improve tracking of resource interactions.

## 26.10.16-21 - 2026-10-16

### Fixed

- Clear the previous resource tab's table and filters while Reviewer resources are loading.

## 26.10.16-20 - 2026-10-16

### Fixed

- Keep the signed-out Reviewers tab accessible and clickable by removing disabled ARIA semantics.

## 26.10.16-19 - 2026-10-16

### Fixed

- Apply safe frontend updates while the Resource Dashboard is open, while
  preserving unfinished Profile enrollment details.

## 26.10.16-18 - 2026-10-16

### Fixed

- Keep the Reviewers tab clickable while signed out and route users to Profile for Google sign-in.
- Make the Reviewers tab clickable after sign-in and show the signed-in
  profile picture in the header Profile button.

### Changed

- Improve account restoration when the dashboard loads.
- Improve Profile form spacing, mark Middle Initial optional, and show a
  name-capitalization example.

## 26.10.16-16 - 2026-10-16

### Changed

- Center Google sign-in and show the signed-in profile picture above the account name and email.

## 26.10.16-15 - 2026-10-16

### Changed

- Improve the sign-in and account access experience.
- Update sign-in configuration and styling.

## 26.10.16-12 - 2026-10-16

### Changed

- Add a dedicated Profile section for Google sign-in, new-account enrollment,
  and signed-in account details/sign-out.

## 26.10.16-11 - 2026-10-16

### Changed

- Place sign-in and profile controls at the right side of the dashboard tab
  header and default Google sign-in UI to English.
- Improve Google sign-in styling.

## 26.10.16-10 - 2026-10-16

### Changed

- Move Google sign-in and the signed-in profile control to the right side of
  the Syllabus/Modules/Reviewers header, and request English for Google
  sign-in.

## 26.10.16-9 - 2026-10-16

### Fixed

- Treat empty Module title parentheses as a missing title and preserve safe
  dashboard cache data when sanitizing legacy reviewer rows.

## 26.10.16-8 - 2026-10-16

### Changed

- Show a folder icon and “Folder” for Module resources without a parenthesized title.

## 26.10.16-7 - 2026-10-16

### Changed

- Label dashboard row counts with the selected “Year Level X.Y” term.

## 26.10.16-6 - 2026-10-16

### Changed

- Label the all-years dropdown option “All” and align reviewer sign-in/profile
  controls to the far right of the dashboard toolbar.

## 26.10.16-5 - 2026-10-16

### Changed

- Label the year-wide dashboard filter “All Year Levels”, include every
  semester, and disable the semester selector while it is active.

## 26.10.16-4 - 2026-10-16

### Fixed

- Improve account recovery and sign-in reliability.

## 26.10.16-3 - 2026-10-16

### Changed

- Improve account recovery after browser data is cleared.

## 26.10.16-2 - 2026-10-16

### Added

- Let users submit profile details for review.

### Security

- Improve the reliability of account restoration.

## 26.10.16-1 - 2026-10-16

### Added

- Improve access controls for learning materials.

### Changed

- Match review question-range typography to the page indicator and prompt
  before exiting Review Mode from the last page.
- Improve dashboard performance and account verification reliability.

## 26.10.15-29 - 2026-10-15

### Changed

- Use `/dashboard` as the Resource Dashboard route while preserving
  `/resources` links, add an All-years filter, improve loading visibility, and
  standardize dashboard typography and spacing.
- Refresh dashboard navigation labels and icons, and hide empty rows and columns.

### Security

- Keep review materials available only to users with approved access.

## 26.10.15-28 - 2026-10-15

### Fixed

- Keep the legacy sync fallback cache-version-aware, avoid nested
  connection-pool waits, and preserve cold-start handling.
- Restore the dashboard row count after an unchanged cached-dashboard check.

## 26.10.15-27 - 2026-10-15

### Changed

- Reduce the Resource Dashboard tab bar height and standardize dashboard typography.

## 26.10.15-26 - 2026-10-15

### Performance

- Fetch changed sync metadata and the deck summary in one backend request,
  with a single-request unchanged check.

## 26.10.15-25 - 2026-10-15

### Changed

- Hide empty Resource Dashboard rows and align the Return control and Dashboard title to the left.

## 26.10.15-24 - 2026-10-15

### Changed

- Place the centered file-update delay note at the bottom inside the dashboard card.

## 26.10.15-23 - 2026-10-15

### Changed

- Move the Return control outside the dashboard card, place the Dashboard
  label beside it, and use an icon-only Return control on small screens.

## 26.10.15-22 - 2026-10-15

### Changed

- Note that Resource Dashboard updates may take up to three minutes to appear.

## 26.10.15-21 - 2026-10-15

### Changed

- Rename the dashboard tab to Syllabus, move it before Modules, normalize
  dashboard spacing, and add a return-to-menu button.

### Fixed

- Keep dashboard data loading from blocking navigation back to the main menu.

## 26.10.15-20 - 2026-10-15

### Fixed

- Keep the Resource Dashboard compatible with older backend responses that
  include syllabus data in the Reviewers tab.

## 26.10.15-19 - 2026-10-15

### Changed

- Separate Course Syllabus resources into their own Resource Dashboard tab.
- Support compact Drive-ID and legacy tuple index exports.

## 26.10.15-18 - 2026-10-15

### Changed

- Show syllabus resources as PDF buttons with PDF icons in the Resource Dashboard.

## 26.10.15-17 - 2026-10-15

### Changed

- Improve resource data caching and refresh behavior.

## 26.10.15-16 - 2026-10-15

### Changed

- Refresh the Resource Dashboard layout, remove filled active-tab
  backgrounds, and compact the term filters.

## 26.10.15-15 - 2026-10-15

### Changed

- Limit Resource Dashboard filtering to Year and Semester, defaulting to 3.1.

## 26.10.15-14 - 2026-10-15

### Changed

- Show parenthesized resource filenames in dashboard buttons, with PDF icons
  for Reviewers and folder icons for Modules.

## 26.10.15-13 - 2026-10-15

### Fixed

- Resolve Drive file titles for dashboard resource links with a DriveApp
  fallback and avoid exposing unresolved raw URLs.

## 26.10.15-12 - 2026-10-15

### Changed

- Label dashboard resource buttons with the linked Drive file title instead of the raw URL.

## 26.10.15-11 - 2026-10-15

### Changed

- Size dashboard columns to their content and display spreadsheet resource links as labeled buttons.

## 26.10.15-10 - 2026-10-15

### Changed

- Add column-based filtering and sortable headers to the resource dashboard.
- Preserve spreadsheet links and render Google Drive and Docs resources as same-tab links.

## 26.10.15-9 - 2026-10-15

### Fixed

- Allow the Resource Dashboard request through frontend backend-payload validation.

## 26.10.15-8 - 2026-10-15

### Changed

- Increase the website header height and simplify the resource dashboard title.
- Remove dashboard search and external spreadsheet/document links so
  dashboard data stays in the website.

## 26.10.15-7 - 2026-10-15

### Changed

- Replace the Resources Drive browser with Modules and Reviewers dashboards
  backed by the shared spreadsheet.
- Disable the Resource Portal Drive listing and preview endpoints.

## 26.10.15-6 - 2026-10-15

### Changed

- Remove explanatory and access-disclosure copy from the Resources portal
  while retaining functional status messages.
- Adopt `YY.MM.DD-sequence` release numbering and advance the sequence for
  subsequent code releases on the same date.

## 10.16.5 - 2026-10-15

### Fixed

- Improve resource browsing performance and reliability.

## 10.16.4 - 2026-10-15

### Changed

- Add a dedicated access screen for reviewer materials.
- Allow supported resource previews to expand into a focused online viewer.

## 10.16.3 - 2026-10-15

### Changed

- Keep protected reviewer materials restricted to authorized users and improve
  in-site document previews.
- Clarify the limitations of browser-based content protection.

## 10.16.2 - 2026-10-15

### Fixed

- Improve document preview loading and reliability.

## 10.16.1 - 2026-10-15

### Changed

- Restyle Resources as a responsive Drive file browser with current-folder
  search, file types, and modified dates.
- Improve resource browsing.
- Cache recent folder listings so previously visited resources appear immediately while refreshing.

## 10.15.26-10 - 2026-10-15

### Fixed

- Improve resource browsing and in-page file previews.

## 10.15.26-9 - 2026-10-15

### Added

- Add resource browsing to the Resources view.

## 10.15.26-8 - 2026-10-15

### Added

- Browse shared learning resources in the Resources portal.
- Open shared files from the Resources page.
- Use `/resources` and the shorter “Resources” page title.

## 10.15.26-7 - 2026-10-15

### Added

- Add a Resource Portal frontend view with a dedicated navigation route and setup empty state.

## 10.15.26-6 - 2026-10-15

### Changed

- Notify users when an outdated website version needs to be refreshed.

## 10.15.26-5 - 2026-10-15

### Changed

- Require a supported website version to connect to app services.

## 10.15.26-4 - 2026-10-15

### Added

- Restore quiz-only progress bars and question/card counts, showing deck
  progress bars only on decks with saved quiz progress.
- Add a per-deck Show Answers setting to Review mode.
- Remove Reset buttons from Review-mode deck cards.

### Fixed

- Fix a deck-card rendering error that could prevent users from opening decks.
- Improve routing for links to older website pages.

## 10.15.26-3 - 2026-10-15

### Added

- Keep Quiz and Study preferences, including navigation position, scoped to the active deck.

### Changed

- Remove progress bars and completed/total counters from deck cards and
  sessions while retaining the Study question range below pagination.
- Scramble protected deck and folder names before blurring them, and remove
  redundant lock icons beside those names.
- Keep sort and filter menus within small viewports.
- Restore the previous question type when its confirmation is canceled.

## 10.15.26-2 - 2026-10-15

### Changed

- Increase spacing above the dashboard navigation bar and below the session progress area.
- Adjust review title and action spacing for small and large screens.
- Shorten the deck source filter to “All” and capitalize the dashboard heading as “SUBJECTS”.

## 10.16.0 - 2026-10-15

### Added

- Keep study and quiz sessions addressable in the URL and offer to restore
  saved progress after a page refresh.
- Add navigation and practice/review regression coverage for session routing and dashboard updates.

### Fixed

- Correct JavaScript syntax in dashboard navigation so the root-level syntax check passes.
- Keep session navigation URLs and dashboard progress displays consistent when moving between views.
