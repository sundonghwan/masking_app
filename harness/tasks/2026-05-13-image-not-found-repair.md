# Task: repair image-not-found dataset mismatch

## Goal
- Fix the `Image not found` failure seen during data work when server storage
  contains image files that are missing from the project manifest.

## Scope
- Project filesystem repair path.
- Current local dataset repair for `rail-mask-20260513`.
- Focused storage tests.

## Non-goals
- Replace local-first IndexedDB recovery.
- Redesign task/version image editing routes.
- Delete or purge any user data.

## Risks
- Repair could accidentally register unrelated files as annotation images.
- Manifest repair touches image storage contracts.
- Current browser local state may still need a refresh after server repair.

## Impact Chains
### suspected
- restoreProject (src/app.js:3841-3860) -> selectImage (src/app.js:668-700) -> syncMaskToBackend (src/app.js:1511-1580) -> routeImage mask save (src/server/api.js:788-860)

### validated
- repairProjectManifest (src/server/storage.js:113-125) -> repairProjectManifestRecord (src/server/storage.js:979-1063) -> addOrphanProjectImagesToRepair (src/server/storage.js:1065-1138)
  - validation: `node --test --test-name-pattern "repairs project manifests by adding orphan image files" tests/serverStorage.test.js`
- routeProject repair (src/server/api.js:391-402) -> repairProjectManifest (src/server/storage.js:113-125) -> addOrphanProjectImagesToRepair (src/server/storage.js:1065-1138)
  - validation: `node --test tests/serverStorage.test.js`, `scripts/harness/test-target.sh`
- restoreProject (src/app.js:3841-3860) -> selectImage (src/app.js:668-700) -> syncMaskToBackend (src/app.js:1511-1580) -> routeImage mask save (src/server/api.js:788-860)
  - validation: live API check for `image_0001` now reaches mask validation instead of `Image not found`.

### discarded
- None yet.

## Validation Plan
- RED/GREEN: `node --test --test-name-pattern "repairs project manifests by adding orphan image files" tests/serverStorage.test.js`
- Regression: `node --test tests/serverStorage.test.js`
- Data check: `scripts/harness/storage-verify.sh --json data`
- Live API spot check against repaired image save/load path when practical.

## Progress Notes
- Server logs show `PUT /api/images/image_0001/mask` and assignment returning
  `Image not found`.
- `data/rail-mask-20260513/images/image_0001_...png` exists, but
  `data/rail-mask-20260513/manifest.json` starts at `image_0003`.
- Task/version manifest for `default_task/v1` is empty, but the immediate 404 is
  from the legacy image endpoint reading the flat project manifest.
- Added repair logic that discovers valid image files under project `images/`
  when they are not referenced by the flat manifest.
- Applied repair to `rail-mask-20260513`; orphan records added:
  `image_0001`, `image_0002`, `image_0057`, `image_0058`.
- Restarted dev server so the new repair behavior is active.

## Closeout
- RED passed: orphan image repair test failed before implementation.
- GREEN passed: focused orphan image repair test passed.
- `node --test tests/serverStorage.test.js` passed, 26 tests.
- `scripts/harness/storage-verify.sh --json data` passed after data repair.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed, 329 tests.
- `git diff --check` passed.
- Live check: `GET /api/projects/rail-mask-20260513` now includes the restored
  image ids; `PUT /api/images/image_0001/mask` returns mask validation failure
  for invalid PNG instead of `Image not found`.
- Code review: no blocking issue found. Repair only adds valid image metadata
  from files already under the project-owned `images/` directory and preserves
  preview/apply behavior.
