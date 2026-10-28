# Maritime Review Hub documentation

This folder documents the checked-in source tree. It does not confirm that a
production website or Apps Script deployment matches this checkout.

## What is in this repository

- `index.html`, `app-entry.js`, `sw.js`, `404.html`, and the root static assets
  form the browser application shell.
- `frontend/js/` contains browser application modules; `frontend/css/` contains
  the application styles and Tailwind source/generated styles.
- `BACKEND/` contains the Apps Script project: `backend.js`, `helpers.js`,
  `jsrsasign.js`, and `appsscript.json`. The root `.clasp.json` uses
  `rootDir: "BACKEND"`.
- `reviewer-pdf-service/` contains the protected-PDF browser worker, its
  vendored runtime assets, and its Node test suite.
- `vendor/pdfjs/` contains the vendored PDF.js runtime.
- `docs/` contains this documentation.

## Product and design

Maritime Review Hub is a browser-based maritime study and review application.
The interface supports subject/deck browsing, question practice and study,
local progress/preferences, a Student Portal, a BSMT Library, and approved
Reviewer features. Personal study progress is stored in the browser; it is not
automatically synchronized to a user account. See [PRODUCT.md](./PRODUCT.md)
and [ARCHITECTURE.md](./ARCHITECTURE.md).

## Current release identifiers

The checked-in website release in `version.json` is `26.10.27-2`. The Apps
Script minimum supported client version in `BACKEND/backend.js` is separately
set to `26.10.20`; it is a compatibility floor, not the current website
release. See [release-versioning.md](./release-versioning.md).

## Local commands and current limitations

The root `package.json` declares many `check:*`, build, and vendor commands,
but their referenced scripts are not present in the checked-in `scripts/`
folder. At present, `scripts/dev-server.js` is the only tracked root script.
Consequently, do not treat those declared checks or build commands as
available or passing in this checkout. See [TESTING.md](./TESTING.md) for
commands that can be run and the exact gaps.

The PDF worker's test command is:

```sh
npm test --prefix reviewer-pdf-service
```

The local application-shell server is:

```sh
npm run start:dev
```

It listens at `http://127.0.0.1:5500`.

## Deployment boundaries

The GitHub Actions workflow at `.github/workflows/deploy.yml` is configured to
run on pushes to `main` and on manual dispatch. The active job calls release
and production-build scripts that are not present in this checkout, so the
workflow cannot currently complete as written. Its earlier source-check
steps are commented out. The static website and Apps Script backend are
separate deployables; a website workflow run would not deploy or verify
`BACKEND/`.

The Apps Script manifest configures execution as the deploying user and
anonymous web-app access. Before any authorized Apps Script operation, verify
the intended Google project, deployment, permissions, and source revision.
Do not put credentials or production data in this repository. A successful
local command does not establish production deployment state.

## Document index

- [Product overview](./PRODUCT.md)
- [Architecture](./ARCHITECTURE.md)
- [Data flows](./DATA_FLOW.md)
- [Apps Script API contract](./API_CONTRACT.md)
- [Testing and validation](./TESTING.md)
- [Security overview](./SECURITY.md)
- [Resource access and viewing](./resources-security.md)
- [Supabase storage and legacy import](./SUPABASE_MIGRATION.md)
- [Performance validation](./performance-validation.md)
- [Release versioning](./release-versioning.md)
- [Changelog](./CHANGELOG.md)
