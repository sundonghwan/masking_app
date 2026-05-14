import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createSourceMigrationPlan,
  discoverFileStorageSources,
  migrateFileStorageToObjectDb,
} from "../src/server/fileStorageObjectDbMigration.js";

test("discovers legacy manifests as default task v1 sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "masking-migration-"));
  await mkdir(path.join(root, "demo", "images"), { recursive: true });
  await writeFile(path.join(root, "demo", "manifest.json"), JSON.stringify({
    project_id: "demo",
    name: "Demo",
    images: [],
  }));

  const sources = await discoverFileStorageSources(root);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].projectId, "demo");
  assert.equal(sources[0].taskId, "default_task");
  assert.equal(sources[0].versionId, "v1");
});

test("prefers legacy image manifests over empty hierarchy mirrors for the same source key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "masking-migration-"));
  await mkdir(path.join(root, "demo", "images"), { recursive: true });
  await mkdir(path.join(root, "projects", "demo", "tasks", "default_task", "versions", "v1"), { recursive: true });
  await writeFile(path.join(root, "demo", "manifest.json"), JSON.stringify({
    project_id: "demo",
    images: [{ id: "image_0001", image_path: "images/a.png", width: 10, height: 20 }],
  }));
  await writeFile(path.join(root, "projects", "demo", "project.json"), JSON.stringify({ project_id: "demo" }));
  await writeFile(path.join(root, "projects", "demo", "tasks", "default_task", "task.json"), JSON.stringify({ task_id: "default_task" }));
  await writeFile(path.join(root, "projects", "demo", "tasks", "default_task", "versions", "v1", "manifest.json"), JSON.stringify({
    project_id: "demo",
    task_id: "default_task",
    version_id: "v1",
    images: [],
  }));

  const sources = await discoverFileStorageSources(root);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].manifest.images.length, 1);
});

test("creates DB rows and object keys for images and class masks", () => {
  const plan = createSourceMigrationPlan({
    projectId: "demo",
    taskId: "task-a",
    versionId: "v2",
    baseDir: "/tmp/demo",
    manifest: {
      project_id: "demo",
      name: "Demo",
      label_schema: [{ class_id: 7, name: "pantograph" }],
      images: [{
        id: "image_0001",
        original_file_name: "a.png",
        image_path: "images/a.png",
        width: 10,
        height: 20,
        class_annotations: [{
          class_id: 7,
          mask_path: "masks/a-class-7.png",
          mask_width: 10,
          mask_height: 20,
          mask_ratio: 0.5,
        }],
      }],
    },
  });

  assert.equal(plan.images[0].object_key, "projects/demo/tasks/task-a/versions/v2/images/a.png");
  assert.equal(plan.annotations[0].class_id, 7);
  assert.equal(plan.annotations[0].mask_object_key, "projects/demo/tasks/task-a/versions/v2/masks/a-class-7.png");
  assert.equal(plan.objects.length, 2);
});

test("creates class masks from current image annotations", () => {
  const plan = createSourceMigrationPlan({
    projectId: "demo",
    taskId: "task-a",
    versionId: "v2",
    baseDir: "/tmp/demo",
    manifest: {
      project_id: "demo",
      name: "Demo",
      label_schema: [
        { class_id: 1, name: "slider" },
        { class_id: 2, name: "support" },
      ],
      images: [{
        id: "image_0001",
        original_file_name: "a.png",
        image_path: "images/a.png",
        width: 10,
        height: 20,
        annotations: [{
          class_id: 2,
          class_name: "support",
          mask_path: "masks/a-class-2.png",
          mask_width: 10,
          mask_height: 20,
          mask_ratio: 0.25,
          source: "manual",
        }],
      }],
    },
  });

  assert.equal(plan.annotations.length, 1);
  assert.equal(plan.annotations[0].class_id, 2);
  assert.equal(plan.annotations[0].class_name, "support");
  assert.equal(plan.annotations[0].mask_object_key, "projects/demo/tasks/task-a/versions/v2/masks/a-class-2.png");
  assert.equal(plan.annotations[0].mask_ratio, 0.25);
  assert.equal(plan.objects.length, 2);
});

test("dry run counts sources without requiring DB or object clients", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "masking-migration-"));
  await mkdir(path.join(root, "demo", "images"), { recursive: true });
  await writeFile(path.join(root, "demo", "images", "a.png"), "image");
  await writeFile(path.join(root, "demo", "manifest.json"), JSON.stringify({
    project_id: "demo",
    images: [{ id: "image_0001", image_path: "images/a.png", width: 10, height: 20 }],
  }));

  const summary = await migrateFileStorageToObjectDb({ rootDir: root, dryRun: true });

  assert.equal(summary.ok, true);
  assert.equal(summary.dry_run, true);
  assert.equal(summary.sources, 1);
  assert.equal(summary.images, 1);
  assert.equal(summary.uploaded_objects, 1);
});
