# Task: training-set-route-utils-refactor

## Goal
- Reduce `src/server/api.js` size by extracting training-set route utility functions into a focused server module.

## Scope
- Pure training-set route helpers:
  - training-set ID normalization
  - training source reference normalization
  - training source summary creation
  - saved training-set split list generation
- Focused unit tests for the extracted module.
- Syntax harness coverage for the new module.

## Non-goals
- Route behavior changes.
- Training-set export format changes.
- Storage helper changes.
- Large route-family decomposition.

## Touched areas
- `src/server/api.js`
- `src/server/trainingSetRouteUtils.js`
- `tests/trainingSetRouteUtils.test.js`
- `scripts/harness/check-syntax.mjs`

## Risks
- Source summary counts could drift from existing active/deleted image filtering.
- ID/source normalization could change persisted manifest fields.
- Split list newline format could change saved training-set exports.

## Impact Chains
### suspected
- None remaining.

### validated
- createSavedTrainingSet (src/server/api.js:1562-1626) -> normalizeTrainingSetId / normalizeTrainingSourceRef (src/server/trainingSetRouteUtils.js:24-40)
- listTrainingSources (src/server/api.js:1453-1490) -> createTrainingSourceSummary (src/server/trainingSetRouteUtils.js:4-22)
- exportSavedTrainingSet (src/server/api.js:1788-1839) -> splitListFromManifest (src/server/trainingSetRouteUtils.js:42-46)

### discarded
- Production API route split.
  - reason: this batch is a low-risk utility extraction, not a route decomposition.

## Validation Plan
- RED/GREEN: `node --test tests/trainingSetRouteUtils.test.js`
- API behavior guard: `node --test tests/serverApi.test.js`
- Full: `scripts/harness/test-target.sh`
- Syntax: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Whitespace: `git diff --check`

## Progress Notes
- Selected from code health checklist: `src/server/api.js` remains large, and these helpers have clear behavior boundaries and can be tested outside the controller.
- RED confirmed the new focused test failed before the helper module existed.
- GREEN moved the existing helper logic into `src/server/trainingSetRouteUtils.js` and imported it from `src/server/api.js`.

## Closeout
- `node --test tests/trainingSetRouteUtils.test.js` passed with 4 tests.
- `node --test tests/serverApi.test.js` passed with 66 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 311 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issue. Checked that helper bodies preserve prior normalization, active image filtering, revision normalization, and split-list trailing newline behavior; new module is included in syntax harness coverage.
