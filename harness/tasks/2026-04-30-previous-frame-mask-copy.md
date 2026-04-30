# Task: previous-frame-mask-copy

## Goal

- Add previous-frame mask copy and mask-position adjustment for sequential
  annotation work.

## Scope

- Copy the previous active image's mask into the currently selected image.
- Add a mask move tool so copied masks can be dragged into alignment.
- Keep undo/redo, local persistence, and save/submit sync contracts intact.
- Add focused editor/app contract tests and update status docs.

## Non-goals

- Optical flow, feature matching, or AI tracking.
- Automatic resize across different image dimensions.
- Copying masks across projects/tasks/versions.

## Risks

- Mask bitmap changes can bypass undo history.
- Copying into submitted/approved records can corrupt review/export state.
- Camera pan and mask move can conflict if pointer modes are not separated.
- Dimension mismatches can produce invalid mask exports.

## Impact Chains

### suspected

- `copyMaskFromPreviousImage (src/app.js:*) -> projectStore.loadMaskBlob (src/storage/projectStore.js:*) -> MaskEditor.loadMaskFromDataUrl (src/editor/maskEditor.js:*) -> handleEditorChange (src/app.js:*)`
- `MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:*) -> beginMaskMove/updateMaskMove/endPointer (src/editor/maskEditor.js:*) -> undo/redo history`
- `handleShortcut (src/app.js:*) -> copyMaskFromPreviousImage/setTool("mask_move") (src/app.js:*) -> MaskEditor`

### validated

- `copyMaskFromPreviousImage (src/app.js:1136-1170) -> maskDataUrlForImage (src/app.js:3170-3178) -> MaskEditor.replaceMaskFromDataUrl (src/editor/maskEditor.js:378-390) -> handleEditorChange (src/app.js:*)`
  - validation: `node --test tests/maskEditor.test.js tests/appContracts.test.js`
  - validation: `scripts/harness/test-target.sh`
- `MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:579-654) -> MaskEditor.beginMaskMove (src/editor/maskEditor.js:683-691) -> MaskEditor.updateMaskMove (src/editor/maskEditor.js:693-702) -> MaskEditor.endPointer (src/editor/maskEditor.js:704-735)`
  - validation: `node --test tests/maskEditor.test.js tests/appContracts.test.js`
  - validation: `scripts/harness/test-target.sh`
- `handleShortcut (src/app.js:2828-2879) -> copyMaskFromPreviousImage (src/app.js:1136-1170) -> setTool("mask_move") (src/app.js:1164)`
  - validation: `node --test tests/maskEditor.test.js tests/appContracts.test.js`

### discarded

- Optical-flow or feature-matching mask propagation.
  - reason: user asked for simple previous-frame copy plus manual adjustment first.
- Automatic resize/scale when previous and current image dimensions differ.
  - reason: dimension mismatch can corrupt mask/export contracts; current feature rejects it explicitly.
- Cross-project/task/version mask copy.
  - reason: current workflow only targets adjacent active images in the selected workbench context.

## Validation Plan

- RED/GREEN: `node --test tests/maskEditor.test.js tests/appContracts.test.js`
- Full: `scripts/harness/lint-all.sh`
- Full: `scripts/harness/typecheck-all.sh`
- Full: `scripts/harness/test-target.sh`
- Smoke: `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes

- 2026-04-30: User requested implementation of simple previous-frame copy plus
  position adjustment.
- Added `mask_move` as a dedicated tool so camera pan and mask translation stay
  separate.
- Code review found a mask-active detection risk: normalized inactive pixels can
  keep white RGB with alpha 0. Active checks now use alpha only.

## Findings

- Previous-frame copy should only load same-size masks. Different-size propagation
  needs an explicit resize/registration design before implementation.
- Submitted or approved images require user confirmation before replacement so
  the existing revision flow remains visible.

## Closeout

- Validated line ranges refreshed for the main app/editor chains.
- Review checklist performed. No blocking issue remains after the alpha-only mask
  active check and render-side-effect cleanup.
- Validation passed:
  - `node --test tests/maskEditor.test.js tests/appContracts.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
  - live smoke: `/api/health`, admin login, `/`
