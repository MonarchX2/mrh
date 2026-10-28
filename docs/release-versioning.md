# Release versioning

## Checked-in website version

`version.json` is the website's checked-in release source. Its current value is
`26.10.27-2`, using the project format `YY.MM.DD-Patch`. `app-entry.js` fetches
the release metadata and uses it in the update flow; the service worker is
registered by the browser entry point. The version in `docs/CHANGELOG.md`
currently has a matching `26.10.27-2` heading.

The backend compatibility floor is a separate value:
`MINIMUM_SUPPORTED_CLIENT_VERSION` in `BACKEND/backend.js` is `26.10.20`.
Changing the website version does not automatically change this floor.
Raise the backend floor only when intentionally requiring older clients to be
blocked.

## Automation status

`.github/workflows/deploy.yml` is configured for pushes to `main` and manual
dispatch. Its active job references `scripts/resolve-semver-version.js`,
`scripts/stamp-release-version.js`, `scripts/prepare-pages-assets.js`, and
`scripts/public-pages-deployment.js`. Those files are not present in the
tracked `scripts/` directory, which currently contains only
`dev-server.js`. The workflow also comments out its earlier source-check
steps. Therefore the checked-in workflow is not a functioning release or
publishing pipeline in the current checkout.

The workflow's intended behavior in its YAML includes selecting/stamping a
release, creating a production site artifact, publishing it to a separate
public repository, verifying the Pages build, and optionally tagging the
source release. These are configuration intentions only; missing helper
scripts prevent the active job from reaching those steps. Do not infer a
successful build, publication, tag, or deployed version from the workflow
definition alone.

## Updating release information

When preparing a release, update `version.json` and the matching release notes
in `docs/CHANGELOG.md` together, then verify the website's version/update
behavior and the backend compatibility policy. The automated version
selection and stamping helpers are currently absent, so a release must not
rely on the broken workflow to make or validate these edits.

The GitHub Pages site and the Apps Script backend are independent deployments.
The root `.clasp.json` points to `BACKEND/`, but local source does not prove
which script project or deployment is live. Check the target project and
revision before any authorized backend deployment. The version numbers and
workflow configuration in this repository do not establish production parity.
