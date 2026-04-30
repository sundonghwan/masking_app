# Spacebar Camera Pan Design

## Audience

Maintainers and coding agents improving editor navigation, keyboard workflow,
canvas pointer behavior, or tool state in Masking App.

## Objective

Redesign Spacebar movement so it behaves like a camera/hand tool while held,
instead of feeling like an unreliable tool switch. The user should be able to
paint with brush/erase/magic, hold Spacebar, drag the canvas to move the camera,
release Spacebar, and immediately continue with the previous tool.

## Problem

Current behavior is intended to be temporary pan, but user feedback says the
switching does not feel reliable. The likely causes are:

- Spacebar behavior is implemented as a temporary state but is not visible
  enough in the UI.
- Pointer behavior depends on whether the editor has already entered a pointer
  stroke.
- Keydown/keyup edge cases can make the user feel like tool state changed or
  got stuck.
- The movement model is still conceptually tied to the `pan` tool button,
  instead of a clear camera mode that overrides brush/erase/magic while held.

## Decision

Implement Spacebar as a **hold-to-camera-pan override**.

```text
normal tool = brush | erase | magic | view
Space down  = camera pan override active
drag canvas = move viewport only
Space up    = return to normal tool
```

Spacebar must not permanently select the `pan` tool.

## Interaction Model

### Basic Flow

```text
1. User is using Brush.
2. User holds Spacebar.
3. Cursor changes to camera/hand move state.
4. User drags canvas.
5. Viewport offset changes.
6. Mask bitmap does not change.
7. Undo stack does not change.
8. User releases Spacebar.
9. Brush remains active.
```

The same must work for Erase, Magic, and View.

### Pointer Rules

- If Spacebar is held before pointerdown, pointerdown starts camera pan.
- While camera pan is active, pointermove updates viewport offsets.
- While camera pan is active, no brush stroke, erase stroke, or magic selection
  may start.
- If a brush/erase stroke is already in progress, pressing Spacebar should not
  convert that active stroke into pan. The override begins on the next
  pointerdown.
- Pointerup ends only the current pan gesture, not the Spacebar hold state.
- Spaceup ends the camera pan override.

### Keyboard Rules

- `Space` keydown:
  - prevent browser page scroll
  - set `spacePanHeld=true`
  - do not call `setTool("pan")`
  - do not change selected tool button
- `Space` keyup:
  - set `spacePanHeld=false`
  - clear active camera cursor state if no pointer is down
- `blur` or `visibilitychange`:
  - clear `spacePanHeld=false`
  - clear active camera pan gesture

### Visual Feedback

Show held camera mode without changing selected tool:

- canvas cursor changes to grab/grabbing while Spacebar is held
- statusbar shows `이동 모드 Space`
- existing tool segment remains on the original selected tool
- optional: `이동 Space` button can show a temporary pressed style, but it must
  not become the selected tool

## State Model

Recommended editor state names:

```js
{
  tool: "brush",
  spacePanHeld: false,
  activePointerMode: "idle" | "paint" | "erase" | "magic" | "camera_pan",
  isPointerDown: false,
  isPanning: false
}
```

Do not rely only on `tool === "pan"` to decide camera movement. Camera pan is an
override state.

## Implementation Shape

### `src/app.js`

Responsibilities:

- track global Spacebar hold lifecycle
- ignore keydown shortcuts while typing in inputs, except keyup should always
  clear stuck Spacebar state
- call editor camera override methods
- update statusbar text

Suggested methods:

```js
function activateSpacePan()
function deactivateSpacePan()
function handleShortcut(event)
function handleShortcutRelease(event)
```

### `src/editor/maskEditor.js`

Responsibilities:

- expose explicit camera override methods
- decide pointer mode at pointerdown
- keep mask bitmap and undo stack untouched during camera pan
- draw cursor feedback for camera pan

Suggested methods:

```js
setCameraPanOverride(active)
isCameraPanActive()
beginCameraPan(point)
updateCameraPan(event)
endCameraPan()
```

Pointerdown decision:

```js
if (cameraPanOverride || tool === "pan") {
  activePointerMode = "camera_pan";
  beginCameraPan(event);
  return;
}
```

## Tests

Add focused tests before implementation.

Unit/static contract tests:

- Spacebar keydown calls camera pan override.
- Spacebar keydown does not call `setTool("pan")`.
- Spacebar keyup and window blur clear the override.
- Camera pan pointer path calls viewport update only.
- Camera pan does not call `onChange`.
- Camera pan does not push undo history.
- Brush remains selected after Spacebar pan.

Manual smoke:

- select Brush
- hold Spacebar
- drag canvas
- release Spacebar
- verify Brush is still active
- verify mask area did not change
- repeat with Erase and Magic

## Non-goals

- Do not remove the permanent Pan tool button in this change.
- Do not add multi-touch gestures.
- Do not redesign all shortcuts.
- Do not implement visual regression tooling just for this fix.

## Risks

- If Spacebar keyup is missed, camera mode can get stuck. Clear on `blur` and
  `visibilitychange`.
- If a stroke is already active, switching to pan mid-stroke can corrupt undo
  semantics. Start camera pan only on pointerdown.
- If the UI marks Pan as selected while Spacebar is held, users may think their
  previous tool was lost. Keep selected tool unchanged.

## Acceptance Criteria

- Holding Spacebar and dragging moves the viewport.
- Releasing Spacebar restores the previous tool without a visible tool switch.
- Brush/erase/magic do not mutate the mask while camera pan is active.
- Camera pan does not create undo history.
- Browser page scroll is prevented while using Spacebar in the workbench.
- Spacebar stuck state is cleared on keyup, blur, and visibility change.
