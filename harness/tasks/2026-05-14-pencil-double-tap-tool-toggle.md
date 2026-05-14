# Task: pencil-double-tap-tool-toggle

## Goal

- Let iPad/stylus users toggle between brush and eraser without moving to the
  tool panel.

## Scope

- Canvas pointer handling in `src/editor/maskEditor.js`
- Workbench tool button synchronization in `src/app.js`
- Mask editor tests
- User manual iPad controls

## Non-goals

- Native iOS Apple Pencil hardware double-tap integration.
- Custom gesture settings UI.
- Real-time device-specific feature detection panel.

## Risks

- A quick tap intended as a dot brush mark could be interpreted as a gesture.
- Double-tap fallback must not conflict with two-finger pan/pinch.
- Tool UI must stay in sync when the editor changes tool internally.

## Impact Chains

### suspected

- MaskEditor.bindCanvasEvents (src/editor/maskEditor.js) -> MaskEditor.shouldToggleToolFromTap (src/editor/maskEditor.js) -> MaskEditor.toggleBrushEraseTool (src/editor/maskEditor.js)
- MaskEditor.setTool (src/editor/maskEditor.js) -> onToolChange (src/app.js) -> updateToolButtons (src/app.js)

### validated

- MaskEditor.bindCanvasEvents (src/editor/maskEditor.js) -> MaskEditor.shouldToggleToolFromTap (src/editor/maskEditor.js) -> MaskEditor.toggleBrushEraseTool (src/editor/maskEditor.js)
  - validation: `node --test tests/maskEditor.test.js`
- MaskEditor.setTool (src/editor/maskEditor.js) -> onToolChange (src/app.js) -> updateToolButtons (src/app.js)
  - validation: `node --check src/app.js`; direct code review

### discarded

- Native Apple Pencil double-tap event.
  - reason: Safari/web PointerEvent does not provide a stable standard event
    for the hardware double-tap gesture, so the app implements a canvas-level
    double-tap fallback.

## Validation Plan

- `node --test tests/maskEditor.test.js`
- `node --check src/editor/maskEditor.js`
- `node --check src/app.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes

- Added RED test for pen double-tap toggling brush/eraser without painting.
- Implemented tap tracking for pen/touch input with a small time and distance
  window.
- Pen eraser/barrel-button events bypass deferred paint so the existing
  temporary eraser behavior remains immediate.

## Closeout

- Canvas-level pen/touch quick double tap now toggles `brush <-> erase` without
  painting mask pixels.
- Tool segmented buttons stay synchronized through `onToolChange`.
- Pen eraser/barrel-button signals still erase immediately and do not rely on
  the double-tap fallback.
- Validation passed:
  - `node --test tests/maskEditor.test.js`
  - `node --check src/editor/maskEditor.js`
  - `node --check src/app.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: this is an app-level
  canvas double-tap fallback, not a native Apple Pencil hardware double-tap
  event. Very short pen/touch taps are treated as gesture candidates; normal
  brush/erase work should use drag strokes.
