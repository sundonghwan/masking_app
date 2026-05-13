# Task: class-aware-export-metadata

## Goal
- Export class-labeled mask metadata so downstream training can consume `class_id + mask_path` records.

## Scope
- `annotations.json` class-aware metadata
- Project ZIP mask entries for class annotations
- Training-set manifest and ZIP entries for class annotations
- Focused exporter/training/server tests and status docs

## Non-goals
- Indexed-mask derivation
- AI prediction import
- Changing binary mask PNG contents

## Risks
- Legacy single-mask export must remain compatible.
- Multi-class images should not duplicate original image files unnecessarily.
- Server ZIP must read each annotation's source mask path, not only `current_mask_path`.

## Impact Chains

### suspected
- createAnnotationsJson (src/export/exporter.js:160-200) -> exportProject (src/server/api.js:1498-1543) -> createZipBlob (src/export/zip.js:*)
- createTrainingSetManifest (src/export/trainingSet.js:4-90) -> createTrainingSetZipEntries (src/export/trainingSet.js:92-140) -> exportTrainingSet (src/server/api.js:1545-*)

### validated
- createAnnotationsJson (src/export/exporter.js:160-200) -> exportProject (src/server/api.js:1498-1543) -> createZipBlob (src/export/zip.js:*)
  - validation: `node --test tests/exporter.test.js tests/trainingSet.test.js tests/serverApi.test.js`
- createTrainingSetManifest (src/export/trainingSet.js:4-90) -> createTrainingSetZipEntries (src/export/trainingSet.js:92-140) -> exportTrainingSet (src/server/api.js:1545-*)
  - validation: `node --test tests/exporter.test.js tests/trainingSet.test.js tests/serverApi.test.js`

### discarded
- indexed-mask export
  - reason: current product direction stores one binary mask PNG per class; indexed masks remain future hardening.

## Validation Plan
- RED/GREEN targeted tests:
  - `node --test tests/exporter.test.js tests/trainingSet.test.js tests/serverApi.test.js`
- Full harness:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`

## Progress Notes
- Starting from class-aware mask save/load commit `d0d4b32`.
- `annotations.json` now flattens `image.annotations[]` into one row per class annotation and keeps the legacy single-mask shape when no annotation records exist.
- Export validation now treats annotation-level `mask_path` values as valid mask sources so class-aware records do not depend on legacy `current_mask_path`.
- Training-set manifests now create one trainable item per class annotation, copy label schema metadata into the manifest, and keep split files as image/mask pairs.
- Server project ZIP export now writes original images once and reads each class annotation's source mask path for mask ZIP entries.

## Findings
- Legacy export compatibility depends on keeping `current_mask_path` readable as the fallback source mask path.
- Training-set image entries may duplicate the same original image for separate class annotations so each split row remains a simple image/mask pair.

## Closeout
- Validated line ranges refreshed for export and training-set symbols.
- Feature status and architecture docs updated.
- Code review found and fixed an exportability gap where annotation-only mask paths were not counted as mask sources.
