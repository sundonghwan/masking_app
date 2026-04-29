# Task: submitted-revision-flow

## Goal

- Allow submitted or approved masks to enter an explicit revision/edit mode with
  audit history before additional edits are saved.

## Scope

- Add a workbench action for starting revision mode.
- Move submitted/approved images back to `in_progress` when revision starts.
- Record a revision audit event locally and on server mask save.
- Keep export behavior safe by relying on existing `in_progress` exclusion.
- Update feature status and checkpoint docs.

## Non-goals

- New `revision_requested` status.
- Reviewer approval workflow redesign.
- Side-by-side diff viewer.
- Dedicated revision dashboard.

## Touched Areas

- `index.html`
- `src/app.js`
- `src/api/client.js`
- `src/server/api.js`
- `tests/apiClient.test.js`
- `tests/serverApi.test.js`
- `tests/appContracts.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`

## Risks

- Submitted/approved masks must not stay exportable after edit begins.
- Revision audit event must not be lost when syncing to the server.
- Mask save API should not accept arbitrary large or unsafe revision payloads.
- Existing rejected-image rework action must remain intact.

## Impact Chains

### suspected

- `startRevisionMode (src/app.js:549-578)` -> `handleEditorChange (src/app.js:1013-1027)` -> `syncMaskToBackend (src/app.js:678-724)` -> `apiClient.saveMask (src/api/client.js:75-88)` -> `routeImage mask save (src/server/api.js:215-270)`
- `validateImageForExport (src/export/exporter.js:106-147)` -> in-progress exclusion for revised images

### validated

- `startRevisionMode (src/app.js:549-578)` -> `handleEditorChange (src/app.js:1013-1027)` -> `syncMaskToBackend (src/app.js:678-724)` -> `apiClient.saveMask (src/api/client.js:75-88)` -> `routeImage mask save (src/server/api.js:215-270)`
  - validation: `npm test -- tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js` passed; server test verifies authenticated actor overrides spoofed revision actor.
- `validateImageForExport (src/export/exporter.js:106-147)` -> in-progress exclusion for revised images
  - validation: revised images move to `in_progress`, which existing export policy excludes; app contract verifies revision flow returns to `in_progress`.

### discarded

- New `revision_requested` status.
  - reason: current exporter already excludes `in_progress`; adding a new status
    would widen API/export contracts more than needed for this batch.

## Validation Plan

- `npm test -- tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js`
- `npm run lint`
- `git diff --check`
- Full harness wrapper scripts before closeout.

## Progress Notes

- Added `수정 시작` workbench action for admin/worker users.
- Submitted/approved images move to `in_progress` when revision starts.
- Editor changes on a submitted/approved image also start revision mode so audit
  history is not skipped.
- Revision audit event is sent with the next mask save and stored on the server
  using the authenticated session actor.
- Implementation review found and fixed one issue: the server initially accepted
  the revision actor from the client payload. `normalizeRevisionEvent` now
  prefers the authenticated session actor.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [x] Commit completed: `5b4877b Add submitted revision flow`.
- [ ] Push completed.
