# Task: mask-editor-engine

## Goal

- Implement a dependency-free browser mask editing engine for canvas image rendering, binary mask editing, overlay display, undo/redo, viewport transforms, and grayscale PNG export.

## Scope

- `src/editor/maskEditor.js`
- `tests/maskEditor.test.js` if useful for isolated engine validation.

## Non-goals

- Do not wire the editor into `index.html`, `src/app.js`, or application styles.
- Do not implement autosave, backend API calls, upload, submit, export ZIP, or UI controls.
- Do not edit `scripts/harness`.

## Touched Areas

- Canvas viewport coordinate mapping.
- Binary mask raster updates.
- Stroke-level undo/redo.
- Mask PNG serialization.

## Risks

- Image, mask, and viewport dimensions can drift if initialization is not strict.
- Overlay styling could leak into saved mask data if presentation and source bitmap are coupled.
- Undo/redo can accidentally capture pan/zoom changes if history ownership is unclear.
- Browser APIs such as `HTMLCanvasElement.toBlob` are async and can fail.

## Impact Chains

### suspected

- None remaining.

### validated

- `createMaskEditor (src/editor/maskEditor.js:19-20) -> loadImage (src/editor/maskEditor.js:72-107) -> mask canvas initialization (src/editor/maskEditor.js:79-99)`
  - validation: `node --check src/editor/maskEditor.js`; `node --test tests/maskEditor.test.js`
- `beginStroke (src/editor/maskEditor.js:146-170) -> addStrokePoint (src/editor/maskEditor.js:173-182) -> applyBrushStamp (src/editor/maskEditor.js:432-459)`
  - validation: direct code review; module syntax check
- `undo (src/editor/maskEditor.js:214-228) -> restoreMaskSnapshot (src/editor/maskEditor.js:426-430) -> render (src/editor/maskEditor.js:344-365)`
  - validation: direct code review; module syntax check
- `exportMaskBlob (src/editor/maskEditor.js:367-374) -> createGrayscaleExportCanvas (src/editor/maskEditor.js:376-393)`
  - validation: direct code review; module syntax check

### discarded

- None yet.

## Validation Plan

- `scripts/harness/test-target.sh maskEditor` -> run targeted tests if a JS test runner exists.
- `scripts/harness/lint-all.sh` -> check lint if a lint target exists.
- `scripts/harness/typecheck-all.sh` -> check type contracts if a typecheck target exists.
- Direct code review against `harness/checklists/review.md` -> required closeout check when no app stack exists.

## Progress Notes

- Repository currently has planning docs and harness files, but no existing `src/`, `tests/`, `package.json`, or app stack.
- Added `src/editor/maskEditor.js` as a browser ES module with no third-party dependency.
- Added `tests/maskEditor.test.js` using built-in `node:test` for import/API shape and binary mask normalization.
- Harness wrappers currently have no package-backed lint/typecheck/test target, so direct Node checks were used for this module.

## Findings

- The engine must remain separate from UI shell wiring because this worker owns only the editor module and optional tests.
- Binary source-of-truth is stored as an offscreen white-alpha mask; overlay color is generated into a separate offscreen presentation canvas; PNG export writes opaque grayscale `0`/`255` pixels.

## File-back Candidates

- None yet.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
