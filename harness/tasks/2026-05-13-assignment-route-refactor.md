# Task: assignment-route-refactor

## Goal
- Reduce `src/server/api.js` assignment route complexity by extracting pure
  assignment target/update helpers.

## Scope
- Add helper functions for target normalization, role validation summary, and
  image assignment updates.
- Cover helpers with focused tests.
- Keep route auth, storage, user-role lookup, audit, and response shapes
  unchanged.

## Non-goals
- Changing assignment API fields.
- Changing role policy.
- Changing queue filtering or browser assignment UI.

## Touched areas
- `src/server/api.js`
- `src/server/assignment.js`
- `tests/serverAssignment.test.js`
- `docs/FEATURE_STATUS.md`

## Risks
- Empty reviewer fallback behavior could change.
- Assignment update could accidentally mutate image status.
- Error payload shape could drift from existing API tests.

## Impact Chains
### suspected
- routeImage assignment PUT (src/server/api.js:969-1015) -> buildAssignmentTargets/buildAssignmentUpdate (src/server/assignment.js:3-29) -> storage.writeProjectManifest (src/server/api.js:995)

### validated
- routeImage assignment PUT (src/server/api.js:969-1015) -> buildAssignmentTargets/buildAssignmentUpdate (src/server/assignment.js:3-29) -> storage.writeProjectManifest (src/server/api.js:995)
  - validation: `node --test tests/serverAssignment.test.js`, `node --test tests/serverApi.test.js`

### discarded
- Browser assignment UI.
  - reason: this is backend route code-health only; browser contract is covered by existing tests.

## Validation Plan
- RED/GREEN: `node --test tests/serverAssignment.test.js`
- Integration guard: `node --test tests/serverApi.test.js`
- Full: `scripts/harness/test-target.sh`
- Syntax: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Smoke: `scripts/harness/smoke-web.sh`
- Whitespace: `git diff --check`

## Progress Notes
- Selected as the next small code-smell cleanup after project settings route
  extraction.
- RED confirmed the assignment helper module did not exist yet.
- Route still owns auth, storage, user-role lookup, logging, audit, and HTTP
  response. Helper only owns pure target normalization, validation shape, and
  image update shape.

## Closeout
- Extracted assignment target/validation/update helpers to
  `src/server/assignment.js`.
- Added focused helper tests for actor normalization fallback, validation
  payload shape, and status-preserving assignment updates.
- Validation passed:
  - `node --test tests/serverAssignment.test.js`
  - `node --test tests/serverApi.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (319 tests)
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: `api.js` still contains
  larger mask-save and review route blocks that should be extracted only in
  small, test-backed batches.
- Commit `3be9ba0` pushed to `origin/main`.
