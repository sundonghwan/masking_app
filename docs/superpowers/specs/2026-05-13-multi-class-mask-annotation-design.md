# Multi-Class Mask Annotation Design

## Audience

Maintainers and coding agents extending Masking App from single binary masks to
model-ready class-labeled mask annotations.

## Objective

Define the data, editor, export, and AI-serving contract for this product
direction:

```text
one image -> many class-labeled binary masks
model output -> class_id + mask image
```

This design intentionally avoids polygon segmentation as the primary target
because polygon-only output can lose internal holes, discontinuous regions, and
fine mask geometry. The target representation remains pixel masks.

## Decision

Use **class-labeled binary masks per image**, not a single indexed mask as the
primary editor/storage format.

```text
Image
  -> annotations[]
      -> class_id
      -> class_name
      -> mask_path
      -> mask_data_url
      -> source: manual | ai | copied_previous
```

An image can contain multiple annotations. Each annotation owns one binary PNG
mask for one class. Overlap is allowed in the raw annotation format because
different classes can represent independent semantic layers.

## Why Not Polygon First

Polygon segmentation is not the right source-of-truth format for this app.

- Holes inside an object are awkward or impossible unless the downstream format
  supports nested polygons consistently.
- Thin, broken, or irregular defects are easier to represent as pixels than
  polygons.
- Manual correction in this app is already pixel-mask based.
- AI segmentation models commonly output masks or logits before polygonization.

Polygon export can be a later derived format. It should not replace the mask
source of truth.

## Why Not Indexed Mask First

An indexed mask stores class id in the pixel value:

```text
0 = background
1 = crack
2 = corrosion
3 = scratch
```

That is useful for some training pipelines, but it is too disruptive as the
first editor/storage migration.

Problems with indexed mask as the editor source of truth:

- brush paint needs to write class values instead of binary alpha
- erase semantics become ambiguous: erase selected class or all classes
- class overlap is impossible without extra layer rules
- previous-frame copy must become class-aware immediately
- current backend binary PNG validation would need a larger rewrite

The chosen approach keeps the current binary mask editor reusable while adding a
class label around each mask.

## Target Data Contract

### Project Label Schema

Each project owns a label schema.

```json
{
  "label_schema": [
    {
      "class_id": 1,
      "name": "crack",
      "color": "#ef4444",
      "description": "Crack or fracture mask",
      "enabled": true
    },
    {
      "class_id": 2,
      "name": "corrosion",
      "color": "#f59e0b",
      "description": "Corroded surface region",
      "enabled": true
    }
  ]
}
```

Rules:

- `class_id` is unique within a project.
- `class_id` is a positive integer.
- `name` is the human-readable label.
- `color` controls editor overlay and label chips.
- disabled labels remain valid for old annotations but cannot be selected for
  new edits.

### Image Annotation List

Each image can have many annotation masks.

```json
{
  "id": "image_001",
  "image_path": "images/image_001.png",
  "annotations": [
    {
      "annotation_id": "ann_image_001_class_1",
      "class_id": 1,
      "class_name": "crack",
      "color": "#ef4444",
      "mask_path": "masks/image_001_class_1_crack_mask.png",
      "mask_data_url": "data:image/png;base64,...",
      "mask_width": 1280,
      "mask_height": 720,
      "mask_ratio": 0.032,
      "source": "manual",
      "score": null,
      "status": "in_progress",
      "created_at": "2026-05-13T00:00:00.000Z",
      "updated_at": "2026-05-13T00:00:00.000Z"
    }
  ]
}
```

Compatibility:

- Existing `current_mask_path`, `mask_data_url`, and `mask_ratio` remain valid
  legacy fields during migration.
- A repair/migration step can convert a legacy single mask into one annotation
  using the default label.
- New class-aware save/export paths should read `annotations[]` first.

## Editor UX

The workbench needs a label-aware editing model.

### Label Selection

The tool area must include a current label selector:

```text
Current label
  [1 crack      red swatch]
  [2 corrosion  amber swatch]
  [3 scratch    blue swatch]
```

Rules:

- brush, magic, previous-frame copy, and mask move operate on the selected
  label annotation.
- if no label is selected, mask-changing tools are disabled or show a blocking
  message.
- selecting a label loads or creates that label's annotation mask for the
  selected image.

### Annotation Layer List

The image inspector should show annotation masks for the selected image:

```text
Image annotations
  class 1 crack       visible on   edit   delete
  class 2 corrosion   visible off  edit   delete
```

Rules:

- edit switches the current label and loads that annotation mask.
- delete soft-removes the annotation mask from the image.
- visibility controls overlay display only, not export inclusion.
- first implementation can edit one annotation mask at a time while showing
  other labels as read-only overlays later.

### Tool Behavior

| Tool | Class-aware behavior |
| --- | --- |
| Brush | paints selected class annotation mask |
| Erase | erases only the selected class annotation mask |
| Magic | applies selected region to selected class annotation mask |
| Previous mask copy | copies previous image annotation with the same `class_id` |
| Mask move | moves only the selected class annotation mask |
| Save/autosave | updates selected annotation metadata and mask file |

## AI Serving Contract

The existing generic AI serving contract should become segmentation-output
specific without binding to a model provider.

Request:

```json
{
  "task": "segmentation",
  "image": {
    "data_url": "data:image/png;base64,...",
    "width": 1280,
    "height": 720
  },
  "options": {
    "allowed_class_ids": [1, 2]
  }
}
```

Response:

```json
{
  "status": "accepted",
  "task": "segmentation",
  "provider": "stub",
  "model": null,
  "predictions": [
    {
      "prediction_id": "pred_image_001_1",
      "class_id": 1,
      "class_name": "crack",
      "score": 0.91,
      "mask_data_url": "data:image/png;base64,...",
      "mask_width": 1280,
      "mask_height": 720
    }
  ]
}
```

Import rule:

```text
AI prediction -> draft annotation -> user correction -> submit
```

AI predictions should not become approved training data without manual review or
submission through the normal image workflow.

## Export Contract

Training/export ZIP should include class metadata.

```text
training_set.zip
  images/
    image_001.png
  masks/
    image_001_class_1_crack_mask.png
    image_001_class_2_corrosion_mask.png
  annotations.json
  label_schema.json
  training_set.json
  source_versions.json
```

`annotations.json` should nest annotations under each image:

```json
{
  "project_id": "rail-mask-001",
  "label_schema": [
    { "class_id": 1, "name": "crack", "color": "#ef4444" }
  ],
  "items": [
    {
      "image_id": "image_001",
      "image_path": "images/image_001.png",
      "annotations": [
        {
          "annotation_id": "ann_image_001_class_1",
          "class_id": 1,
          "class_name": "crack",
          "mask_path": "masks/image_001_class_1_crack_mask.png",
          "mask_width": 1280,
          "mask_height": 720,
          "mask_ratio": 0.032
        }
      ]
    }
  ]
}
```

Later derived exports can merge class masks into indexed masks with an explicit
priority rule. That is not part of the first class-labeled mask foundation.

## Migration Strategy

Phase 1 should be backward compatible.

1. Add project `label_schema`.
2. Create a default label if a project has legacy masks but no labels.
3. Convert legacy image mask fields into a single annotation in preview/repair
   flows or on first edit.
4. Keep legacy export working until class-aware export is implemented.
5. Switch training-set export to annotations only after class-aware mask save is
   stable.

Default legacy label:

```json
{
  "class_id": 1,
  "name": "target",
  "color": "#ef4444",
  "enabled": true
}
```

## Implementation Phases

### Phase 1: Annotation Foundation

- label schema utilities
- annotation record utilities
- project/image manifest compatibility
- editor current-label state
- save selected class annotation mask

Success criteria:

- one image can hold multiple annotations with different `class_id`
- selected label controls which binary mask is edited
- legacy single-mask data still opens

### Phase 2: Class-Aware Export

- class-aware `annotations.json`
- `label_schema.json`
- class-specific mask paths
- training-set manifest includes class metadata

Success criteria:

- exported metadata maps every mask to `class_id`
- every exported mask is still a binary PNG
- old single-mask projects export through a default label migration path

### Phase 3: AI Prediction Import

- update `/api/ai/infer` response contract tests
- allow predictions with `class_id + mask_data_url`
- import prediction as draft annotation

Success criteria:

- model output can be reviewed and manually corrected
- no AI prediction is silently approved

### Phase 4: Derived Indexed Mask Export

- optional export mode that merges class masks into indexed masks
- explicit overlap priority rule
- conflict report for overlapping class masks

Success criteria:

- indexed output is derived, not the editor source of truth
- overlap behavior is deterministic and documented

## Risks And Edge Cases

- Class overlap can be valid in raw multi-mask export but invalid for some
  indexed-mask training targets.
- Deleting a label must not delete old annotations silently.
- Previous-frame copy should match by `class_id`, not by label name.
- Label color changes should update UI display but not rewrite mask files.
- Export consumers may expect one mask per image; class-aware export must make
  the new format version explicit.

## Validation Gates

Minimum tests before implementation is considered complete:

- label schema normalization and duplicate `class_id` rejection
- annotation id/path generation
- selected-label save updates only that annotation
- previous-frame copy chooses the same `class_id`
- class-aware export includes `label_schema.json`
- AI response accepts `predictions[].class_id + mask_data_url`
- legacy single-mask records still pass export or migrate to default label

Standard harness bundle:

```bash
./scripts/harness/lint-all.sh
./scripts/harness/typecheck-all.sh
./scripts/harness/test-target.sh
./scripts/harness/smoke-web.sh
git diff --check
```

## Open Questions

- Which initial real labels should ship with the first project template?
- Should annotation deletion be soft-delete from the first implementation?
- Which downstream training format should receive the first derived indexed
  export?
