# Task: ui-stale-pollution-refresh

## Goal

- Fix the case where the server project data is clean but the UI still shows
  old polluted annotations from browser local recovery state.

## Scope

- Startup restore flow in `src/app.js`.
- App contract coverage in `tests/appContracts.test.js`.
- Current data and API verification for `rail-mask-20260513`.

## Non-goals

- Add real-time multi-device sync.
- Merge conflicting local-only mask edits.
- Change mask annotation semantics beyond the current slider-only repair.

## Risks

- Automatically pulling server data could overwrite unsynced local browser work.
- Leaving startup local-first only can keep stale IndexedDB pollution visible
  after the server has already been repaired.

## Impact Chains

### suspected

- restoreProject (src/app.js:3867-3916) -> init (src/app.js:293-322) -> selectImage (src/app.js:671-704)
- refreshRestoredProjectFromServer (src/app.js:782-799) -> apiClient.getProject (src/api/client.js:78-80) -> restoreServerManifest (src/app.js:2544-2561)

### validated

- init (src/app.js:293-322) -> refreshRestoredProjectFromServer (src/app.js:782-799) -> restoreServerManifest (src/app.js:2544-2561)
  - validation: `node --test tests/appContracts.test.js`
  - validation: authenticated `GET /api/projects/rail-mask-20260513` returned only `class_id=1` / `slider` annotations and `bad=[]`.
- refreshRestoredProjectFromServer (src/app.js:782-799) -> hasSyncIssue (src/app.js:3767-3775)
  - validation: code review confirmed automatic refresh returns early when any local image is dirty or has a sync issue.

### discarded

- Object DB/MinIO metadata still feeding polluted UI
  - reason: the live server for `npm run dev` is filesystem-backed; direct API
    verification after server restart returned clean slider-only project data.

## Validation Plan

- Verify filesystem manifest has no `support`, `class_2`, or `unlabeled`
  references.
- Verify storage with `scripts/harness/storage-verify.sh --json data`.
- Verify authenticated project API returns only slider annotations.
- Run app contract test for startup server refresh wiring.
- Run lint, typecheck, and full test suite.

## Progress Notes

- The direct filesystem manifest summary showed one label, `slider`, with 12
  annotations.
- The live API summary after server restart also showed one label, `slider`, and
  `bad=[]`.
- Root cause for the user's visible UI mismatch was stale browser IndexedDB
  recovery state, not current server project data.

## Closeout

- Added startup server refresh after restored session validation.
- The refresh is skipped when dirty or unsynced local-only work exists.
- Tests and storage/API checks passed.
