# Right Click Camera Pan Design

## Goal

Make zoomed masking faster by allowing mouse right-click drag to move the
camera, alongside the existing Spacebar temporary pan workflow.

## Chosen Behavior

- Mouse right button down on the canvas starts temporary camera pan.
- Mouse right button drag pans the viewport using the same `movementX` and
  `movementY` path as Spacebar pan.
- Mouse right button up ends the temporary pan.
- The selected tool remains unchanged.
- No mask pixels are painted or erased.
- No undo snapshot is recorded.
- Canvas `contextmenu` is prevented so the browser menu does not interrupt the
  pan interaction.

## Boundaries

- The override applies only to mouse right-click on the canvas.
- Pen side buttons keep the existing eraser behavior because the app already
  uses pen buttons for temporary erase.
- Touch gestures remain unchanged.
- Global page context menus outside the canvas are not changed.

## Validation

- Add a focused editor test proving right-click drag changes viewport offset,
  does not change mask ratio, does not call `onChange`, and does not create undo
  history.
- Add a focused editor test proving the canvas context menu event is prevented.
