# Task: edge-aware-magic-tool-and-space-pan

## Goal

- Upgrade the magic tool from simple connected color fill to a local
  edge-aware selection assist, and make temporary canvas movement use Spacebar.

## Scope

- Add Canny-lite/Sobel-style local edge barrier logic for magic selection.
- Use 8-neighbor region growth so selection expands more naturally.
- Add light binary post-processing to reduce jagged one-pixel gaps.
- Preserve binary mask output and one-step undo.
- Add Spacebar hold-to-pan behavior.
- Add `W` as the primary magic shortcut while keeping existing `M`
  compatibility for now.
- Add targeted tests and feature/checkpoint docs.

## Non-goals

- AI/SAM/model-backed segmentation.
- Server inference or new API endpoint.
- Full Canny hysteresis implementation.
- Multi-class mask support.
- Large tool-settings panel.

## Touched Areas

- `src/editor/maskEditor.js`
- `src/app.js`
- `index.html`
- `src/styles.css`
- `tests/maskEditor.test.js`
- `tests/appContracts.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`
- `harness/run_log.md`

## Risks

- Edge-aware selection must not break binary mask contract.
- Region growth must stop at strong image edges and remain capped.
- Spacebar pan must not draw, erase, or pollute undo history.
- Keyboard shortcuts must not fire while typing in inputs.

## Impact Chains

### suspected

- None remaining.

### validated

- `MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:504-523)` -> `magicSelectAt (src/editor/maskEditor.js:387-405)` -> `selectEdgeAwareRegionFromImageData (src/editor/maskEditor.js:67-82)` -> mask bitmap
  - validation: `npm test -- tests/maskEditor.test.js tests/appContracts.test.js` passed; tests cover 8-neighbor expansion and strong-edge stopping.
- `handleShortcut (src/app.js:1539-1585)` -> `editor.setTemporaryPanActive (src/editor/maskEditor.js:382-385)` -> `MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:504-523)` -> viewport offsets
  - validation: app contract test verifies Spacebar enables temporary pan without switching the selected tool.

### discarded

- AI-backed segmentation endpoint.
  - reason: remains future hardening; current task is browser-local vision
    processing.

## Validation Plan

- `npm test -- tests/maskEditor.test.js tests/appContracts.test.js`
- `npm run lint`
- `git diff --check`
- Full harness wrappers before closeout.
- Browser-served static asset check against running dev server.

## Progress Notes

- Replaced default magic selection with local edge-aware selection using
  grayscale blur, Sobel gradient magnitude, edge barrier checks, 8-neighbor
  region growth, and light region smoothing.
- Kept `selectConnectedRegionFromImageData` for the old local connected-fill
  test contract, but `magicSelectAt` now uses `selectEdgeAwareRegionFromImageData`.
- Added Spacebar hold-to-pan by tracking `temporaryPanActive` in the editor.
- Added `W` as the primary magic shortcut and kept `M` compatibility.
- Updated tool labels to show `B`, `E`, `W`, `V`, and `Space`.
- Review fixes applied:
  - Sobel edge map now covers borders with clamped sampling so selection cannot
    escape around image edges.
  - Space keyup always releases temporary pan, regardless of the focused target.
  - Tool segmented control now uses five stable columns for five tools.
- Validation passed: targeted tests, lint, diff check, typecheck wrapper, full
  target test wrapper, smoke wrapper, and browser-served static checks.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [x] Commit and push completed: `1763196 Improve magic tool edge selection`.
