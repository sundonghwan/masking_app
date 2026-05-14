# Repository Index

## Audience

Agents and maintainers working on the Masking App repository.

## Objective

Provide a fast map of the repository so work can start from known project
structure, design contracts, architecture decisions, and validation entrypoints.

## Current State

This repository contains a working browser-based image masking annotation tool.
It includes product requirements, architecture, design-system guidance,
generated UI references, the coding harness, a dependency-free browser editor,
a Node HTTP backend, filesystem recovery storage, object-db runtime storage,
local IndexedDB recovery, tests, Docker packaging, and validation wrapper
scripts.

## Important Files

| Path | Responsibility |
| --- | --- |
| `PROJECT.md` | Product plan for the image masking annotation tool. Source of product scope. |
| `docs/ARCHITECTURE.md` | MVP architecture: frontend/backend responsibilities, data model, API surface, runtime flows. |
| `docs/DEVELOPMENT_CHECKPOINTS.md` | Current checkpoint, recommended development order, and feature sequencing guardrails. |
| `docs/LOGGING.md` | Development log vs runtime operational log policy and event naming. |
| `docs/PROJECT_STRUCTURE_RUNTIME.md` | Current folder, data, config, verifier, and Docker runtime map. |
| `DESIGN.md` | Design-system contract: tokens, layout rules, components, visual guardrails. |
| `docs/DESIGN_SCREENS.md` | Screen inventory and image-generation prompts for the UI set. |
| `docs/design/README.md` | Current design screen index. Use `screens-v2/` as implementation reference. |
| `harness/` | Persistent AI coding harness: commands, playbooks, tasks, logs, review checklist. |
| `scripts/harness/` | Wrapper scripts for lint/typecheck/test/smoke sensors. |
| `server.js` | Node HTTP server for static files and backend API routes. |
| `src/app.js` | Browser app controller for upload, editor orchestration, persistence, sync, and export. |
| `src/api/client.js` | Browser API client for project, image, mask, and export calls. |
| `src/editor/maskEditor.js` | Canvas mask editor engine. |
| `src/export/` | Export records, metadata, download helpers, and ZIP writer. |
| `src/storage/projectStore.js` | IndexedDB/memory local recovery store. |
| `src/observability/logger.js` | Structured runtime logging helper with payload redaction. |
| `src/server/` | Backend API, storage, HTTP helpers, and mask validation. |

## Current Application Shape

The current app keeps local recovery while Docker uses object-db runtime:

- Browser editor owns interactive canvas work.
- IndexedDB is the browser-side local recovery source.
- Host-native filesystem storage remains available for recovery and fixtures.
- Docker Compose defaults to object-db storage: PostgreSQL stores metadata and
  MinIO stores original image and class-mask bytes.
- Backend validates PNG signature, dimensions, 8-bit grayscale format, decoded
  pixel values, and non-empty binary `0/255` masks for supported
  non-interlaced PNG masks.

No frontend framework or backend framework has been introduced. PostgreSQL and
MinIO are present only as storage/runtime dependencies.

## Product Workflow

Primary MVP workflow:

```text
Create project
  -> upload images
  -> list images
  -> open image in canvas
  -> paint/erase binary mask
  -> autosave or manual save
  -> submit image
  -> export images, masks, and metadata
```

## Design Reference

Use `docs/design/screens-v2/` as the active screen reference.

The previous `docs/design/screens/` images are exploratory only. Do not use them
as implementation reference unless explicitly requested.

## High-Risk Areas

These areas require impact chains:

- canvas coordinate mapping
- binary mask raster updates
- undo/redo stroke history
- autosave/manual save ordering
- server-side mask validation
- image/mask dimension consistency
- export filtering and metadata paths
- file upload and storage paths
- local-first/backend sync boundaries
- auth/permission once added
- database writes, migrations, and object-storage references

## Relevant Playbooks

| Work type | Read |
| --- | --- |
| UI, routes, canvas, state, accessibility | `harness/playbooks/frontend.md` |
| APIs, validation, storage, export | `harness/playbooks/backend.md` |
| schema, migrations, seed/reset | `harness/playbooks/database.md` |
| test strategy, smoke, changed-risk mapping | `harness/playbooks/testing.md` |
| auth/session/permissions once added | `harness/playbooks/auth.md` |
| billing if ever added | `harness/playbooks/billing.md` |

## Standard Validation Entrypoints

Use `harness/commands.md` as the command source of truth.

Wrapper scripts:

- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`

These scripts currently call the package scripts and smoke checks for the active
dependency-free Node/browser stack.

## Next Checkpoint

Read `docs/DEVELOPMENT_CHECKPOINTS.md` before adding new product features.

Next recommended work:

1. Run Docker object-db staging evidence on the target host.
2. Prove export/training-set parity against representative object-db data.
3. Rotate local MVP credentials or record the identity boundary decision before
   shared network use.
4. Add a real AI model adapter only after local magic-tool limits are confirmed.

## Open Questions

- Which host will own the first shared Docker deployment?
- Will local MVP identity be accepted for controlled internal use, or replaced
  by an external provider?
- What export/training-set smoke should become the release gate for real data?
