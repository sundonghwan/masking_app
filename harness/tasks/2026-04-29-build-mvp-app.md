# Task: build-mvp-app

## Goal

- Build the first runnable Masking App MVP.
- Provide a browser-based workbench for uploading images, painting binary masks,
  erasing masks, undo/redo, saving/downloading mask PNG, and exporting metadata.

## Scope

- Static web app scaffold.
- Main editor UI matching `DESIGN.md` and `docs/design/screens-v2/`.
- Canvas mask editing engine.
- Export/metadata helpers.
- Harness command updates if needed.
- Local smoke validation.

## Non-goals

- Real backend server.
- Database persistence.
- Multi-user auth/roles.
- AI-assisted segmentation.
- COCO/RLE export.

## Touched Areas

- `index.html`
- `src/`
- `scripts/harness/`
- `harness/`

## Risks

- Canvas coordinates can diverge from image coordinates.
- Overlay rendering can leak into saved mask data.
- Undo/redo can capture viewport operations instead of mask edits.
- Export metadata can mismatch image/mask filenames.
- UI can drift from the unified design reference.

## Impact Chains

### suspected

- AppController (src/app.js:1-1) -> MaskEditor (src/editor/maskEditor.js:1-1) -> exportMaskPng (src/editor/maskEditor.js:1-1)
- AppController (src/app.js:1-1) -> buildAnnotations (src/export/exporter.js:1-1) -> downloadJson (src/export/exporter.js:1-1)
- uploadImages (src/app.js:1-1) -> loadImageRecord (src/app.js:1-1) -> MaskEditor.loadImage (src/editor/maskEditor.js:1-1)

### validated

- AppController (src/app.js:1-330) -> MaskEditor (src/editor/maskEditor.js:1-513) -> exportMaskPngBlob (src/editor/maskEditor.js:119-122)
- AppController (src/app.js:1-330) -> createAnnotationsJson/buildAnnotations (src/export/exporter.js:149-181)
- createValidationSummary (src/export/exporter.js:74-104) -> createExportSummaryJson (src/export/exporter.js:183-214)

### discarded

- backend save API chain
  - reason: MVP implementation is static/local-first in this slice.

## Validation Plan

- `scripts/harness/smoke-web.sh` -> project references and runnable app files exist.
- browser smoke via local server -> app loads, upload UI appears, editor controls exist.
- targeted manual/browser checks -> image upload, brush, erase, undo/redo, mask download,
  metadata download.

## Validation Results

- `npm test` -> passed, 10 tests.
- `npm run lint` -> passed.
- `scripts/harness/lint-all.sh` -> passed.
- `scripts/harness/typecheck-all.sh` -> passed.
- `scripts/harness/test-target.sh` -> passed, 10 tests.
- `scripts/harness/smoke-web.sh` -> passed.
- Browser smoke at `http://localhost:4173` -> app shell loads with topbar,
  upload queue, canvas stage, tool inspector, and statusbar.

## Progress Notes

- Subagents are assigned disjoint ownership:
  - Worker A: `src/editor/maskEditor.js`
  - Worker B: `src/export/exporter.js`
  - Worker C: `src/styles.css`

## Findings

- Dependency-free static MVP is enough to validate the hardest local UX path
  before backend selection.
- Canvas display size must be synchronized with the CSS stage size to keep
  image-coordinate brush math reliable.

## File-back Candidates

- Update `harness/playbooks/frontend.md` with confirmed editor module flow after
  implementation.
- Update `harness/commands.md` if a concrete app run command is added.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
