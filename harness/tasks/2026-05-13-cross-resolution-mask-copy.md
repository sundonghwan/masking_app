# Task: cross-resolution mask copy

## Goal
- Allow previous-frame mask copy even when source and target image dimensions differ.
- Resize the copied mask to the currently loaded image dimensions before editing or saving.

## Scope
- Workbench previous-mask copy guard.
- Mask editor mask-data-url replacement behavior.
- Focused unit/contract tests and user manual note.

## Non-goals
- Change server save validation: saved masks must still match the target image dimensions.
- Add a full transform UI beyond the existing mask move adjustment tool.
- Resample masks during training/export independently of editor copy.

## Risks
- Resizing binary masks can soften edges if the browser interpolation path is used.
- Copying between very different aspect ratios may need manual mask move correction.
- Canvas mask serialization and undo history are high-risk editor paths.

## Impact Chains
### suspected
- copyMaskFromPreviousImage (src/app.js:1161-1192) -> maskDataUrlForImage (src/app.js:3565-3574) -> MaskEditor.replaceMaskFromDataUrl (src/editor/maskEditor.js:387-400) -> handleEditorChange (src/app.js:1013-1027)
- MaskEditor.replaceMaskFromDataUrl (src/editor/maskEditor.js:387-400) -> MaskEditor.replaceMaskFromImageData (src/editor/maskEditor.js:371-385) -> syncMaskToBackend (src/app.js:1511-1580)

### validated
- copyMaskFromPreviousImage (src/app.js:1161-1193) -> maskDataUrlForImage (src/app.js:3565-3574) -> MaskEditor.replaceMaskFromDataUrl (src/editor/maskEditor.js:388-398) -> handleEditorChange (src/app.js:1013-1027)
  - validation: `node --test tests/maskEditor.test.js tests/appContracts.test.js`, `scripts/harness/test-target.sh`
- MaskEditor.replaceMaskFromDataUrl (src/editor/maskEditor.js:388-398) -> MaskEditor.replaceMaskFromImageData (src/editor/maskEditor.js:371-385) -> syncMaskToBackend (src/app.js:1511-1580)
  - validation: focused RED/GREEN test `loading a copied mask data URL resizes to the current image dimensions`

### discarded
- None yet.

## Validation Plan
- RED/GREEN: focused `tests/maskEditor.test.js` for different-size data URL mask replacement.
- Contract check: `tests/appContracts.test.js` should assert previous copy no longer blocks on resolution mismatch.
- Regression: `scripts/harness/test-target.sh`.
- Static checks: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`, `git diff --check`.

## Design
- Remove the app-level same-resolution blocker in previous-frame copy.
- Let `replaceMaskFromDataUrl` draw the source mask into a target-sized temporary canvas.
- Disable smoothing while drawing copied mask data so binary mask edges stay deterministic enough for later normalization.
- Keep `replaceMaskFromImageData` strict for direct `ImageData` replacement because callers using raw pixels should already provide target-sized buffers.

## Closeout
- Removed previous-copy same-resolution blocker in `src/app.js`.
- `MaskEditor.replaceMaskFromDataUrl` now draws the source mask into a
  target-sized temporary canvas with smoothing disabled before normalizing mask
  pixels.
- Direct `replaceMaskFromImageData` remains strict because raw pixel callers
  should pass target-sized buffers.
- Updated user manual and feature status.
- RED passed: different-size copied mask data URL failed with
  `Mask dimensions must match current image`.
- Focused tests passed: `node --test tests/maskEditor.test.js tests/appContracts.test.js`.
- Full regression passed: `scripts/harness/test-target.sh`, 330 tests.
- Static checks passed: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`.
- `git diff --check` passed.
- Code review: no blocking issue found. Saved masks still go through existing
  target-dimension server validation; this change only resizes imported copied
  masks before edit/save.
