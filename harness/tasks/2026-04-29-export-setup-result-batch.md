# Task: export-setup-result-batch

## Goal
- Make export readiness visible before operators generate a ZIP.

## Scope
- Export readiness summary counts.
- Export exclusion reason list.
- Export ZIP structure preview.

## Non-goals
- Separate export route.
- Stored export records.
- New export file formats.

## Touched areas
- `index.html`
- `src/app.js`
- `src/styles.css`
- `docs/FEATURE_STATUS.md`

## Risks
- Export preview can drift from actual export validation.
- Exclusion reasons can overwhelm the compact inspector panel.
- Preview should not imply files exist when they are not exportable.

## Impact Chains
### suspected
- renderExportPolicy (src/app.js:827-838) -> getExportState (src/app.js:840-850) -> validateExportItem (src/export/exporter.js:297-310)
- exportProject (src/app.js:348-410) -> createExportPaths (src/export/exporter.js:211-217) -> createZipBlob (src/export/zip.js:3-33)

### validated
- renderExportPolicy (src/app.js:827-838) -> getExportState (src/app.js:840-850) -> validateExportItem (src/export/exporter.js:297-310)
- exportProject (src/app.js:348-410) -> createExportPaths (src/export/exporter.js:211-217) -> createZipBlob (src/export/zip.js:3-33)

### discarded
- stored export record flow
  - reason: export record persistence is a later operational feature.

## Validation Plan
- `npm run lint`
- `npm test`
- harness verification bundle
- HTML smoke for export summary, exclusion list, and preview controls.

## Implementation Review
- Finding: no blocking issue in the new export setup UI.
- Checked that the included/excluded counts and exclusion list share `getExportState()` with the actual export action.
- Checked that the exclusion list is capped to 5 rows so the inspector panel does not grow unbounded.
- Review fix applied: local browser ZIP entries now use `createExportPaths()` so the preview, annotations, server export, and local export paths follow the same naming policy.

## Completed Features
- Export readiness summary.
- Export exclusion reason list.
- Export ZIP structure preview.

## Remaining Work
- Stored export records.
- Separate export result route if export workflow outgrows the workbench panel.

## Closeout
- `npm run lint` passed.
- `npm test` passed, 84 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed, 84 tests.
- `scripts/harness/smoke-web.sh` passed.
- Server HTML smoke passed with `exportIncludedCount`, `exportExcludedCount`, `exportErrorList`, and `exportFilePreview` present.
