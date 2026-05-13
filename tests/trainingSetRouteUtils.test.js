import assert from "node:assert/strict";
import test from "node:test";

import {
  createTrainingSourceSummary,
  normalizeTrainingSetId,
  normalizeTrainingSourceRef,
  splitListFromManifest,
} from "../src/server/trainingSetRouteUtils.js";

test("normalizes training set ids without allowing path separators", () => {
  assert.equal(normalizeTrainingSetId("  ../Rail Defects / v1!!  "), "Rail_Defects_v1");
  assert.equal(normalizeTrainingSetId("___"), "");
  assert.equal(normalizeTrainingSetId("abc".repeat(60)).length, 120);
});

test("normalizes training source references with legacy fallbacks", () => {
  assert.deepEqual(normalizeTrainingSourceRef({
    projectId: "project-a",
    taskId: "task-a",
    versionId: "v2",
  }), {
    project_id: "project-a",
    task_id: "task-a",
    version_id: "v2",
  });

  assert.deepEqual(normalizeTrainingSourceRef({ project_id: "project-b" }), {
    project_id: "project-b",
    task_id: "legacy_project",
    version_id: "legacy",
  });
});

test("creates training source summaries using active image counts", () => {
  const summary = createTrainingSourceSummary({
    project: { project_id: "project-a", name: "Rail A" },
    task: { task_id: "crack", name: "Crack" },
    version: {
      project_id: "project-a",
      task_id: "crack",
      version_id: "v1",
      status: "ready",
      revision: "3",
      images: [
        { id: "submitted", status: "submitted" },
        { id: "approved", status: "approved" },
        { id: "rejected", status: "rejected" },
        { id: "deleted", status: "approved", deleted_at: "2026-05-13T00:00:00.000Z" },
      ],
    },
  });

  assert.equal(summary.project_name, "Rail A");
  assert.equal(summary.task_name, "Crack");
  assert.equal(summary.revision, 3);
  assert.equal(summary.total_images, 4);
  assert.equal(summary.active_images, 3);
  assert.equal(summary.submitted_images, 1);
  assert.equal(summary.approved_images, 1);
  assert.equal(summary.rejected_images, 1);
});

test("creates split list files with stable trailing newline", () => {
  const manifest = {
    training_set: {
      items: [
        { split: "train", image_path: "images/a.png", mask_path: "masks/a.png" },
        { split: "val", image_path: "images/b.png", mask_path: "masks/b.png" },
        { split: "train", image_path: "images/c.png", mask_path: "masks/c.png" },
      ],
    },
  };

  assert.equal(splitListFromManifest(manifest, "train"), "images/a.png masks/a.png\nimages/c.png masks/c.png\n");
  assert.equal(splitListFromManifest(manifest, "test"), "\n");
});
