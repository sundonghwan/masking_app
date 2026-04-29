# Task: magic-click-tool

## Goal

- Add a deterministic local magic-click mask assist that fills a connected image
  region from the clicked pixel.

## Scope

- Add a `magic` editor tool.
- Implement connected-region selection from source image pixels.
- Apply selected region to the binary mask and make it undoable.
- Add focused tests for deterministic region behavior.
- Update feature status and checkpoint docs.

## Non-goals

- AI/model-backed segmentation.
- Server inference.
- Multi-class masks.
- Global threshold fill.

## Touched Areas

- `index.html`
- `src/editor/maskEditor.js`
- `src/app.js`
- `tests/maskEditor.test.js`
- `tests/appContracts.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`

## Risks

- Fill must be local connected-region, not global color replacement.
- Fill must be capped to avoid runaway work.
- Fill must write binary mask pixels and be undoable.
- Magic click should not run on pointer drag like brush strokes.

## Impact Chains

### suspected

- None remaining.

### validated

- `MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:444-463)` -> `magicSelectAt (src/editor/maskEditor.js:327-344)` -> `selectConnectedRegionFromImageData (src/editor/maskEditor.js:40-75)` -> mask bitmap
  - validation: `npm test -- tests/maskEditor.test.js tests/appContracts.test.js` passed.
  - validation: `./scripts/harness/test-target.sh` passed.
  - validation: browser-served `index.html`, `src/app.js`, and `src/editor/maskEditor.js` contain the `magic` tool, shortcut, and local editor implementation.

### discarded

- AI-backed segmentation endpoint.
  - reason: future hardening only; current batch is deterministic local assist.

## Validation Plan

- `npm test -- tests/maskEditor.test.js tests/appContracts.test.js`
- `npm run lint`
- `git diff --check`
- Full harness wrapper scripts before closeout.

## Progress Notes

- Added the `매직` tool button and `m` shortcut.
- Added deterministic 4-neighbor connected-region selection from the source
  image canvas with a max-pixel cap.
- Magic clicks write binary white mask pixels and become a single undoable
  editor operation.
- Review adjustment: replaced `queue.shift()` with a head index and drops the
  undo snapshot when a magic click makes no mask change.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [ ] Commit and push completed.
