# Training Set Management Design

## Audience

Maintainers and agents extending dataset packaging and export workflows.

## Objective

Move from one-off training ZIP export to managed training sets that can be
created, listed, re-exported, archived, and reproduced.

## Product Intent

Operators need to combine approved images and masks from multiple
project/task/version sources into a stable training dataset. The selected source
combination must be saved so a dataset can be inspected and exported again later
without reselecting every source manually.

AI serving is deliberately out of scope for this phase. This feature prepares
clean training data artifacts before model integration.

## Scope

- Create a named training set from selected project/task/version sources.
- Store the source list, generated item manifest, and split configuration.
- Generate deterministic train/val/test splits from a seed.
- List and inspect saved training sets.
- Re-export a saved training set as ZIP.
- Archive and restore training sets.

## Storage Shape

```text
data/
  training_sets/
    {training_set_id}/
      manifest.json
      training_set.json
      source_versions.json
      exports/
```

The manifest stores operational metadata:

```json
{
  "training_set_id": "rail_crack_v1",
  "name": "Rail Crack v1",
  "description": "approved crack masks",
  "approved_only": true,
  "split": { "train": 0.8, "val": 0.1, "test": 0.1, "seed": 42 },
  "sources": [
    { "project_id": "rail-mask-001", "task_id": "crack", "version_id": "v1" }
  ],
  "training_set": {},
  "source_versions": {},
  "deleted_at": ""
}
```

`training_set.json` and `source_versions.json` mirror the ZIP metadata so
stored and exported artifacts use the same source of truth.

## API Contract

```http
GET    /api/training-sets
POST   /api/training-sets
GET    /api/training-sets/{training_set_id}
GET    /api/training-sets/{training_set_id}/export
DELETE /api/training-sets/{training_set_id}
POST   /api/training-sets/{training_set_id}/restore
```

Creating and exporting are allowed for reviewer/admin. Archive/restore are
admin-only because they affect shared dataset inventory.

## ZIP Contract

```text
training_set.json
source_versions.json
splits/train.txt
splits/val.txt
splits/test.txt
images/
masks/
```

Each `training_set.items[]` entry keeps source traceability:

- `project_id`
- `task_id`
- `version_id`
- `image_id`
- `source_image_path`
- `source_mask_path`
- `split`

## Validation

- Unit tests for deterministic split assignment and ZIP entry metadata.
- Storage tests for write/list/read/archive/restore.
- API tests for create/list/export/archive/restore and RBAC.
- API client contract tests.
- App contract tests for UI wiring.
