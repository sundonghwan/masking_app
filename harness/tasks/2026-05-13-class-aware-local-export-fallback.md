# Task: class-aware-local-export-fallback

## Goal
- Keep browser local fallback ZIP export class-aware when server-side export cannot be used.

## Scope
- Canonical browser export records preserve `image.annotations[]`.
- Local fallback ZIP writes one mask entry per class annotation.
- Focused exporter/app contract tests and harness validation.

## Non-goals
- Changing server ZIP behavior already completed in the previous task.
- Indexed-mask derivation.
- AI prediction import.

## Risks
- Local fallback could silently export only the legacy selected class mask.
- Browser ZIP should still write each original image once.
- Legacy single-mask fallback must remain readable.

## Impact Chains

### suspected
- toCanonicalImageRecord (src/export/exporter.js:393-415) -> buildAnnotations (src/export/exporter.js:310-312) -> exportProject (src/app.js:1215-1281)
- exportProject (src/app.js:1215-1281) -> localExportMaskBlobForAnnotation (src/app.js:1283-1293) -> projectStore.loadMaskBlob (src/storage/projectStore.js:*) -> createZipBlob (src/export/zip.js:*)

### validated
- toCanonicalImageRecord (src/export/exporter.js:393-415) -> buildAnnotations (src/export/exporter.js:310-312) -> exportProject (src/app.js:1215-1281)
  - validation: `node --test tests/exporter.test.js tests/appContracts.test.js`
- exportProject (src/app.js:1215-1281) -> localExportMaskBlobForAnnotation (src/app.js:1283-1293) -> projectStore.loadMaskBlob (src/storage/projectStore.js:*) -> createZipBlob (src/export/zip.js:*)
  - validation: `node --test tests/exporter.test.js tests/appContracts.test.js`

### discarded
- server export mask path handling
  - reason: covered by `2026-05-13-class-aware-export-metadata`.

## Validation Plan
- `node --test tests/exporter.test.js tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Browser canonical export records now preserve `image.annotations[]`.
- Local fallback ZIP writes original images once, then writes mask entries from `annotations.json`.
- Class-specific local masks are loaded from `annotationMaskBlobKey(image.id, annotation.class_id)` with legacy fallback only for legacy/current selected masks.

## Closeout
- Targeted exporter/app contract tests passed.
- Full harness validation passed with 233 tests.
- Code review found no blocking issue after checking duplicate image behavior and legacy single-mask fallback.
