# Task: iPad canvas gestures

## Goal
- Make zoomed canvas movement and zoom usable on iPad while preserving desktop
  mouse/keyboard controls.
- Support stylus eraser/barrel-button events when the browser exposes them.

## Scope
- Canvas pointer interaction inside `src/editor/maskEditor.js`.
- Mask editor tests.
- User manual touch/stylus controls.

## Non-goals
- Native iOS Apple Pencil double-tap integration outside browser APIs.
- Replacing desktop wheel, Space, arrow, or toolbar controls.

## Risks
- Two-finger gestures accidentally painting mask pixels.
- Stylus eraser signals differ by browser/device.
- Existing Space pan and brush stroke behavior may regress.

## Impact Chains
### suspected
- MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:596-665) -> MaskEditor.paintAt (src/editor/maskEditor.js:763-776) -> onChange callback
- MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:596-665) -> MaskEditor.zoomBy (src/editor/maskEditor.js:260-273) -> onViewportChange callback

### validated
- MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:596-665) -> touch gesture state -> onViewportChange callback
  - validation: `node --test tests/maskEditor.test.js`
- stylusRequestsEraser (src/editor/maskEditor.js) -> MaskEditor.paintAt (src/editor/maskEditor.js) -> selected tool remains brush
  - validation: `node --test tests/maskEditor.test.js`

### discarded
- Native Apple Pencil double-tap event.
  - reason: iPad Safari does not expose a stable web event for hardware
    double-tap across devices; fallback to standard PointerEvent pen
    button/buttons signals.

## Validation Plan
- `node --test tests/maskEditor.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `git diff --check`

## Progress Notes
- Added two-finger touch gesture state in `MaskEditor`.
- Touch brush start is deferred until movement so a second finger can enter a
  pinch/pan gesture without leaving an accidental dot.
- Added standard PointerEvent pen eraser/barrel-button support when exposed by
  the browser.
- Updated user manual with iPad and Apple Pencil controls.

## Closeout
- `node --test tests/maskEditor.test.js` passed with 18 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 349 tests.
- `git diff --check` passed.
- Remaining risk: Apple Pencil hardware double-tap is not reliably exposed to
  browser JavaScript; supported pen button/buttons signals are handled when
  Safari/device provides them.
