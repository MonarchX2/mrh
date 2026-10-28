# Product overview

## Verified purpose

The repository identifies the application as **Maritime Review Hub** and
provides a maritime study and review experience. That purpose is supported by
the page title and description in `index.html` and `manifest.json`, as well as
the question, deck, and study flows in the frontend. Specific business
requirements, intended audience beyond the app's own labels, and product
success criteria are not established by the repository and remain unknown.

## User-facing capabilities present in the code

- Browse a dashboard of maritime subject/deck hierarchies and their progress.
- Start question practice, navigate questions, record answers, and review a
  deck in study mode.
- Save user preferences, statistics, study progress, and navigation state
  locally.
- Browse Student Portal resource sections for Modules and Reviewers, and use
  the BSMT Library for its course catalogue and Documents. The Resource
  Dashboard also provides Subjects, Syllabus, Modules, Reviewers, and Profile
  sections. Folder/file listing and in-app/native preview behavior is
  described in [resources-security.md](./resources-security.md).
- Sign in to reviewer features using Google identity, submit a profile for
  approval, and access authorized reviewer dashboard and PDF functions. The
  backend is the authorization authority; client-side screen state is not an
  authorization control.
- Continue portions of study/review offline using saved state and the service
  worker's app-shell caches. The backend and external Google services still
  require connectivity for their respective operations.
- Receive release updates through app-entry and service-worker version checks.

These capabilities are identified from `index.html`, `frontend/js/app-core.js`,
`frontend/js/session-core.js`, `frontend/js/deck-nav-core.js`,
`frontend/js/deck-review-core.js`, `app-entry.js`, and `sw.js`; they do not
imply that a specific production release has been tested.

The checked-in website release is `26.10.27-2` in `version.json`. The backend
compatibility floor is `26.10.20` in `BACKEND/backend.js`; it is a separate
value. The release workflow and most root check/build scripts currently
reference helper files that are absent from `scripts/`, so the checked-in
release number does not demonstrate a successful recent deployment.

## Product constraints visible in source and documentation

- The frontend requires a supported release version before backend requests
  proceed; Apps Script has an independent minimum supported client version.
- User progress/preferences are browser-local; the code does not establish
  automatic account-wide synchronization of all personal study progress.
- Some protected Reviewer functions require current backend authorization and
  approval. Client-side UI or watermarking cannot replace those checks.
- The public resource portal uses public-tree membership and protected-path
  exclusion, rather than per-visitor Drive permission evaluation, as its
  documented authorization boundary.
- Reviewer PDF source bytes are delivered to an authorized browser for
  processing. An authorized recipient can inspect or save source bytes from
  browser memory/network traffic; watermarking cannot prevent that. See
  [reviewer-pdf-service/README.md](../reviewer-pdf-service/README.md).
- Public site and backend deployment are separate operations.

## Unknowns

The repository does not establish product ownership, a complete target-user
definition, supported service-level commitments, roadmap, usage analytics
policy beyond implemented logging, or compatibility guarantees for browsers
and devices. These should not be inferred from application labels or test
coverage.
