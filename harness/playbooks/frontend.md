# Frontend Playbook

## Audience

Agents changing UI, canvas editing, routes, state, accessibility, or generated
screen implementation.

## Current State

The current MVP is a dependency-free browser app served by `server.js`:

- `index.html`
- `src/app.js`
- `src/api/client.js`
- `src/editor/maskEditor.js`
- `src/export/exporter.js`
- `src/export/zip.js`
- `src/storage/projectStore.js`
- `src/styles.css`
- `tests/*.test.js`

The current frontend policy is local-first:

- IndexedDB stores project snapshots, original image blobs, and mask blobs for
  local recovery.
- Backend sync is attempted for project/image/mask/export, but failed sync must
  not destroy local mask work.
- Server-first restore is a later step before review/admin or multi-user flows.
- Runtime logging rules are in `docs/LOGGING.md`; sync failures should use
  structured events rather than ad hoc `console.warn`.

Frontend decisions must follow:

- `PROJECT.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`
- `DESIGN.md`
- `docs/design/README.md`
- `docs/design/screens-v2/`

## Core Product Screens

Implement screens in this order:

1. Main Mask Editor Workbench
2. Dataset Upload and Ingest Review
3. Export Setup and Result
4. Project Home
5. Review and Validation Detail
6. Operations Dashboard
7. Keyboard Shortcuts and Tool Settings

## Layout Rules

- Use one shared application shell.
- Preserve the same top bar, panel rhythm, status chips, table rows, and button
  treatment across screens.
- Keep editor and review canvas areas visually dominant.
- Keep controls compact and operational.
- Do not introduce landing-page or marketing patterns.

## Editor State Boundaries

When implemented, keep these responsibilities separate:

- Canvas viewport: zoom, pan, fitted scale, image coordinate transform.
- Mask bitmap: editable source of truth for saved PNG.
- Overlay presentation: color and opacity only.
- Brush controller: active tool, size, cursor preview, pointer stroke.
- History manager: stroke-level undo/redo for mask changes only.
- Autosave manager: dirty state, debounce, retry, last save result.

## Required Impact Chains

Use impact chains for changes touching:

- viewport transform
- brush stroke rasterization
- mask bitmap serialization
- undo/redo stack
- autosave/manual save ordering
- shared editor hooks or components
- route/state transitions around selected image

Current confirmed pattern:

```text
AppController (src/app.js) -> MaskEditor (src/editor/maskEditor.js) -> exportMaskPngBlob (src/editor/maskEditor.js)
AppController (src/app.js) -> projectStore (src/storage/projectStore.js) -> MaskEditor.loadImage (src/editor/maskEditor.js)
AppController.exportProject (src/app.js) -> createZipBlob (src/export/zip.js) -> downloadBlob (src/export/exporter.js)
AppController.syncUploadedImage (src/app.js) -> apiClient.uploadImage (src/api/client.js) -> routeProject (src/server/api.js)
AppController.syncMaskToBackend (src/app.js) -> apiClient.saveMask (src/api/client.js) -> routeImage (src/server/api.js)
```

Line ranges should be refreshed in task files when editing the flow.

## Validation

Cheapest useful checks once frontend exists:

- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- browser smoke at `http://localhost:4173`

High-value smoke paths:

- image appears in canvas
- brush changes mask overlay
- erase removes mask area
- undo/redo changes mask only
- save status updates
- previous/next image navigation preserves dirty-state rules
- backend sync failure keeps local work recoverable
- server ZIP is preferred only when exportable records are synced

## Runtime Logging

Frontend sync work should emit these structured events through
`src/observability/logger.js`:

- `sync.project.failed`
- `sync.image.failed`
- `sync.mask.failed`
- `sync.export.fallback`

Do not log data URLs, object URLs, raw image/mask bytes, or full project
snapshots.

## Accessibility

- Tool buttons need accessible names.
- Segmented mode controls need keyboard support.
- Sliders need labels and numeric values.
- Canvas needs a non-pointer fallback status/readout where practical.
- Save failure must be visible and announced outside color alone.
