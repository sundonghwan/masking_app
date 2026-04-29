# Task: export-policy-unification

## Goal

- Make server ZIP file entries, `annotations.json`, and `export_summary.json`
  use the same exportable image decision.

## Scope

- `src/server/api.js`
- `tests/serverApi.test.js`
- architecture/checkpoint docs
- harness run log

## Non-goals

- Multipart upload.
- Full PNG pixel decode.
- Review workflow.
- DB-backed export records.

## Touched Areas

- backend export route
- export validation policy integration
- server API tests

## Risks

- ZIP files can include images that annotations exclude.
- ZIP paths can differ from annotation paths.
- `export_summary.json` can report exclusion while file entries still include
  excluded data.

## Impact Chains

### suspected

- exportProject (src/server/api.js:120-153) -> createValidationSummary (src/export/exporter.js:62-86) -> createAnnotationsJson (src/export/exporter.js:120-149) -> createExportSummaryJson (src/export/exporter.js:151-181) -> createZipBlob (src/export/zip.js:44-76)

### validated

- exportProject (src/server/api.js:120-153) -> createValidationSummary (src/export/exporter.js:62-86) -> createExportPaths (src/export/exporter.js:183-188) -> createZipBlob (src/export/zip.js:44-76)

### discarded

- approved-only export policy
  - reason: MVP export still includes `submitted` or `approved`; approved-only
    belongs with review workflow.

## Validation Plan

- `node --test tests/serverApi.test.js`
- `npm run lint`
- `npm test`
- `scripts/harness/smoke-web.sh`
- API export smoke on running dev server

## Progress Notes

- Server export now builds one validation summary and uses it for summary and
  file-entry filtering.
- Server export file entries now use `createExportPaths`, the same archive path
  generator used by annotations.
- `in_progress` images with masks are excluded from actual ZIP files.

## Findings

- Export policy checkpoint is closed for server-side ZIP generation.
- Full backend pixel validation remains a later migration trigger.
- API export smoke confirmed the ZIP includes `images/submitted.png` and
  `masks/submitted_mask.png`, excludes draft image/mask files, and keeps
  `status_not_exportable` in the summary.

## Closeout

- [x] Scope matched actual diff.
- [x] ZIP file entries and annotations use the same archive paths.
- [x] Excluded images are not included as ZIP file entries.
