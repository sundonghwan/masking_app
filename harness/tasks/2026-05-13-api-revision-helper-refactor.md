# Task: api-revision-helper-refactor

## Goal
- Extract API revision helper logic from `src/server/api.js` into a focused,
  tested server helper module.

## Scope
- Move `assertRevisionMatch`, `readIfMatchRevision`, `normalizeRevision`, and
  `nextRevision` into `src/server/revisions.js`.
- Add focused tests for body/header revision parsing, stale conflict response,
  and revision normalization.
- Add the new module to syntax coverage.

## Non-goals
- Change revision conflict semantics.
- Change project/task/version/training-set storage mutation behavior.
- Refactor route handlers or storage helpers broadly.

## Touched areas
- `src/server/api.js`
- `src/server/revisions.js`
- `tests/revisions.test.js`
- `scripts/harness/check-syntax.mjs`
- `harness/run_log.md`

## Risks
- Stale mutation protection could silently weaken if revision parsing changes.
- Conflict response shape could drift from existing API clients.
- Extracting helpers could hide the `sendJson` side effect.

## Impact Chains

### suspected
- api mutation handlers (src/server/api.js:264-640) -> assertRevisionMatch (src/server/api.js:1271-1283) -> sendJson revision_conflict (src/server/httpUtils.js)
- training set mutation handlers (src/server/api.js:1408-1728) -> nextRevision (src/server/api.js:1298-1300) -> storage manifest revision update

### validated
- api mutation handlers (src/server/api.js:264-640) -> assertRevisionMatch (src/server/revisions.js:3-14) -> sendJson revision_conflict (src/server/httpUtils.js)
  - validation: `node --test tests/revisions.test.js`, `node --test tests/serverApi.test.js`
- training set mutation handlers (src/server/api.js:1385-1728) -> nextRevision (src/server/revisions.js:28-30) -> storage manifest revision update
  - validation: `scripts/harness/test-target.sh`

### discarded
- None yet.

## Validation Plan
- RED/GREEN: `node --test tests/revisions.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Extracted revision parsing, conflict response, normalization, and increment
  helpers into `src/server/revisions.js`.
- Preserved API behavior; route handlers still call the same helper names, now
  imported from the focused module.
- Validation passed:
  - RED/GREEN: `node --test tests/revisions.test.js`
  - `node --test tests/serverApi.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: this is still a narrow
  helper extraction; the larger `src/server/api.js` route grouping smell remains
  and should continue route group by route group.
