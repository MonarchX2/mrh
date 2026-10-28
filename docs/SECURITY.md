# Security overview

This document summarizes trust boundaries visible in the source and
configuration. It is not a penetration test, production configuration
verification, or claim that a specific vulnerability exists.

## Browser and backend trust boundary

The website is static and publicly served. The frontend calls the Apps Script
web app configured in `frontend/js/app-config.js`.
`BACKEND/appsscript.json` configures the checked-in web app as
`USER_DEPLOYING` with `ANYONE_ANONYMOUS` access. Backend code therefore
executes with the deploying account's granted Google permissions while
accepting anonymous requests. This manifest does not prove that the live
deployment has the same settings.

The browser's request schemas, hidden UI, local session state, client-side
watermarks, and service-worker behavior are not security authorization.
`doPostInternal_`, GET handlers, and route-specific authorization functions
must validate all incoming data and perform protected access checks on the
server. The backend validates request type, allowed fields, required values,
version, identifiers, and payload size. Reviewer operations additionally
validate identity/session and account approval. Public resource operations
apply the public-root ancestry policy. See [API_CONTRACT.md](./API_CONTRACT.md)
and [resources-security.md](./resources-security.md) for details.

## Reviewer identity, sessions, and protected Drive files

Google Identity Services supplies identity tokens. Apps Script verifies
tokens through Google token-info endpoints and checks claims including the
configured audience, expiry, issuer, and verified email. The backend issues
opaque sessions only after recording the sign-in audit in the same
`verify_reviewer_access` request, and stores session records in Script
Properties under keys derived from a hash of the session identifier. If audit
recording fails, verification fails before a session is issued. Sessions
expire; reviewer operations revalidate the session and current account
approval. Session restoration, approval, dashboard access, sign-out, and PDF
retrieval have separate server handlers.

The browser persists the issued reviewer session identifier in `localStorage`
under `mrh_reviewer_session_v1`. A non-extractable RSA private `CryptoKey` is
stored in IndexedDB, and the backend binds each new session to its public key.
Protected requests carry an RSA-SHA-256 signature over the UTF-8 JSON
serialization of the complete request body with only `sessionProof` omitted.
The Apps Script backend verifies the proof with the bundled jsrsasign
RSA-SHA-256 verifier before accepting the session identifier; it does not rely
on an RSA verification method in the Apps Script `Utilities` API.
Copying only the `localStorage` token is therefore insufficient to replay a
new protected request from another client. Existing unbound sessions are
rejected and require Google reauthentication after this protocol is deployed.
The key is not a defense against active same-origin script injection, a
compromised browser extension, or malware that can ask the page to sign
requests. Such code can use the browser as a signing oracle even though it
cannot export the private key. The signature protocol does not maintain a
server-side single-use nonce, so possession of a captured complete signed
request could permit replay of that exact request. This binding is defense in
depth, not a replacement for XSS prevention or backend authorization. The
sign-out endpoint accepts the token without proof only to revoke that same
session; it returns no protected account or resource data. Do not copy session
identifiers or proofs into logs, issue reports, external services, or source
files.

The browser separates identity-provider and auth-route coordination into
`reviewer-auth-core.js`, cross-tab coordination into
`reviewer-session-coordinator-core.js`, and profile display/input behavior into
`reviewer-profile-ui-core.js`. These modules do not grant access: the backend
must continue to verify each protected request and current account approval.
Cross-tab messages are only same-session UI coordination, never an
authorization credential.

The backend bundles jsrsasign 11.1.4 locally with its license notices; the
verifier does not load third-party code at runtime. Review the bundled source
and license notices before updating this security-sensitive dependency.
Upstream marks jsrsasign as no longer maintained, so reevaluate the verifier
library before future updates.

Protected PDF retrieval requires backend checks of reviewer authorization,
current account approval, current Reviewer index membership, and direct PDF
metadata/type before returning source bytes. The request does not validate
folder ancestry or Drive permissions. Because the app runs as the deployer,
an approved Reviewer can receive any indexed PDF that the deployment identity
can read, even if the Reviewer has no direct Drive access. Keep the index
limited to intended content and manage the deployer's Drive access accordingly.
The browser's dedicated worker then watermarks and prepares PDF content. An
authorized browser necessarily receives clean source bytes, so browser-side
processing cannot stop an authorized recipient from extracting the original.
The worker README documents this limitation and specific tests; see
[reviewer-pdf-service/README.md](../reviewer-pdf-service/README.md).

The manifest grants Apps Script Drive, Sheets, script storage, trigger,
mail-sending, external-request, and user-email scopes and enables Drive and
Sheets advanced services. Reviewer access notification emails are sent only
to the Google account that runs `setupReviewerAccessRequestNotifications`;
they contain the applicant's name and email and are generated from new
application events in the Supabase `mrh_activity_logs` table. The notification
recipient and processing cursor remain in Apps Script Script Properties. This
requires authorizing the mail scope.
Deployment-owner permissions and Script Properties are operational security
dependencies. Their live values and actual effective grants have not been
inspected here.

## Public resource boundary

Resource APIs run with the Apps Script deployment identity. The resource
portal allows resources under the configured public root and excludes
protected Reviewer paths; it does not decide access using each visitor's Drive
ACL. Listings are cached, but current folder ancestry is rechecked before
cached results are returned; file preview independently rechecks ancestry.
Changing Drive sharing alone is not equivalent to removing a file from this
portal. Consult [resources-security.md](./resources-security.md) before
changing resource paths, sharing, or cache policy.

## Browser policy and external dependencies

`index.html` contains a Content Security Policy meta element. It sets
`default-src 'self'`, blocks objects, restricts frames/connects to enumerated
origins, and allows `'unsafe-inline'` for scripts and styles along with
specified Google/CDN origins. Because this is a meta policy rather than a
verified HTTP response-header policy, it does not establish header-level
protection; inline allowances also limit its defense-in-depth strength. This
is a policy limitation to consider, not evidence of an exploitable issue by
itself. Application controls use `data-action` attributes and a document-level
dispatcher with a fixed action allowlist instead of inline event-handler
attributes. This removes the inline-handler execution surface, including in
generated deck, review, dashboard-filter, and cloze markup; it does not remove
the document's inline bootstrap/helper scripts or inline styles, so the current
policy still permits `'unsafe-inline'`. SRI is present for selected CDN assets
but not all external resources.

External integrations include Google Identity Services, token-info endpoints,
Google Drive/Sheets APIs, Apps Script services, and CDN-hosted frontend
libraries. Root and PDF-service manifests pin dependencies and provide
lockfiles. The root workflow contains an audit step only as commented-out YAML;
the checked-in workflow does not currently run that audit. Third-party
availability, integrity, API policy, and dependency vulnerabilities remain
supply-chain and availability considerations.

## Sensitive data and secret boundaries

Do not commit OAuth credentials, tokens, private keys, production account
records, approval information, private resource identifiers/URLs, or user
data. If a credential or private value is encountered during review, do not
repeat or transmit it; report only its location and follow an authorized
rotation/remediation process. The frontend configuration and static bundle
are public; no secret should be placed there. Backend Script Properties are
used for sessions and configuration, but their actual access controls and
contents are unknown.

Logs and audit flows exist for backend requests and reviewer/resource actions.
The resource-specific documentation describes redaction and audit controls.
Any change to logging must avoid recording bearer tokens, raw session IDs,
protected source content, or unnecessary user-identifying values.

External calls to Google identity endpoints, Apps Script, Drive, and Sheets
are visible integrations in the source/configuration. CDN-hosted libraries
are referenced by the frontend; selected resources use SRI, not all of them.
Before introducing another service or dependency, assess its necessity,
provenance, maintenance, license, permissions, and the data it receives. Do
not transmit private code, credentials, account data, protected resources, or
production data to an external service unless the user has authorized that
specific use and its data handling is appropriate.

## Operational risks and verification limits

- Anonymous access combined with deployer-level Drive/Sheets access makes
  route-level server authorization and correct deployment scopes critical.
- A stale or misconfigured Apps Script deployment may differ from local
  source; a website build does not deploy the backend.
- `.github/workflows/deploy.yml` is configured for pushes to `main` and manual
  `workflow_dispatch`, but its active job references helper scripts that are
  absent from the tracked `scripts/` directory. Its source-check steps are
  commented out. The workflow is not a currently functioning CI/publishing
  pipeline in this checkout, and its YAML does not prove a Pages publication.
  GitHub branch protection, required review, environment approvals, workflow
  secrets/variables, and who may push are not established by the repository.
- The workflow YAML contains cross-repository publication and release-tagging
  steps, but the missing build/release helpers prevent those steps from being
  reached as written. Actual destination settings and secrets are not
  verifiable from source.
- Minification, if a generated site is produced by a restored build pipeline,
  would not make browser-delivered JavaScript confidential. Source
  confidentiality depends on repository visibility and publishing policy.
- Drive ownership, permissions, protected hierarchy, Apps Script properties,
  Supabase account/activity data, OAuth client settings, and quotas are
  production data/state and must be managed deliberately.
- Changes to IndexedDB/local storage formats, Apps Script Drive/Sheets/
  Properties data, or Supabase schema/data can persist beyond a code rollback.
  Before a migration, bulk update, or deletion, identify affected data,
  concurrency/locking requirements, backup or recovery options, and a rollback
  plan. Do not run
  such an operation against live data without explicit authorization.
- Locally cached question data and user progress persist in browser storage.
  Device/browser access and storage clearing are outside backend session
  authorization.
- Offline caches can serve previously downloaded static assets; they do not
  authorize backend operations or intercept API requests.

## Guidance versus enforcement

Repository Copilot instructions and prompt files are **advisory workflow
guidance**. They do not technically prevent file deletion, Git operations,
dependency installation, external network access, data changes, or deployment.
Their presence also does not establish that a Copilot extension loaded or
followed them.

Verified checked-in technical implementation/configuration includes the Apps
Script anonymous/deployer execution setting and declared scopes in
`BACKEND/appsscript.json`, plus server-side request validation and
reviewer/resource authorization paths in `BACKEND/backend.js`. The repository
contains a synthetic Reviewer PDF test suite; the root `package.json` also
declares checks whose implementation files are absent. Tests are validation
mechanisms, not runtime access controls. The GitHub Actions workflow YAML and
permissions are configured in `.github/workflows/deploy.yml`, but missing
helpers mean the configured deployment does not currently complete as written.
These source-level facts do not prove live Apps Script settings, production
permissions, test execution results, or deployment state.

Manual or unverified controls include which Copilot instructions/prompts a
specific editor instance actually loads, user/account permissions,
operating-system file protections, GitHub branch protection and reviewer
requirements, environment approvals, workflow secrets/variables, live OAuth
configuration, Apps Script deployment identity/scopes/properties, and real
Drive ACLs. These cannot be established from the checked-in source alone.

No live deployment, credentials, tokens, production data, or Drive permissions
were inspected while preparing this overview. These are risks and validation
requirements, not findings of confirmed vulnerabilities.
