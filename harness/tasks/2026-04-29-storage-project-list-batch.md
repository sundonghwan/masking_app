# Task: storage-project-list-batch

## Goal
- Resolve the invalid-mask orphan-file risk and add a lightweight project list
  foundation before larger dataset/project screens.

## Scope
- Validate mask buffers before filesystem writes.
- Add server project list summaries.
- Show project summaries in the workbench sidebar.

## Non-goals
- Full project switching.
- Project create/edit/delete UI.
- Database-backed project repository.

## Touched areas
- `src/server/storage.js`
- `src/server/api.js`
- `src/api/client.js`
- `src/app.js`
- `index.html`
- `src/styles.css`
- `tests/serverStorage.test.js`
- `tests/serverApi.test.js`
- `tests/apiClient.test.js`
- `docs/FEATURE_STATUS.md`

## Risks
- Mask validation can write rejected files if storage writes before validation.
- Project list summaries can drift from manifest state if computed separately.
- Frontend project list should remain read-only until project switching exists.

## Impact Chains
### suspected
- routeImage mask save (src/server/api.js) -> storage.decodeMaskDataUrl (src/server/storage.js) -> validateMaskContract (src/server/maskValidation.js) -> storage.writeMaskBuffer (src/server/storage.js)
- routeApi projects list (src/server/api.js) -> storage.listProjects (src/server/storage.js)
- refreshProjectSummaries (src/app.js) -> apiClient.listProjects (src/api/client.js) -> renderProjectSummaries (src/app.js)

### validated
- routeImage mask save (src/server/api.js) -> storage.decodeMaskDataUrl (src/server/storage.js) -> validateMaskContract (src/server/maskValidation.js) -> storage.writeMaskBuffer (src/server/storage.js)
- routeApi projects list (src/server/api.js) -> storage.listProjects (src/server/storage.js)
- refreshProjectSummaries (src/app.js) -> apiClient.listProjects (src/api/client.js) -> renderProjectSummaries (src/app.js)

### discarded
- project switching flow
  - reason: listing is useful now, switching requires broader local/server restore rules.

## Validation Plan
- `npm run lint`
- `npm test`
- harness verification bundle
- API smoke for invalid mask no-write, project list, and rendered project list UI.

## Implementation Review
- Reviewed mask save ordering. The server now decodes the mask payload, validates
  the buffer, and only then writes the mask file.
- Reviewed project summaries. Counts are computed directly from each manifest,
  avoiding a second source of truth.
- Reviewed frontend scope. The project browser is read-only; project switching
  is intentionally deferred until restore semantics are designed.
- No blocking issue found.

## Completed Features
- Validate masks before filesystem write.
- Server project list API.
- Project summary list in workbench.

## Remaining Work
- Full project switching.
- Project create/edit/delete UI.
- Database-backed project repository.

## Closeout
- `npm run lint` passed.
- `npm test` passed with 84 tests.
- `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`,
  `scripts/harness/test-target.sh`, and `scripts/harness/smoke-web.sh` passed.
- API smoke confirmed valid mask save succeeds, invalid non-binary mask returns
  `422`, and manifest remains on the prior valid mask.
- API smoke confirmed `GET /api/projects` returns project summaries.
- HTML smoke confirmed project list UI renders.
- `docs/FEATURE_STATUS.md` updated with completed and remaining features.
