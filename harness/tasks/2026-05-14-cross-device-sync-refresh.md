# Task: cross-device-sync-refresh

## Goal

- Make it clear and practical to pull the latest server project data when the
  same project is edited from iPad and PC.

## Scope

- Workbench server refresh action
- Cross-device sync manual
- Contract coverage for the refresh entry point

## Non-goals

- Real-time multi-client collaboration
- Conflict merge UI
- Replacing browser local IndexedDB cache
- Apple Pencil double-tap toggle implementation

## Touched areas

- `index.html`
- `src/app.js`
- `tests/appContracts.test.js`
- `docs/USER_MANUAL.md`

## Risks

- A user can overwrite local-only unsynced browser changes by pulling the server
  manifest.
- Existing task/version refresh behavior must not disappear.
- The UI must not imply real-time synchronization.

## Impact Chains

### suspected

- refreshVersionsButton (index.html:152-152) -> refreshWorkbenchFromServer (src/app.js:757-779) -> apiClient.getProject (src/api/client.js)
- refreshWorkbenchFromServer (src/app.js:757-779) -> restoreServerManifest (src/app.js) -> render (src/app.js)
- saveCurrentMask (src/app.js) -> syncMaskToBackend (src/app.js) -> refreshWorkbenchFromServer (src/app.js:757-779)

### validated

- refreshVersionsButton (index.html:152-152) -> refreshWorkbenchFromServer (src/app.js:757-779) -> apiClient.getProject (src/api/client.js)
  - validation: `node --test tests/appContracts.test.js`
- refreshWorkbenchFromServer (src/app.js:757-779) -> restoreServerManifest (src/app.js) -> render (src/app.js)
  - validation: `scripts/harness/test-target.sh`

### discarded

- Browser-to-browser peer sync
  - reason: Current architecture is server-first sync plus per-browser local
    cache, not real-time collaboration.

## Validation Plan

- `node --check src/app.js`
- `node --test tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `git diff --check`

## Progress Notes

- Root cause: each browser keeps its own IndexedDB snapshot, and the other
  device did not have an obvious workbench action to reload the latest server
  manifest after iPad/PC edits.
- The topbar refresh action now reloads the current project manifest from the
  server, then refreshes task/version and training source context.
- If local-only dirty/sync-issue items exist, the app asks for confirmation
  before replacing the workbench state with the server manifest.

## Closeout

- Refresh button now pulls the latest server manifest into the workbench and
  keeps the task/version refresh behavior by calling `refreshVersionContext`.
- Manual documents that iPad/PC sync is server-mediated and not live
  collaboration.
- Validation passed:
  - `node --check src/app.js`
  - `node --test tests/appContracts.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining product risk: this is still a
  manual pull model, not automatic live sync or conflict merge.
