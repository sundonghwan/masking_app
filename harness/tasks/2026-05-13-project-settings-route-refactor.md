# Task: project-settings-route-refactor

## Goal
- Reduce `src/server/api.js` route complexity by extracting project settings
  update normalization into a focused server helper.

## Scope
- Add a pure helper for project settings PATCH/PUT merge behavior.
- Cover the helper with targeted tests.
- Keep API behavior and response shape unchanged.

## Non-goals
- Changing project settings fields.
- Changing revision guard behavior.
- Changing storage write behavior.

## Touched areas
- `src/server/api.js`
- `src/server/projectSettings.js`
- `tests/projectSettings.test.js`
- `docs/FEATURE_STATUS.md`

## Risks
- Settings PATCH could accidentally drop existing upload, magic-tool, or label
  schema values.
- Revision increments could change from current API behavior.

## Impact Chains
### suspected
- routeProject settings PATCH (src/server/api.js:440-462) -> buildProjectSettingsUpdate (src/server/projectSettings.js:5-31) -> storage.writeProjectManifest (src/server/api.js:449)

### validated
- routeProject settings PATCH (src/server/api.js:440-462) -> buildProjectSettingsUpdate (src/server/projectSettings.js:5-31) -> storage.writeProjectManifest (src/server/api.js:449)
  - validation: `node --test tests/projectSettings.test.js`, `node --test tests/serverApi.test.js`

### discarded
- Project archive/restore routes.
  - reason: this task only extracts settings update merge logic.

## Validation Plan
- RED/GREEN: `node --test tests/projectSettings.test.js`
- Integration guard: `node --test tests/serverApi.test.js`
- Full: `scripts/harness/test-target.sh`
- Syntax: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Smoke: `scripts/harness/smoke-web.sh`
- Whitespace: `git diff --check`

## Progress Notes
- Selected as periodic code-smell cleanup: `src/server/api.js` is large and
  settings update normalization is pure enough to move without changing route
  behavior.
- RED confirmed the new helper module did not exist yet.
- First helper test exposed an incorrect test expectation for upload policy
  shape; corrected to the existing `maxFileBytes` contract.

## Closeout
- Extracted project settings update merge/normalization to
  `src/server/projectSettings.js`.
- Kept the route responsible for auth, revision guard, storage write, and HTTP
  response only.
- Validation passed:
  - `node --test tests/projectSettings.test.js`
  - `node --test tests/serverApi.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (316 tests)
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: `src/server/api.js`
  remains large; continue extracting route-local pure logic in small batches.
