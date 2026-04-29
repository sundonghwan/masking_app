# Repository Index

## Audience

Agents and maintainers working on the Masking App repository.

## Objective

Provide a fast map of the repository so work can start from known project
structure, design contracts, architecture decisions, and validation entrypoints.

## Current State

This repository contains a working local-first MVP for a browser-based image
masking annotation tool. It includes product requirements, architecture,
design-system guidance, generated UI references, the coding harness, a
dependency-free browser editor, a Node HTTP backend, filesystem storage, local
IndexedDB recovery, tests, and validation wrapper scripts.

## Important Files

| Path | Responsibility |
| --- | --- |
| `PROJECT.md` | Product plan for the image masking annotation tool. Source of product scope. |
| `docs/ARCHITECTURE.md` | MVP architecture: frontend/backend responsibilities, data model, API surface, runtime flows. |
| `docs/DEVELOPMENT_CHECKPOINTS.md` | Current checkpoint, recommended development order, and feature sequencing guardrails. |
| `docs/LOGGING.md` | Development log vs runtime operational log policy and event naming. |
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

The current MVP is local-first:

- Browser editor owns interactive canvas work.
- IndexedDB is the local recovery source.
- Backend filesystem storage is a sync/export mirror.
- Backend validates PNG signature, dimensions, and 8-bit grayscale format.
- Backend does not yet fully decode PNG pixels to prove all values are `0/255`.

No frontend framework, backend framework, or database has been introduced. Do
not add one unless it directly supports the next checkpoint.

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
- database writes and migrations once added

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

1. Backend mask save contract hardening.
2. Export policy unification.
3. Sync policy clarification.
4. Upload boundary upgrade when file size requires it.
5. Review workflow MVP after the mask/export contract is reliable.

## Open Questions

- Will the first MVP be local-only or multi-user over a network?
- Should empty masks be valid in any dataset scenario?
- What maximum image size must the first editor support?
- When should the app switch from local-first recovery to server-first restore?
