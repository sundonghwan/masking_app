# Task: multi-class-mask-annotation-planning

## Goal

- Capture the product and system plan for changing model/editor output to
  `class_id + mask image` with multiple class-labeled masks per image.

## Scope

- Design the data contract for project label schemas and image annotations.
- Define editor label-selection behavior.
- Define AI segmentation output contract.
- Define export/training-set metadata direction.
- Produce an implementation plan for the next coding batch.

## Non-goals

- Implement class-aware editing in code during this planning task.
- Add a real AI segmentation model adapter.
- Convert editor source of truth to indexed masks.
- Add polygon export.

## Risks

- Replacing the binary mask contract too broadly can break current export.
- Indexed-mask source of truth would force a large editor rewrite.
- AI predictions must not become approved training data without human review.

## Impact Chains

### suspected

- `label_schema (project manifest) -> selected label (src/app.js) -> MaskEditor binary mask -> image.annotations[]`
- `image.annotations[] -> createAnnotationsJson (src/export/exporter.js) -> createTrainingSetManifest (src/export/trainingSet.js)`
- `createAiServingResponse (src/server/aiServing.js) -> predictions[].class_id + predictions[].mask_data_url -> draft annotation import`

### validated

- `PROJECT.md multi-class extension notes -> docs/superpowers/specs/2026-05-13-multi-class-mask-annotation-design.md -> docs/superpowers/plans/2026-05-13-multi-class-mask-annotation-plan.md`
  - validation: local document inspection and `scripts/harness/smoke-web.sh`
- `docs/ARCHITECTURE.md mask contract -> planned multi-class annotation contract`
  - validation: `rg` inspection and `git diff --check`

### discarded

- Polygon source-of-truth annotation.
  - reason: user explicitly wants masks to avoid polygon holes/empty-region issues.
- Indexed mask as the first editor source of truth.
  - reason: too disruptive to current binary mask editor; keep indexed export as a later derived format.

## Validation Plan

- `scripts/harness/smoke-web.sh`
- `git diff --check`
- inspect design/plan/status/architecture files for the required terms:
  - `class_id`
  - `mask_data_url`
  - `annotations[]`
  - `label_schema`

## Progress Notes

- User confirmed B안: one image can contain multiple class-labeled masks.
- User clarified the motivation: polygon segmentation can include unwanted empty
  areas or lose holes, so mask images should be the primary output.
- Design saved to `docs/superpowers/specs/2026-05-13-multi-class-mask-annotation-design.md`.
- Implementation plan saved to `docs/superpowers/plans/2026-05-13-multi-class-mask-annotation-plan.md`.

## Closeout

- Completion audit:
  - B안, one image with many class-labeled masks: covered in design and plan.
  - Polygon hole/empty-region motivation: covered in design and architecture.
  - Tool label selection: covered in design UX and plan Task 4.
  - Model output `class_id + mask image`: covered in AI serving contract and plan Task 8.
  - Export/training-set class metadata: covered in design export contract and plan Task 7.
  - Existing binary-mask compatibility: covered in migration strategy and architecture.
- Validation passed:
  - `rg` inspection for `class_id`, `mask_data_url`, `annotations[]`, `label_schema`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- No implementation code was changed in this task; the implementation handoff is
  `docs/superpowers/plans/2026-05-13-multi-class-mask-annotation-plan.md`.
