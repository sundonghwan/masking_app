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
  assert.deepEqual(result.training_set.split_counts, { train: 2, val: 0, test: 0 });
  assert.equal(result.source_versions.sources[0].excluded_images, 1);
  assert.deepEqual(result.training_set.items.map((item) => `${item.project_id}/${item.task_id}/${item.version_id}/${item.image_id}`), [
    "project-a/crack/v1/image-1",
    "project-a/scratch/v2/image-2",
  ]);
  assert.equal(result.training_set.items[0].image_path, "images/project-a_crack_v1_0001_image-1_frame_1.png");
  assert.equal(result.training_set.items[0].mask_path, "masks/project-a_crack_v1_0001_image-1_frame_1_mask.png");
  assert.equal(result.training_set.items[0].split, "train");
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

  assert.deepEqual(result.entries.slice(0, 5).map((entry) => entry.path), [
    "training_set.json",
    "source_versions.json",
    "splits/train.txt",
    "splits/val.txt",
    "splits/test.txt",
  ]);
  assert.match(result.entries[2].data, /images\/project-a_crack_v1_0001_image-1_frame\.png/);
  assert.equal(result.entries[5].kind, "image");
  assert.equal(result.entries[5].source_project_id, "project-a");
  assert.equal(result.entries[5].source_path, "images/image-1.png");
  assert.equal(result.entries[6].kind, "mask");
  assert.equal(result.entries[6].source_path, "masks/image-1_mask.png");
});

test("creates training items per class annotation with class metadata", () => {
  const result = createTrainingSetManifest([
    {
      project_id: "project-a",
      task_id: "defect",
      version_id: "v3",
      label_schema: [
        { class_id: 1, name: "crack", color: "#EF4444" },
        { class_id: 2, name: "scratch", color: "#F59E0B" },
      ],
      images: [{
        ...exportableImage("image-1", "frame.png"),
        annotations: [
          {
            annotation_id: "ann_image-1_class_1",
            class_id: 1,
            class_name: "crack",
            mask_path: "masks/image-1_class_1_crack_mask.png",
            mask_ratio: 0.2,
          },
          {
            annotation_id: "ann_image-1_class_2",
            class_id: 2,
            class_name: "scratch",
            mask_path: "masks/image-1_class_2_scratch_mask.png",
            mask_ratio: 0.1,
          },
        ],
      }],
    },
  ], { now: NOW });

  assert.equal(result.training_set.total_items, 2);
  assert.deepEqual(result.training_set.label_schema.map((label) => label.class_id), [1, 2]);
  assert.deepEqual(result.training_set.items.map((item) => `${item.annotation_id}:${item.class_id}:${item.class_name}`), [
    "ann_image-1_class_1:1:crack",
    "ann_image-1_class_2:2:scratch",
  ]);
  assert.equal(result.training_set.items[0].source_mask_path, "masks/image-1_class_1_crack_mask.png");
  assert.match(result.training_set.items[0].mask_path, /class_1_crack_frame_mask\.png$/);
});

test("assigns deterministic train val test splits from seed", () => {
  const images = Array.from({ length: 10 }, (_, index) => exportableImage(`image-${index + 1}`, `frame-${index + 1}.png`));
  const first = createTrainingSetManifest([
    { project_id: "project-a", task_id: "crack", version_id: "v1", images },
  ], {
    now: NOW,
    split: { train: 0.6, val: 0.2, test: 0.2, seed: 7 },
  });
  const second = createTrainingSetManifest([
    { project_id: "project-a", task_id: "crack", version_id: "v1", images },
  ], {
    now: NOW,
    split: { train: 0.6, val: 0.2, test: 0.2, seed: 7 },
  });

  assert.deepEqual(first.training_set.split_counts, { train: 6, val: 2, test: 2 });
  assert.deepEqual(
    first.training_set.items.map((item) => `${item.image_id}:${item.split}`),
    second.training_set.items.map((item) => `${item.image_id}:${item.split}`),
  );
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
