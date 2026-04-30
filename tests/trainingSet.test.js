import assert from "node:assert/strict";
import test from "node:test";

import { createTrainingSetManifest, createTrainingSetZipEntries } from "../src/export/trainingSet.js";

const NOW = "2026-04-30T00:00:00.000Z";

test("creates traceable training set manifest from selected task versions", () => {
  const result = createTrainingSetManifest([
    {
      project_id: "project-a",
      task_id: "crack",
      version_id: "v1",
      images: [
        exportableImage("image-1", "frame 1.png"),
        { ...exportableImage("deleted", "deleted.png"), deleted_at: NOW },
        { ...exportableImage("draft", "draft.png"), status: "in_progress" },
      ],
    },
    {
      project_id: "project-a",
      task_id: "scratch",
      version_id: "v2",
      images: [exportableImage("image-2", "frame 2.png")],
    },
  ], { now: NOW });

  assert.equal(result.training_set.total_sources, 2);
  assert.equal(result.training_set.total_items, 2);
  assert.equal(result.source_versions.sources[0].excluded_images, 1);
  assert.deepEqual(result.training_set.items.map((item) => `${item.project_id}/${item.task_id}/${item.version_id}/${item.image_id}`), [
    "project-a/crack/v1/image-1",
    "project-a/scratch/v2/image-2",
  ]);
  assert.equal(result.training_set.items[0].image_path, "images/project-a_crack_v1_0001_image-1_frame_1.png");
  assert.equal(result.training_set.items[0].mask_path, "masks/project-a_crack_v1_0001_image-1_frame_1_mask.png");
});

test("creates zip entries with metadata first and source file traceability", () => {
  const result = createTrainingSetZipEntries([
    {
      project_id: "project-a",
      task_id: "crack",
      version_id: "v1",
      images: [exportableImage("image-1", "frame.png")],
    },
  ], { now: NOW });

  assert.deepEqual(result.entries.slice(0, 2).map((entry) => entry.path), [
    "training_set.json",
    "source_versions.json",
  ]);
  assert.equal(result.entries[2].kind, "image");
  assert.equal(result.entries[2].source_project_id, "project-a");
  assert.equal(result.entries[2].source_path, "images/image-1.png");
  assert.equal(result.entries[3].kind, "mask");
  assert.equal(result.entries[3].source_path, "masks/image-1_mask.png");
});

function exportableImage(id, originalFileName) {
  return {
    id,
    project_id: "project-a",
    original_file_name: originalFileName,
    image_path: `images/${id}.png`,
    current_mask_path: `masks/${id}_mask.png`,
    width: 10,
    height: 10,
    mask_width: 10,
    mask_height: 10,
    mask_values_valid: true,
    mask_ratio: 0.4,
    status: "approved",
  };
}
