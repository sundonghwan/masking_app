# Task: worker-e-app-contracts

## Goal

- Add Node built-in tests for app-level persistence/export integration contracts
  using existing exported helpers only.

## Scope

- `tests/appContracts.test.js`
- `harness/tasks/2026-04-29-worker-e-app-contracts.md`

## Non-goals

- Do not edit `src/app.js`.
- Do not extract private app persistence helpers in this worker task.
- Do not change exporter implementation behavior.
- Do not edit unrelated tests or harness files.

## Touched Areas

- App persistence/export contract tests.
- Export helper integration surface.

## Risks

- Restored image metadata could become non-exportable if validation requires a
  browser `File` or live object URL.
- Persisted image metadata could accidentally retain non-serializable browser
  fields.
- Rehydrated object URLs could be confused with durable archive paths.

## Impact Chains

### suspected

- `createImageRecord (src/export/exporter.js:34-72) -> serializeJson (src/export/exporter.js:224-226)`
- `createImageRecord (src/export/exporter.js:34-72) -> validateExportItem (src/export/exporter.js:285-299)`
- `createImageRecord (src/export/exporter.js:34-72) -> buildAnnotations (src/export/exporter.js:268-270)`

### validated

- `createImageRecord (src/export/exporter.js:34-72) -> serializeJson (src/export/exporter.js:224-226)`
  - validation: `node --test tests/appContracts.test.js`, test "image
    records can be serialized without File objects or object URLs", passed.
- `createImageRecord (src/export/exporter.js:34-72) -> validateExportItem (src/export/exporter.js:285-298)`
  - validation: `node --test tests/appContracts.test.js`, test "export
    validation accepts restored submitted records without runtime handles",
    passed.
- `createImageRecord (src/export/exporter.js:34-72) -> buildAnnotations (src/export/exporter.js:268-270)`
  - validation: `node --test tests/appContracts.test.js`, test "export
    validation accepts restored submitted records without runtime handles",
    passed.

### discarded

- `persistProject (src/app.js:427-435) -> restoreProject (src/app.js:437-450)`
  - reason: these helpers are private in `src/app.js`; this task is explicitly
    limited to exported helpers and does not edit implementation files.

## Validation Plan

- `node --test tests/appContracts.test.js` -> proves the new app-level contract
  tests pass in isolation.
- `scripts/harness/test-target.sh appContracts` -> proves the harness target can
  run the new test file.
- `node --check tests/appContracts.test.js` -> proves the new test module parses.
- `scripts/harness/test-target.sh` -> proves the full current Node test suite
  still passes.

## Progress Notes

- Existing exported helpers are available in `src/export/exporter.js`.
- Private app persistence helpers exist in `src/app.js`, but importing `app.js`
  would execute browser DOM startup side effects and is outside this task scope.

## Findings

- Exported helper coverage is available through `createImageRecord`,
  `serializeJson`, `validateExportItem`, and `buildAnnotations`.
- `persistProject` and `restoreProject` remain private in `src/app.js`; direct
  persistence helper tests would require a future minimal extraction outside
  this worker's allowed edit scope.

## File-back Candidates

- No reusable lesson identified yet.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
