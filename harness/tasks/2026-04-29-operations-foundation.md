# Task: operations-foundation

## Goal

- Implement the next recommended operations foundation slice:
  credential login, server-owned roles, authenticated actors, and centralized
  runtime defaults.

## Scope

- MVP user credential validation.
- Login UI user ID/password flow.
- Read-only browser role display from the server session.
- Review actor derived from authenticated session.
- Assignment audit actor derived from authenticated session.
- Centralized remaining MVP runtime defaults.
- Feature status and checkpoint documentation.

## Non-goals

- Persistent account/session database.
- Project creation/opening replacement for `mask_project_001`.
- Assignment queues or per-user task inboxes.
- Submitted-data revision editor.
- Editor pan or magic-click tooling.

## Touched Areas

- `src/config/runtimeDefaults.js`
- `src/server/api.js`
- `src/api/client.js`
- `src/app.js`
- `index.html`
- `src/export/exporter.js`
- `tests/apiClient.test.js`
- `tests/appContracts.test.js`
- `tests/serverApi.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`

## Risks

- Login could still depend on browser-selected role.
- Password could be persisted in the local project snapshot.
- Existing review actions could lose reviewer audit identity.
- Assignment could accept invalid worker/reviewer targets.
- Demo assignment defaults could be mistaken for completed production user
  management.

## Impact Chains

### suspected

- `loginSession (src/app.js:374-392)` -> `createMaskingApiClient.login (src/api/client.js:14-24)` -> `validateMvpCredentials (src/server/auth.js:9-13)` -> `createSession (src/server/api.js:397-408)`
- `reviewSelectedImage (src/app.js:723-799)` -> `ensureAuthenticatedSession (src/app.js:1328-1350)` -> `getReviewActorId (src/app.js:1143-1147)` -> `createMaskingApiClient.reviewImage (src/api/client.js:88-99)` -> `applyReviewTransition (src/server/api.js:281-285)`
- `assignSelectedImage (src/app.js:805-866)` -> `ensureAuthenticatedSession (src/app.js:1328-1350)` -> `createMaskingApiClient.assignImage (src/api/client.js:101-113)` -> `userHasRole (src/config/runtimeDefaults.js:43-46)` -> `routeImage.assignment (src/server/api.js:318-358)`
- `DEFAULT_PROJECT/DEFAULT_ACTORS/DEFAULT_SESSION (src/config/runtimeDefaults.js:7-21)` -> `state defaults (src/app.js:18-34)` -> `createProjectRecord/export fallbacks (src/export/exporter.js)`
- `readSession (src/server/api.js:365-382)` -> `requireRole (src/server/api.js:384-393)` -> protected API routes
- `serveStatic (server.js:57-99)` -> `isPrivateStaticPath (server.js:101-109)` -> server-only auth module

### validated

- `loginSession (src/app.js:374-392)` -> `createMaskingApiClient.login (src/api/client.js:14-24)` -> `validateMvpCredentials (src/server/auth.js:9-13)` -> `createSession (src/server/api.js:397-408)`
  - validation: `npm test -- tests/serverApi.test.js tests/apiClient.test.js tests/appContracts.test.js` passed; invalid password returns `401`, role spoof in login payload is ignored, client sends user ID/password only.
- `reviewSelectedImage (src/app.js:723-799)` -> `ensureAuthenticatedSession (src/app.js:1328-1350)` -> `getReviewActorId (src/app.js:1143-1147)` -> `createMaskingApiClient.reviewImage (src/api/client.js:88-99)` -> `applyReviewTransition (src/server/api.js:281-285)`
  - validation: focused tests passed; review body reviewer spoof is ignored and server audit uses authenticated session identity.
- `assignSelectedImage (src/app.js:805-866)` -> `ensureAuthenticatedSession (src/app.js:1328-1350)` -> `createMaskingApiClient.assignImage (src/api/client.js:101-113)` -> `userHasRole (src/config/runtimeDefaults.js:43-46)` -> `routeImage.assignment (src/server/api.js:318-358)`
  - validation: focused tests passed; assignment rejects invalid target roles and stores `assigned_by` from session.
- `DEFAULT_PROJECT/DEFAULT_ACTORS/DEFAULT_SESSION (src/config/runtimeDefaults.js:7-21)` -> `state defaults (src/app.js:18-34)` -> `createProjectRecord/export fallbacks (src/export/exporter.js)`
  - validation: app contract test passed; remaining defaults are explicit and centralized.
- `readSession (src/server/api.js:365-382)` -> `requireRole (src/server/api.js:384-393)` -> protected API routes
  - validation: focused tests passed; forged `x-user-id` / `x-user-role` headers without bearer token return `403`.
- `serveStatic (server.js:57-99)` -> `isPrivateStaticPath (server.js:101-109)` -> `validateMvpCredentials (src/server/auth.js:9-13)`
  - validation: app contract test passed; browser-imported defaults do not contain MVP passwords and server-only paths are blocked from static serving.

### discarded

- Persistent account/session storage.
  - reason: intentionally deferred to Future Hardening; MVP sessions remain in memory.
- Assignment queue filtering.
  - reason: current batch validates assignment targets but does not introduce queue UX.

## Validation Plan

- `node --check src/app.js`
- `npm test -- tests/serverApi.test.js tests/apiClient.test.js tests/appContracts.test.js`
- `npm run lint`
- `npm test`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- Browser/server smoke with `curl` against running dev server.

## Progress Notes

- Subagent implemented the login-panel UI slice while the main agent owned
  server/API/defaults/tests/docs integration.
- A follow-up review found that the browser still exposed a manual reviewer ID
  field; the field was removed and review actor identity now derives from
  authenticated `reviewer` or `admin` sessions.
- A follow-up review found that legacy role headers still authorized API calls;
  bearer token authentication is now required for protected routes.
- A follow-up review found that MVP passwords were in a browser-imported module;
  credential checking moved to `src/server/auth.js`, and server-only paths are
  blocked from static serving.
- A follow-up review also found that the default login user still pointed to an
  old local placeholder; default session user is now the MVP account `admin`.

## Findings

- Remaining `worker` and `reviewer` values are default assignment targets, not a
  completed user directory or assignment queue.
- `mask_project_001` remains because project creation/opening is the next
  product workflow, not because defaults are scattered.

## File-back Candidates

- No playbook promotion yet; this is still a single operations foundation batch.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Feature status updated with completed and remaining work.
- [x] Commit and push completed.
