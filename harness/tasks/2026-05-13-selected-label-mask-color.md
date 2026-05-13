# Task: selected-label-mask-color

## Goal
- Make the visible brush/mask overlay color follow the selected class label color.

## Scope
- Workbench label color state in `src/app.js`
- Canvas overlay presentation in `src/editor/maskEditor.js`
- Brush panel mask color swatch in `index.html`
- Focused frontend/editor tests and feature status notes

## Non-goals
- Class-aware mask save/load storage
- Per-class independent mask switching
- Changing saved mask PNG from binary grayscale

## Risks
- The editor source mask must remain binary grayscale; label color is display-only.
- Label switching must not mutate mask pixels or undo history.
- Legacy/default project label schemas must still fall back safely.

## Impact Chains

### suspected
- renderLabelSelector (src/app.js:2594-2612) -> selected label state -> MaskEditor.drawMaskOverlay (src/editor/maskEditor.js:553-570)
- selectClassLabel (src/app.js:2682-2695) -> persistProject (src/app.js) -> renderLabelSelector (src/app.js:2594-2612)
- MaskEditor.constructor (src/editor/maskEditor.js:128-169) -> MaskEditor.drawMaskOverlay (src/editor/maskEditor.js:553-570) -> canvas overlay pixels

### validated
- renderLabelSelector (src/app.js:2596-2611) -> applySelectedLabelColor (src/app.js:2712-2719) -> MaskEditor.setOverlayColor (src/editor/maskEditor.js:223-227) -> MaskEditor.drawMaskOverlay (src/editor/maskEditor.js:562-575)
  - validation: `node --test tests/maskEditor.test.js tests/appContracts.test.js`
- MaskEditor.constructor (src/editor/maskEditor.js:132-173) -> MaskEditor.setOverlayColor (src/editor/maskEditor.js:223-227) -> MaskEditor.getState (src/editor/maskEditor.js:352-365)
  - validation: `node --test tests/maskEditor.test.js tests/appContracts.test.js`

### discarded
- saved mask export color path
  - reason: saved mask PNG must remain binary grayscale; only overlay presentation changes.

## Validation Plan
- RED/GREEN: `node --test tests/maskEditor.test.js tests/appContracts.test.js`
- Full harness: `scripts/harness/lint-all.sh`
- Full harness: `scripts/harness/typecheck-all.sh`
- Full harness: `scripts/harness/test-target.sh`
- Smoke: `scripts/harness/smoke-web.sh`
- Diff hygiene: `git diff --check`

## Progress Notes
- Root cause: label schema UI persists label colors, but `MaskEditor` uses a fixed `MASK_COLOR` RGB constant while the brush panel swatch has no app-controlled element id.
- Added failing tests first for editor overlay color state and app-level label color wiring.
- Replaced the fixed overlay RGB constant with editor-owned display color state.
- Wired selected label color into the editor overlay and visible brush-panel swatch.

## Closeout
- TDD RED observed for missing `maskColorSwatch`, missing app color wiring, and missing editor overlay color state.
- Validation passed:
  - `node --test tests/maskEditor.test.js tests/appContracts.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
  - live HTTP health/static smoke on `http://127.0.0.1:4173`
- Code review:
  - No blocking issue found.
  - Confirmed saved mask export path remains binary grayscale.
  - Confirmed label color changes do not push undo history or mutate mask pixels.
- Remaining risk:
  - This is display-color wiring only. Per-class independent mask save/load remains the next multi-class slice.
