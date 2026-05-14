# Masking App

Browser-based MVP for creating binary mask data from image datasets, with a
dependency-free Node backend scaffold for local project persistence and export.

## Current MVP

The current implementation is a dependency-free web app served by Node's built-in
HTTP server. It supports:

- image upload from the browser
- image queue and status chips
- canvas viewer with fit, zoom, and pan support
- brush and eraser modes
- red mask overlay preview
- stroke-level undo/redo engine
- IndexedDB-backed local project recovery
- mask autosave after edits
- grayscale binary mask PNG export
- ZIP export containing `images/`, `masks/`, `annotations.json`, and
  `export_summary.json`
- local backend APIs for project manifests, image writes, mask writes, mask
  header/dimension validation, and ZIP download
- browser-to-backend sync for uploads, mask saves, submitted masks, and server
  ZIP export when every exportable image is synced
- harness-backed lint/typecheck/test/smoke commands
- explicit deployment profile for local/staging runtime configuration
- admin-only legacy project manifest repair preview/apply API
- generic AI serving API contract/stub for future detection, segmentation, and
  classification adapters

Database storage, production identity, and real model inference are
intentionally not part of this slice.

## Run Locally

```bash
npm run dev
```

Open:

```text
http://localhost:4173
```

The server writes local project data under `data/` by default. Override it when
needed:

```bash
MASKING_APP_DATA_DIR=/tmp/masking-app-data npm run dev
```

Optional deployment-profile overrides:

```bash
PORT=4173 \
MASKING_APP_HOST=127.0.0.1 \
MASKING_APP_MODE=local \
MASKING_APP_AI_SERVING=1 \
npm run dev
```

`MASKING_APP_AI_SERVING=1` enables only the generic contract/stub. It does not
load or run an AI model.

## API Snapshot

```http
GET  /api/health
GET  /api/ai/capabilities
POST /api/ai/infer
POST /api/projects
GET  /api/projects/:project_id
POST /api/projects/:project_id/repair
POST /api/projects/:project_id/images
PUT  /api/images/:image_id/mask
GET  /api/projects/:project_id/export
```

Current upload endpoints accept JSON data URLs to keep the scaffold
dependency-free. Production upload work should replace that boundary with
streaming multipart handling.

## Validate

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
```

Equivalent direct commands:

```bash
npm run lint
npm run typecheck
npm test
npm run smoke
```

## Project Layout

```text
server.js                   Node HTTP server for static files and API routes
index.html                  App shell
src/app.js                  Browser app controller and UI state
src/api/client.js           Browser API client for backend sync
src/editor/maskEditor.js    Canvas/mask editing engine
src/export/exporter.js      Export metadata and download helpers
src/export/zip.js           Dependency-free browser ZIP writer
src/storage/projectStore.js IndexedDB/local persistence helpers
src/observability/logger.js Structured runtime logging helper
src/server/                 Backend API, storage, and validation helpers
src/styles.css              Unified workbench styling
tests/                      Node built-in tests
harness/                    AI coding harness
scripts/harness/            Validation wrapper scripts
```

## Design Contract

Use these files before UI work:

- `DESIGN.md`
- `docs/design/README.md`
- `docs/design/screens-v2/`

The active UI direction is a compact operational workbench, not a landing page.

## Architecture And Development Checkpoints

Read these before adding new product features:

- `docs/ARCHITECTURE.md`
- `docs/PROJECT_STRUCTURE_RUNTIME.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`
- `docs/LOGGING.md`

Current policy:

- IndexedDB is the local work recovery source for this MVP slice.
- Docker Compose uses object-db storage: PostgreSQL stores metadata and MinIO
  stores image/mask bytes. Filesystem storage remains available for explicit
  local recovery and fixtures.
- Review, admin, auth/session, dataset packaging, manifest repair, and generic
  AI serving contracts are implemented at local-MVP depth.
- Runtime logs use structured events for API requests, validation failures,
  export completion, and frontend backend-sync failures.

## Known Gaps

- Host-native `npm run dev` still uses filesystem mode unless object-db
  environment variables are provided.
- Upload endpoints accept multipart form data, but not true streaming upload.
- AI endpoints are a model-agnostic contract/stub; no real model adapter is
  configured yet.
- Final target-host deployment evidence still needs to be captured after
  storage and identity settings are accepted.
