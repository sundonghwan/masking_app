# Task: session-project-restore-batch

## Goal
- Finish the last two planned features: hard session storage and server project selection/restore.

## Scope
- Server-backed login/logout/me session endpoints with bearer tokens.
- API client bearer token support.
- Project list row selection that loads a server manifest into the workbench.

## Non-goals
- Password hashing or OAuth.
- Multi-device persisted account database.
- Downloading server image/mask binaries back into IndexedDB.

## Touched areas
- `src/server/api.js`
- `src/api/client.js`
- `src/app.js`
- `index.html`
- `src/styles.css`
- `tests/apiClient.test.js`
- `tests/serverApi.test.js`
- `docs/FEATURE_STATUS.md`

## Risks
- Existing local MVP requests can break if session bootstrapping is too strict.
- Project restore can imply images are editable even when local blobs are missing.
- Bearer token and role headers can drift if both are accepted without a clear priority.

## Impact Chains
### suspected
- loginSession (src/app.js) -> apiClient.login (src/api/client.js) -> routeSession.login (src/server/api.js)
- apiClient.requestJson (src/api/client.js) -> readSession (src/server/api.js) -> requireRole (src/server/api.js)
- loadServerProject (src/app.js) -> apiClient.getProject (src/api/client.js) -> restoreServerManifest (src/app.js)

### validated
- loginSession (src/app.js) -> apiClient.login (src/api/client.js) -> routeSession.login (src/server/api.js)
- apiClient.requestJson (src/api/client.js) -> readSession (src/server/api.js) -> requireRole (src/server/api.js)
- loadServerProject (src/app.js) -> apiClient.getProject (src/api/client.js) -> restoreServerManifest (src/app.js)

### discarded
- server image/mask blob re-download into IndexedDB
  - reason: this needs a separate file restore contract; this batch restores manifest-level project state and selection first.

## Validation Plan
- `npm run lint`
- `npm test`
- harness verification bundle
- server HTML/JS smoke for session and project selection controls.

## Implementation Review
- Initial review found two blocking auth issues: logout still allowed role-header access, and server ZIP export did not send bearer headers.
- Fixed by making browser client sessions token-first, disabling local role-header fallback by default, clearing tokens on identity/role edits, and adding bearer headers to server export fetches.
- Server project selection intentionally restores manifest metadata first and does not pretend missing image blobs are editable.
- Server role headers remain as an explicit compatibility fallback for harness tests and dependency-free MVP integration.

## Completed Features
- Server-backed login/logout/me session endpoints.
- Bearer token API authentication for protected client calls.
- Project selection/manifest restore from the server project list.

## Remaining Work
- None for the planned two-feature closeout.
- Future hardening: persisted account/session storage and server file/blob restore for full cross-device editing.

## Closeout
- `npm run lint` passed.
- `npm test` passed with 95 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 95 tests.
- `scripts/harness/smoke-web.sh` passed.
- Server HTML/JS/API smoke passed on `http://localhost:4173`.
