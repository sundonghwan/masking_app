# Storage Hierarchy Design

## Audience

Maintainers and coding agents changing storage, project/task/version APIs,
image deletion, export behavior, or migration for Masking App.

## Objective

Move the file-storage model from one flat project manifest to a hierarchy that
keeps dataset work separated by project, task, and version. The goal is to make
wrong-image deletion, additional image batches, revision work, export, and
future migration to SQLite easier without abandoning file storage.

## Decision

Adopt this target storage hierarchy:

```text
data/
  projects/
    {project_id}/
      project.json
      tasks/
        {task_id}/
          task.json
          versions/
            {version_id}/
              manifest.json
              images/
              masks/
              exports/
              trash/
                images/
                masks/
```

Core identity becomes:

```text
project_id + task_id + version_id
```

The workbench image list must eventually show only images from the selected
`project_id/task_id/version_id` where `deleted_at` is empty.

## Why This Change

The current runtime layout is:

```text
data/
  {project_id}/
    manifest.json
    images/
    masks/
    exports/
```

That structure is simple, but it mixes all images in one project-level list.
When a user opens a project, the image list is the entire `manifest.images`
array. This makes these operations awkward:

- removing images uploaded to the wrong work batch
- adding more images after a submitted or approved batch
- distinguishing first-pass masks from later revision batches
- exporting exactly one task/version
- hiding smoke/test or stale work from the active task view

The new hierarchy gives each labeling batch a physical storage boundary.

## Concepts

| Concept | Meaning | Example |
| --- | --- | --- |
| Project | Business or dataset container | `rail-defect-2026` |
| Task | Labeling objective inside a project | `crack_masking` |
| Version | A concrete batch/snapshot of a task | `v1`, `v2` |
| Image | Input image inside one version | `image_0001` |
| Mask | Binary output for one version image | `masks/image_0001_mask.png` |
| Export | ZIP and metadata for one version | `exports/rail-defect-2026_crack_masking_v1.zip` |

## Target Layout

Example:

```text
data/
  projects/
    rail-defect-2026/
      project.json
      tasks/
        crack_masking/
          task.json
          versions/
            v1/
              manifest.json
              images/
                image_0001_frame_0014.jpg
              masks/
                image_0001_mask.png
              exports/
              trash/
                images/
                masks/
            v2/
              manifest.json
              images/
              masks/
              exports/
              trash/
                images/
                masks/
        scratch_masking/
          task.json
          versions/
            v1/
              manifest.json
              images/
              masks/
              exports/
              trash/
                images/
                masks/
```

Rules:

- IDs are sanitized path segments.
- File paths stored in manifests stay archive-relative to the version root.
- Runtime code never stores absolute paths in export metadata.
- Deleted images move into the version `trash/` directory instead of being
  physically removed immediately.

## Metadata Files

### `project.json`

```json
{
  "project_id": "rail-defect-2026",
  "name": "Rail Defect 2026",
  "description": "",
  "created_by": "admin",
  "created_at": "2026-04-30T00:00:00.000Z",
  "updated_at": "2026-04-30T00:00:00.000Z",
  "archived": false
}
```

### `task.json`

```json
{
  "project_id": "rail-defect-2026",
  "task_id": "crack_masking",
  "name": "Crack Masking",
  "description": "Binary crack mask annotation",
  "created_by": "admin",
  "created_at": "2026-04-30T00:00:00.000Z",
  "updated_at": "2026-04-30T00:00:00.000Z",
  "current_version": "v1",
  "archived": false
}
```

### Version `manifest.json`

```json
{
  "project_id": "rail-defect-2026",
  "task_id": "crack_masking",
  "version_id": "v1",
  "status": "in_progress",
  "created_by": "admin",
  "created_at": "2026-04-30T00:00:00.000Z",
  "updated_at": "2026-04-30T00:00:00.000Z",
  "images": [
    {
      "id": "image_0001",
      "project_id": "rail-defect-2026",
      "task_id": "crack_masking",
      "version_id": "v1",
      "original_file_name": "frame_0014.jpg",
      "image_path": "images/image_0001_frame_0014.jpg",
      "current_mask_path": "masks/image_0001_mask.png",
      "uploaded_by": "admin",
      "worker_id": "worker",
      "reviewer_id": "reviewer",
      "status": "not_started",
      "deleted_at": "",
      "deleted_by": "",
      "delete_reason": "",
      "created_at": "2026-04-30T00:00:00.000Z",
      "updated_at": "2026-04-30T00:00:00.000Z"
    }
  ]
}
```

Version status values:

```text
draft
in_progress
submitted
reviewing
approved
rejected
archived
```

Image status values can keep the existing values during migration:

```text
not_started
in_progress
submitted
approved
rejected
```

## Deletion And Restore

Image deletion should be a soft delete plus file move.

Delete flow:

```text
versions/v1/images/image_0003_bad.jpg
  -> versions/v1/trash/images/image_0003_bad.jpg

versions/v1/masks/image_0003_mask.png
  -> versions/v1/trash/masks/image_0003_mask.png
```

Manifest update:

```json
{
  "deleted_at": "2026-04-30T00:00:00.000Z",
  "deleted_by": "admin",
  "delete_reason": "wrong upload"
}
```

Rules:

- Default image lists exclude `deleted_at` images.
- Admin can show deleted images for restore.
- Restore moves files back from `trash/` and clears deletion fields.
- Export always excludes deleted images.
- Physical purge can be a later admin maintenance feature.

## Adding Images

If the version is mutable:

```text
draft
in_progress
rejected
```

new images can be added to the current version.

If the version is locked:

```text
submitted
reviewing
approved
archived
```

the UI should guide the user to create a new version.

Recommended message:

```text
이 버전은 제출/승인된 상태입니다. 이미지를 추가하려면 새 버전을 만드세요.
```

## Version Creation

Support two version creation modes.

### Empty Version

Creates a new version with no images:

```text
v2/images/
v2/masks/
v2/manifest.json images=[]
```

Use when the next task batch is independent.

### Clone Previous Version

Creates a new version from the previous version:

- copy image files
- copy current mask files
- copy image metadata
- reset version status to `in_progress`
- reset image status to `in_progress` or `not_started`
- preserve review history as `source_review_events` or `version_source`
- set `source_version_id`

MVP default:

```text
clone images and masks, reset statuses to in_progress
```

This makes correction and additional work easier than starting from an empty
version.

## Export

Export scope changes from project-level to version-level:

```text
project_id + task_id + version_id
```

API intent:

```http
GET /api/projects/{project_id}/tasks/{task_id}/versions/{version_id}/export
```

ZIP name:

```text
{project_id}_{task_id}_{version_id}.zip
```

ZIP layout:

```text
images/
masks/
annotations.json
export_summary.json
project.json
task.json
version.json
```

Export rules:

- include only non-deleted images
- use existing binary mask validation rules
- keep image/mask archive-relative paths
- include project/task/version identifiers in `annotations.json` and
  `export_summary.json`

## Training Set Export

The hierarchy must also support a later export mode that combines selected
task/version outputs into one training dataset.

Example selection:

```text
project=rail-defect-2026
include:
  - task=crack_masking version=v2
  - task=scratch_masking version=v1
  - task=corrosion_masking version=v3
```

This is not the same as a single version export. It produces a new derived
artifact that records exactly which versions were included.

Target layout:

```text
data/
  projects/
    rail-defect-2026/
      training_sets/
        trainset_2026_04_30/
          training_set.json
          images/
          masks/
          exports/
            trainset_2026_04_30.zip
```

### `training_set.json`

```json
{
  "training_set_id": "trainset_2026_04_30",
  "project_id": "rail-defect-2026",
  "name": "Rail Defect Training Set 2026-04-30",
  "created_by": "admin",
  "created_at": "2026-04-30T00:00:00.000Z",
  "sources": [
    {
      "task_id": "crack_masking",
      "version_id": "v2"
    },
    {
      "task_id": "scratch_masking",
      "version_id": "v1"
    }
  ],
  "items": [
    {
      "source_task_id": "crack_masking",
      "source_version_id": "v2",
      "source_image_id": "image_0001",
      "image_path": "images/crack_masking_v2_image_0001_frame_0014.jpg",
      "mask_path": "masks/crack_masking_v2_image_0001_mask.png"
    }
  ]
}
```

Training set export rules:

- include only selected task/version pairs
- include only non-deleted images
- include only images passing the same binary mask validation required by normal
  version export
- preserve source identifiers for traceability:
  `source_project_id`, `source_task_id`, `source_version_id`, `source_image_id`
- rewrite output file names to avoid collisions across versions
- include a `training_set.json` and `source_versions.json` in the ZIP
- do not mutate source task/version manifests when creating a training set

Collision policy:

- output image and mask file names must include at least
  `{task_id}_{version_id}_{image_id}`
- if two source versions contain the same original file name, both can be
  included because output paths are rewritten
- if two selected versions contain the same `task_id/version_id/image_id`, treat
  it as a duplicate selection and include it once

ZIP layout:

```text
images/
masks/
annotations.json
export_summary.json
training_set.json
source_versions.json
```

Future API intent:

```http
POST /api/projects/{project_id}/training-sets
GET  /api/projects/{project_id}/training-sets
GET  /api/projects/{project_id}/training-sets/{training_set_id}
GET  /api/projects/{project_id}/training-sets/{training_set_id}/export
```

The first implementation can generate the ZIP directly from selected
task/version sources without permanently copying source files into
`training_sets/{id}/images` and `masks`. Durable copied training-set artifacts
can come later if repeated download or audit requirements appear.

## API Plan

Current API is project-level. The target API should add task/version routes
without immediately removing legacy routes.

Minimum new API:

```http
POST /api/projects/{project_id}/tasks
GET  /api/projects/{project_id}/tasks

POST /api/projects/{project_id}/tasks/{task_id}/versions
GET  /api/projects/{project_id}/tasks/{task_id}/versions/{version_id}

POST /api/projects/{project_id}/tasks/{task_id}/versions/{version_id}/images
DELETE /api/projects/{project_id}/tasks/{task_id}/versions/{version_id}/images/{image_id}
POST /api/projects/{project_id}/tasks/{task_id}/versions/{version_id}/images/{image_id}/restore

PUT /api/projects/{project_id}/tasks/{task_id}/versions/{version_id}/images/{image_id}/mask
GET /api/projects/{project_id}/tasks/{task_id}/versions/{version_id}/export

POST /api/projects/{project_id}/training-sets
GET  /api/projects/{project_id}/training-sets/{training_set_id}/export
```

Keep legacy routes during migration:

```http
GET  /api/projects/{project_id}
POST /api/projects/{project_id}/images
PUT  /api/images/{image_id}/mask
GET  /api/projects/{project_id}/export
```

Legacy routes should eventually call into the new storage layer using:

```text
task_id = default_task
version_id = v1
```

## Frontend Flow

Current:

```text
Login -> Projects -> Workbench
```

Target:

```text
Login -> Projects -> Task/Version selector -> Workbench
```

For MVP, avoid adding too many pages. Extend the Projects screen:

```text
Left: project list
Middle: selected project tasks
Right: selected task versions
Actions: new task, new version, open workbench
```

Workbench state must include:

```js
{
  projectId,
  taskId,
  versionId
}
```

The image list should be:

```text
selected project + selected task + selected version + not deleted
```

This prevents old project-level images, smoke data, or unrelated task images
from appearing in the active workbench.

## Migration

Existing layout:

```text
data/{project_id}/manifest.json
data/{project_id}/images/
data/{project_id}/masks/
data/{project_id}/exports/
```

Migration target:

```text
data/projects/{project_id}/project.json
data/projects/{project_id}/tasks/default_task/task.json
data/projects/{project_id}/tasks/default_task/versions/v1/manifest.json
data/projects/{project_id}/tasks/default_task/versions/v1/images/
data/projects/{project_id}/tasks/default_task/versions/v1/masks/
data/projects/{project_id}/tasks/default_task/versions/v1/exports/
```

Migration rules:

- `project_id` stays the existing project folder name or manifest project ID.
- `task_id` defaults to `default_task`.
- `version_id` defaults to `v1`.
- existing `manifest.name` becomes project name.
- existing image records gain `task_id`, `version_id`, `uploaded_by` when
  possible.
- smoke/test projects should be excluded from manual production migration and
  moved to isolated test data roots instead.

Do not physically delete the old layout until the migrated version is validated.

Recommended migration command shape:

```bash
node scripts/migrate-storage-hierarchy.mjs --from data --to data-next --dry-run
node scripts/migrate-storage-hierarchy.mjs --from data --to data-next
```

## Smoke And Test Data Isolation

Smoke/test data must not appear in normal project lists.

Rules:

- Harness smoke tests that create runtime data must use a temporary root:

```bash
MASKING_APP_DATA_DIR=/tmp/masking-app-smoke-data npm run dev
```

- Tests should use temporary directories under `/tmp`.
- Project names ending in `_smoke` should not be used as a long-term UI filter.
  Root isolation is the correct fix.
- Existing local smoke folders can be manually archived or deleted after
  migration validation.

## Implementation Phases

### Phase 1: Storage Helpers

- Add path resolver for `project/task/version`.
- Add `project.json`, `task.json`, and version manifest read/write helpers.
- Add soft delete/restore file move helpers.
- Keep existing project-level helpers.
- Add storage unit tests.

### Phase 2: New API Surface

- Add task creation/list routes.
- Add version creation/read routes.
- Add version image upload.
- Add version mask save.
- Add version export.
- Keep legacy routes passing existing tests.

### Phase 3: Frontend Selector

- Extend Projects screen with task and version panels.
- Track `taskId` and `versionId` in app state.
- Open workbench against selected version manifest.
- Show only selected version images.

### Phase 4: Delete/Restore UX

- Add selected image delete action.
- Require delete reason for admin delete.
- Hide deleted images by default.
- Add admin "show deleted" and restore controls.

### Phase 5: Version Clone

- Add empty version creation.
- Add clone previous version creation.
- Copy image/mask files and reset statuses according to version policy.

### Phase 6: Migration And Cleanup

- Add dry-run migration script.
- Migrate existing non-smoke data into `data/projects`.
- Isolate smoke/test data roots.
- Remove or deprecate legacy routes after verification.

### Phase 7: Training Set Export

- Add source version selector for one project.
- Add pure training-set summary builder.
- Add collision-safe output path generation.
- Add training-set ZIP export.
- Add `training_set.json` and `source_versions.json` metadata.
- Keep source versions immutable during training-set generation.

## Validation

Minimum validation for storage hierarchy implementation:

```bash
npm test -- tests/serverStorage.test.js tests/serverApi.test.js tests/appContracts.test.js
npm run lint
./scripts/harness/typecheck-all.sh
./scripts/harness/test-target.sh
./scripts/harness/smoke-web.sh
```

Manual smoke after UI integration:

- create project
- create task
- create `v1`
- upload images to `v1`
- delete one wrong image
- verify it disappears from the workbench
- restore it as admin
- create `v2` from `v1`
- add more images to `v2`
- export only `v2`
- select `v1` and `v2` sources
- export a combined training set
- verify duplicate file names are rewritten without collisions

## Risks

- Storage migration touches upload, mask save, review, assignment, and export.
  Use impact chains for every implementation task in this area.
- File moves can lose user data if implemented as physical delete. Use trash
  moves first.
- Legacy routes can diverge from new routes. During migration, route both
  through shared storage helpers where practical.
- `src/app.js` already owns a lot of state. Keep task/version selector changes
  narrow, or split pure selectors/helpers first.
- Export metadata must remain archive-relative.
- Training set export must preserve source task/version/image traceability while
  rewriting output paths to avoid collisions.
- Smoke/test data should be isolated by data root, not hidden by name filters.

## Alternatives Considered

### A. Project -> Task -> Version

Chosen.

Pros:

- clean physical boundary for task batches
- supports wrong-image delete and restore
- supports additional batches and revisions
- maps well to future SQLite tables

Cons:

- requires API, storage, and frontend flow changes
- requires migration

### B. Project -> Version Only

Pros:

- smaller change
- solves some versioning problems

Cons:

- cannot separate different labeling objectives inside one project
- likely to require another migration later

### C. Keep Flat Project Manifest

Pros:

- least code change

Cons:

- images stay mixed in one folder/list
- wrong-image deletion remains risky
- task/version/export boundaries remain weak

## Open Questions

- Should version clone copy masks by default for every task, or should this be a
  per-task option?
- Should workers be allowed to create versions, or only admins?
- Should deleted images be restorable by reviewers, or admin only?
- Should `task_id` be user-defined, generated from task name, or both?
- Should training sets physically copy files into `training_sets/{id}`, or is
  generated-on-demand ZIP enough for the first implementation?
