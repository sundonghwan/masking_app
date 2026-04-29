# Task: zoom-pan-controls

## Goal

- Add reliable camera/pan movement for zoomed images without mutating mask
  pixels or undo history.

## Scope

- Add keyboard arrow pan support in the workbench.
- Add a pure pan-key helper for tests.
- Keep existing pan tool drag behavior.
- Update feature status and checkpoint docs.

## Non-goals

- Inertial panning.
- Touch gesture redesign.
- Per-image viewport persistence.
- Minimap.

## Touched Areas

- `src/editor/maskEditor.js`
- `src/app.js`
- `tests/maskEditor.test.js`
- `tests/appContracts.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`

## Risks

- Pan must not call `onChange`.
- Pan must not push undo history.
- Keyboard pan must not fire while typing in inputs.
- Existing brush/erase shortcuts must keep working.

## Impact Chains

### suspected

- `handleShortcut (src/app.js:1537-1570)` -> `panDeltaForKey (src/editor/maskEditor.js:31-38)` -> `MaskEditor.panBy (src/editor/maskEditor.js:276-281)`
- `MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:381-430)` -> panning branch -> viewport state

### validated

- `handleShortcut (src/app.js:1537-1570)` -> `panDeltaForKey (src/editor/maskEditor.js:31-38)` -> `MaskEditor.panBy (src/editor/maskEditor.js:276-281)`
  - validation: `npm test -- tests/maskEditor.test.js tests/appContracts.test.js` passed; helper test verifies arrow deltas and app contract verifies `editor.panBy` wiring.
- `MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:381-430)` -> panning branch -> viewport state
  - validation: existing pan branch does not call `onChange`; full test suite passed.

### discarded

- Per-image viewport persistence.
  - reason: current checkpoint only requires camera movement while zoomed; reset
    behavior is already defined by image load/fit.

## Validation Plan

- `npm test -- tests/maskEditor.test.js tests/appContracts.test.js`
- `npm run lint`
- `git diff --check`
- Full harness wrapper scripts before closeout.

## Progress Notes

- Added `panDeltaForKey` helper for arrow-key camera movement.
- Workbench shortcuts now pan viewport with arrow keys and use a larger step
  with Shift+Arrow.
- Existing pan tool drag behavior remains unchanged.
- Viewport reset rule remains fit-on-load when switching/loading images.
- Implementation review found no blocking issue: keyboard shortcuts retain the
  existing input guard, `panBy` does not call `onChange`, and panning does not
  touch undo history.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [ ] Commit and push completed.
