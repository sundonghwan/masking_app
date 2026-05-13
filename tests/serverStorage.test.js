import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  clearStorageForTests,
  createFileStorage,
  decodeMaskDataUrl,
  ensureProject,
  listProjectFiles,
  listProjects,
  listProjectTasks,
  listTaskVersions,
  listTrainingSets,
  cloneVersionManifest,
  archiveProject,
  archiveTrainingSet,
  purgeSoftDeletedVersionFiles,
  purgeProject,
  readProjectManifest,
  readTrainingSetManifest,
  restoreProject,
  restoreTrainingSet,
  writeMaskBuffer,
  writeImageFromDataUrl,
  writeMaskFromDataUrl,
  writeProjectManifest,
  writeTrainingSetManifest,
  updateProjectManifest,
  softDeleteProjectImage,
  restoreProjectImage,
  softDeleteVersionManifest,
  restoreVersionManifest,
} from "../src/server/storage.js";

const PNG_DATA_URL = "data:image/png;base64,cG5nLWJ5dGVz";
const JPEG_DATA_URL = "data:image/jpeg;base64,anBlZy1ieXRlcw==";

test("ensures project storage folders under a configurable data root", async () => {
  const { storage, rootDir } = await createTempStorage();

  const project = await storage.ensureProject(" ../Rail Project ");

  assert.equal(project.project_id, "Rail_Project");
  assert.equal(project.name, "Rail_Project");
  await assertStatDirectory(path.join(rootDir, "Rail_Project", "images"));
  await assertStatDirectory(path.join(rootDir, "Rail_Project", "masks"));
  await assertStatDirectory(path.join(rootDir, "Rail_Project", "exports"));
});

test("writes image data URLs with sanitized archive-relative paths", async () => {
  const { storage, rootDir } = await createTempStorage();

  const image = await storage.writeImageFromDataUrl(
    "../project-1",
    "../image 1",
    "../../raw image.jpeg",
    JPEG_DATA_URL,
  );

  assert.equal(image.mimeType, "image/jpeg");
  assert.equal(image.relativePath, "images/image_1_raw_image.jpeg");
  assert.equal(image.archivePath, "images/image_1_raw_image.jpeg");
  assert.equal(await readFile(image.path, "utf8"), "jpeg-bytes");
  assertStoragePath(rootDir, image.path);
});

test("writes mask PNG data URLs into masks with deterministic names", async () => {
  const { storage, rootDir } = await createTempStorage();

  const mask = await storage.writeMaskFromDataUrl("project-1", " image/1 ", PNG_DATA_URL);

  assert.equal(mask.mimeType, "image/png");
  assert.equal(mask.relativePath, "masks/image_1_mask.png");
  assert.equal(mask.archivePath, "masks/image_1_mask.png");
  assert.equal(await readFile(mask.path, "utf8"), "png-bytes");
  assertStoragePath(rootDir, mask.path);
});

test("writes decoded mask buffers after validation", async () => {
  const { storage, rootDir } = await createTempStorage();
  const decoded = storage.decodeMaskDataUrl(PNG_DATA_URL);

  const mask = await storage.writeMaskBuffer("project-1", "image-1", decoded.buffer, { mimeType: decoded.mimeType });

  assert.equal(mask.mimeType, "image/png");
  assert.equal(mask.relativePath, "masks/image-1_mask.png");
  assert.equal(await readFile(mask.path, "utf8"), "png-bytes");
  assertStoragePath(rootDir, mask.path);
});

test("reads and writes manifests without mutating archive-relative paths", async () => {
  const { storage } = await createTempStorage();
  const manifest = {
    project_id: "project-1",
    images: [
      {
        id: "image-1",
        image_path: "images/image-1.png",
        mask_path: "masks/image-1_mask.png",
      },
    ],
  };

  const writeResult = await storage.writeProjectManifest("project-1", manifest);
  const loaded = await storage.readProjectManifest("project-1");

  assert.equal(writeResult.project_id, "project-1");
  assert.deepEqual(loaded, manifest);
});

test("lists project files as sorted project-relative archive paths", async () => {
  const { storage } = await createTempStorage();

  await storage.writeMaskFromDataUrl("project-1", "image-1", PNG_DATA_URL);
  await storage.writeImageFromDataUrl("project-1", "image-1", "raw image.png", PNG_DATA_URL);
  await storage.writeProjectManifest("project-1", { id: "project-1" });

  assert.deepEqual(
    (await storage.listProjectFiles("project-1")).map((file) => file.path),
    ["images/image-1_raw_image.png", "manifest.json", "masks/image-1_mask.png"],
  );
});

test("lists project summaries from manifests", async () => {
  const { storage } = await createTempStorage();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.writeProjectManifest("project-1", {
    project_id: "project-1",
    name: "Project 1",
    images: [
      { id: "submitted", status: "submitted" },
      { id: "approved", status: "approved" },
      { id: "rejected", status: "rejected" },
      { id: "deleted-submitted", status: "submitted", deleted_at: "2026-04-30T00:00:00.000Z" },
    ],
    created_at: "2026-04-29T00:00:00.000Z",
    updated_at: "2026-04-29T00:00:00.000Z",
  });

  const projects = await storage.listProjects();

  assert.equal(projects.length, 1);
  assert.equal(projects[0].project_id, "project-1");
  assert.equal(projects[0].total_images, 3);
  assert.equal(projects[0].submitted_images, 1);
  assert.equal(projects[0].approved_images, 1);
  assert.equal(projects[0].rejected_images, 1);
});

test("repairs legacy project manifests with preview and apply modes", async () => {
  const { storage } = await createTempStorage();
  await storage.writeProjectManifest("legacy project", {
    id: "legacy project",
    name: "",
    images: [
      {
        id: "image 1",
        fileName: "frame.png",
        maskPath: "masks/image_1_mask.png",
        maskRatio: 0.25,
      },
      null,
      {
        id: "../bad image",
        image_path: "images/bad.png",
        maskPath: "../escape.png",
        deletedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
  });

  const preview = await storage.repairProjectManifest("legacy project", { apply: false });
  assert.equal(preview.applied, false);
  assert.equal(preview.change_count > 0, true);
  assert.equal(preview.manifest.project_id, "legacy_project");
  assert.equal(preview.manifest.name, "legacy_project");
  assert.equal(preview.manifest.images.length, 2);
  assert.equal(preview.manifest.images[0].id, "image_1");
  assert.equal(preview.manifest.images[0].original_file_name, "frame.png");
  assert.equal(preview.manifest.images[0].current_mask_path, "masks/image_1_mask.png");
  assert.equal(preview.manifest.images[1].id, "bad_image");
  assert.equal(preview.manifest.images[1].current_mask_path, "");
  assert.equal(preview.manifest.images[1].mask_path, "");
  assert.equal(Object.hasOwn(preview.manifest.images[1], "maskPath"), false);

  const unchanged = await storage.readProjectManifest("legacy project");
  assert.equal(unchanged.id, "legacy project");

  const applied = await storage.repairProjectManifest("legacy project", { apply: true });
  assert.equal(applied.applied, true);
  assert.equal(applied.manifest.repair_history.length, 1);
  const repaired = await storage.readProjectManifest("legacy project");
  assert.equal(repaired.project_id, "legacy_project");
  assert.equal(repaired.images.length, 2);
  assert.equal(repaired.images[0].mask_ratio, 0.25);
});

test("repairs project manifests by adding orphan image files", async () => {
  const { storage } = await createTempStorage();
  await storage.ensureProject("project-1");
  await storage.writeProjectManifest("project-1", {
    project_id: "project-1",
    name: "Project 1",
    images: [],
  });
  await storage.writeImageBuffer(
    "project-1",
    "image_0001",
    "image_0001_frame_0001.png",
    createPngHeader({ width: 13, height: 7 }),
    { mimeType: "image/png" },
  );

  const preview = await storage.repairProjectManifest("project-1", { apply: false });
  assert.equal(preview.applied, false);
  assert.equal(preview.manifest.images.length, 1);
  assert.equal(preview.manifest.images[0].id, "image_0001");
  assert.equal(preview.manifest.images[0].image_path, "images/image_0001_frame_0001.png");
  assert.equal(preview.manifest.images[0].width, 13);
  assert.equal(preview.manifest.images[0].height, 7);
  assert.equal(preview.changes.some((change) => change.action === "add_orphan_image_file"), true);

  const unchanged = await storage.readProjectManifest("project-1");
  assert.equal(unchanged.images.length, 0);

  const applied = await storage.repairProjectManifest("project-1", { apply: true });
  assert.equal(applied.applied, true);
  const repaired = await storage.readProjectManifest("project-1");
  assert.equal(repaired.images.length, 1);
  assert.equal(repaired.images[0].original_file_name, "frame_0001.png");
});

test("updates archives restores and purges project manifests", async () => {
  const { storage, rootDir } = await createTempStorage();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.writeProjectManifest("project-1", {
    ...(await storage.readProjectManifest("project-1")),
    revision: 1,
    images: [{ id: "image-1", status: "submitted" }],
  });

  const updated = await storage.updateProjectManifest("project-1", {
    name: "Project Updated",
    description: "night batch",
    now: "2026-04-30T01:00:00.000Z",
  });
  assert.equal(updated.name, "Project Updated");
  assert.equal(updated.description, "night batch");
  assert.equal(updated.revision, 2);

  const archived = await storage.archiveProject("project-1", {
    deletedBy: "admin",
    reason: "wrong_project",
    now: "2026-04-30T02:00:00.000Z",
  });
  assert.equal(archived.deleted_by, "admin");
  assert.equal(archived.delete_reason, "wrong_project");
  assert.equal((await storage.listProjects()).length, 0);
  assert.equal((await storage.listProjects({ includeDeleted: true }))[0].deleted_at, "2026-04-30T02:00:00.000Z");

  const restored = await storage.restoreProject("project-1", { now: "2026-04-30T03:00:00.000Z" });
  assert.equal(restored.deleted_at, "");
  assert.equal((await storage.listProjects()).length, 1);

  await storage.archiveProject("project-1", { deletedBy: "admin", reason: "cleanup" });
  await storage.purgeProject("project-1");
  assert.equal(await storage.readProjectManifest("project-1"), null);
  await assert.rejects(
    () => stat(path.join(rootDir, "project-1")),
    /ENOENT/,
  );
});

test("writes lists archives and restores training set manifests", async () => {
  const { storage, rootDir } = await createTempStorage();
  const manifest = {
    training_set_id: "rail-crack-v1",
    name: "Rail Crack v1",
    description: "approved masks",
    approved_only: true,
    split: { train: 0.8, val: 0.1, test: 0.1, seed: 42 },
    sources: [{ project_id: "project-1", task_id: "task-1", version_id: "v1" }],
    training_set: {
      training_set_id: "rail-crack-v1",
      total_sources: 1,
      total_items: 2,
      split_counts: { train: 2, val: 0, test: 0 },
      items: [],
    },
    source_versions: {
      sources: [{ project_id: "project-1", task_id: "task-1", version_id: "v1" }],
    },
    created_by: "reviewer",
    created_at: "2026-04-30T00:00:00.000Z",
    updated_at: "2026-04-30T00:00:00.000Z",
    revision: 1,
  };

  await storage.writeTrainingSetManifest("rail crack v1", manifest);

  const loaded = await storage.readTrainingSetManifest("rail crack v1");
  assert.equal(loaded.training_set_id, "rail_crack_v1");
  assert.equal(await readFile(path.join(rootDir, "training_sets", "rail_crack_v1", "training_set.json"), "utf8").then((text) => JSON.parse(text).total_items), 2);
  assert.equal((await storage.listTrainingSets())[0].total_items, 2);

  const archived = await storage.archiveTrainingSet("rail crack v1", {
    deletedBy: "admin",
    reason: "bad split",
    now: "2026-04-30T01:00:00.000Z",
  });
  assert.equal(archived.deleted_by, "admin");
  assert.equal((await storage.listTrainingSets()).length, 0);
  assert.equal((await storage.listTrainingSets({ includeDeleted: true }))[0].deleted_at, "2026-04-30T01:00:00.000Z");

  const restored = await storage.restoreTrainingSet("rail crack v1", { now: "2026-04-30T02:00:00.000Z" });
  assert.equal(restored.deleted_at, "");
  assert.equal((await storage.listTrainingSets()).length, 1);
});

test("returns null or empty lists for missing project manifest and files", async () => {
  const { storage } = await createTempStorage();

  assert.equal(await storage.readProjectManifest("missing"), null);
  assert.deepEqual(await storage.listProjectFiles("missing"), []);
});

test("rejects malformed payloads and mask MIME mismatches", async () => {
  const { storage } = await createTempStorage();

  await assert.rejects(
    () => storage.writeImageFromDataUrl("project-1", "image-1", "raw.png", "not-a-data-url"),
    /image data URL is invalid/,
  );
  await assert.rejects(
    () => storage.writeMaskFromDataUrl("project-1", "image-1", JPEG_DATA_URL),
    /mask data URL must use image\/png/,
  );
  await assert.rejects(
    () => storage.writeImageFromDataUrl("", "image-1", "raw.png", PNG_DATA_URL),
    /projectId is required/,
  );
});

test("clears only the configured test storage root", async () => {
  const { storage, rootDir } = await createTempStorage();
  await storage.writeImageFromDataUrl("project-1", "image-1", "raw.png", PNG_DATA_URL);

  await storage.clearStorageForTests();

  await assert.rejects(() => stat(rootDir), { code: "ENOENT" });
});

test("module-level default APIs are exported for server integration", () => {
  assert.equal(typeof createFileStorage, "function");
  assert.equal(typeof ensureProject, "function");
  assert.equal(typeof writeImageFromDataUrl, "function");
  assert.equal(typeof writeMaskFromDataUrl, "function");
  assert.equal(typeof decodeMaskDataUrl, "function");
  assert.equal(typeof writeMaskBuffer, "function");
  assert.equal(typeof readProjectManifest, "function");
  assert.equal(typeof writeProjectManifest, "function");
  assert.equal(typeof updateProjectManifest, "function");
  assert.equal(typeof archiveProject, "function");
  assert.equal(typeof restoreProject, "function");
  assert.equal(typeof purgeProject, "function");
  assert.equal(typeof softDeleteProjectImage, "function");
  assert.equal(typeof restoreProjectImage, "function");
  assert.equal(typeof cloneVersionManifest, "function");
  assert.equal(typeof softDeleteVersionManifest, "function");
  assert.equal(typeof restoreVersionManifest, "function");
  assert.equal(typeof purgeSoftDeletedVersionFiles, "function");
  assert.equal(typeof listProjectTasks, "function");
  assert.equal(typeof listTaskVersions, "function");
  assert.equal(typeof writeTrainingSetManifest, "function");
  assert.equal(typeof readTrainingSetManifest, "function");
  assert.equal(typeof listTrainingSets, "function");
  assert.equal(typeof archiveTrainingSet, "function");
  assert.equal(typeof restoreTrainingSet, "function");
  assert.equal(typeof listProjectFiles, "function");
  assert.equal(typeof listProjects, "function");
  assert.equal(typeof clearStorageForTests, "function");
});

test("soft deletes and restores legacy project image metadata without moving files", async () => {
  const { storage, rootDir } = await createTempStorage();
  await storage.ensureProject("project-1", { name: "Project 1" });
  const image = await storage.writeImageFromDataUrl("project-1", "image-1", "raw.png", PNG_DATA_URL);
  const mask = await storage.writeMaskFromDataUrl("project-1", "image-1", PNG_DATA_URL);
  await storage.writeProjectManifest("project-1", {
    project_id: "project-1",
    images: [
      {
        id: "image-1",
        image_path: image.relativePath,
        current_mask_path: mask.relativePath,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
      },
    ],
  });

  const deleted = await storage.softDeleteProjectImage("project-1", "image-1", {
    deletedBy: "worker",
    reason: "wrong frame",
    now: "2026-04-30T01:00:00.000Z",
  });

  assert.equal(deleted.deleted_at, "2026-04-30T01:00:00.000Z");
  assert.equal(deleted.deleted_by, "worker");
  assert.equal(deleted.delete_reason, "wrong frame");
  assert.equal(deleted.image_path, image.relativePath);
  assert.equal(deleted.current_mask_path, mask.relativePath);
  assert.equal(await readFile(image.path, "utf8"), "png-bytes");
  assert.equal(await readFile(mask.path, "utf8"), "png-bytes");
  assertStoragePath(rootDir, image.path);
  assertStoragePath(rootDir, mask.path);

  const restored = await storage.restoreProjectImage("project-1", "image-1", {
    now: "2026-04-30T01:10:00.000Z",
  });

  assert.equal(restored.deleted_at, "");
  assert.equal(restored.deleted_by, "");
  assert.equal(restored.delete_reason, "");
  assert.equal(restored.updated_at, "2026-04-30T01:10:00.000Z");
  assert.equal(await readFile(image.path, "utf8"), "png-bytes");
  assert.equal(await readFile(mask.path, "utf8"), "png-bytes");
});

test("ensures project task and version metadata in hierarchical storage", async () => {
  const { storage, rootDir } = await createTempStorage();

  const project = await storage.ensureProjectMetadata(" ../Rail Project ", {
    name: "Rail Dataset",
    description: "Binary masks",
    createdBy: "admin",
    now: "2026-04-30T00:00:00.000Z",
  });
  const task = await storage.ensureTaskMetadata("Rail Project", " crack masking ", {
    name: "Crack Masking",
    createdBy: "lead",
    now: "2026-04-30T00:00:01.000Z",
  });
  const manifest = await storage.ensureVersionManifest("Rail Project", "crack masking", " v1 ", {
    status: "draft",
    createdBy: "worker",
    now: "2026-04-30T00:00:02.000Z",
  });

  assert.equal(project.project_id, "Rail_Project");
  assert.equal(project.name, "Rail Dataset");
  assert.equal(project.created_by, "admin");
  assert.equal(task.project_id, "Rail_Project");
  assert.equal(task.task_id, "crack_masking");
  assert.equal(task.current_version, "v1");
  assert.equal(manifest.project_id, "Rail_Project");
  assert.equal(manifest.task_id, "crack_masking");
  assert.equal(manifest.version_id, "v1");
  assert.equal(manifest.status, "draft");
  assert.deepEqual(manifest.images, []);

  await assertStatDirectory(path.join(rootDir, "projects", "Rail_Project", "tasks", "crack_masking", "versions", "v1", "images"));
  await assertStatDirectory(path.join(rootDir, "projects", "Rail_Project", "tasks", "crack_masking", "versions", "v1", "masks"));
  await assertStatDirectory(path.join(rootDir, "projects", "Rail_Project", "tasks", "crack_masking", "versions", "v1", "exports"));
  await assertStatDirectory(path.join(rootDir, "projects", "Rail_Project", "tasks", "crack_masking", "versions", "v1", "trash", "images"));
  await assertStatDirectory(path.join(rootDir, "projects", "Rail_Project", "tasks", "crack_masking", "versions", "v1", "trash", "masks"));

  assert.deepEqual(JSON.parse(await readFile(path.join(rootDir, "projects", "Rail_Project", "project.json"), "utf8")), project);
  assert.deepEqual(JSON.parse(await readFile(path.join(rootDir, "projects", "Rail_Project", "tasks", "crack_masking", "task.json"), "utf8")), task);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(rootDir, "projects", "Rail_Project", "tasks", "crack_masking", "versions", "v1", "manifest.json"),
        "utf8",
      ),
    ),
    manifest,
  );
});

test("writes version image and mask files with version-root relative paths", async () => {
  const { storage, rootDir } = await createTempStorage();

  const image = await storage.writeVersionImageBuffer(
    "project-1",
    "task-1",
    "v1",
    "image 1",
    "../../frame 001.jpg",
    Buffer.from("image-bytes"),
    { mimeType: "image/jpeg" },
  );
  const mask = await storage.writeVersionMaskBuffer(
    "project-1",
    "task-1",
    "v1",
    "image 1",
    Buffer.from("mask-bytes"),
  );

  assert.equal(image.relativePath, "images/image_1_frame_001.jpg");
  assert.equal(image.archivePath, "images/image_1_frame_001.jpg");
  assert.equal(mask.relativePath, "masks/image_1_mask.png");
  assert.equal(mask.archivePath, "masks/image_1_mask.png");
  assert.equal(path.isAbsolute(image.relativePath), false);
  assert.equal(path.isAbsolute(mask.relativePath), false);
  assertStoragePath(rootDir, image.path);
  assertStoragePath(rootDir, mask.path);
  assert.equal(await readFile(image.path, "utf8"), "image-bytes");
  assert.equal(await readFile(mask.path, "utf8"), "mask-bytes");
});

test("keeps existing flat project manifest compatibility", async () => {
  const { storage, rootDir } = await createTempStorage();
  const manifest = {
    project_id: "legacy-project",
    name: "Legacy Project",
    images: [{ id: "legacy-image", image_path: "images/legacy.png" }],
  };

  await storage.writeProjectManifest("legacy-project", manifest);
  await storage.ensureVersionManifest("new-project", "default_task", "v1");

  assert.deepEqual(await storage.readProjectManifest("legacy-project"), manifest);
  assert.equal(await storage.readVersionManifest("legacy-project", "default_task", "v1"), null);
  await assertStatDirectory(path.join(rootDir, "legacy-project", "images"));
});

test("lists task and version metadata summaries from hierarchy", async () => {
  const { storage } = await createTempStorage();

  await storage.ensureTaskMetadata("project-1", "task-old", {
    name: "Old Task",
    now: "2026-04-30T00:00:00.000Z",
  });
  await storage.ensureVersionManifest("project-1", "task-old", "v1", {
    status: "approved",
    now: "2026-04-30T00:00:01.000Z",
    images: [{ id: "image-1", status: "approved" }],
  });
  await storage.ensureTaskMetadata("project-1", "task-new", {
    name: "New Task",
    now: "2026-04-30T01:00:00.000Z",
  });
  await storage.ensureVersionManifest("project-1", "task-new", "v2", {
    status: "in_progress",
    now: "2026-04-30T01:00:01.000Z",
    images: [{ id: "image-2", status: "submitted" }, { id: "image-3", deleted_at: "2026-04-30T01:05:00.000Z" }],
  });

  const tasks = await storage.listProjectTasks("project-1");
  const versions = await storage.listTaskVersions("project-1", "task-new");

  assert.deepEqual(tasks.map((task) => task.task_id), ["task-new", "task-old"]);
  assert.equal(tasks[0].name, "New Task");
  assert.equal(tasks[0].current_version, "v1");
  assert.deepEqual(versions.map((version) => version.version_id), ["v2"]);
  assert.equal(versions[0].status, "in_progress");
  assert.equal(versions[0].total_images, 2);
  assert.equal(versions[0].active_images, 1);
  assert.equal(versions[0].submitted_images, 1);
});

test("soft deletes and restores version image files without changing original relative paths", async () => {
  const { storage, rootDir } = await createTempStorage();
  await storage.ensureVersionManifest("project-1", "task-1", "v1", {
    images: [
      {
        id: "image-1",
        image_path: "images/image-1_raw.jpg",
        current_mask_path: "masks/image-1_mask.png",
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
      },
    ],
  });
  const image = await storage.writeVersionImageBuffer(
    "project-1",
    "task-1",
    "v1",
    "image-1",
    "raw.jpg",
    Buffer.from("image"),
  );
  const mask = await storage.writeVersionMaskBuffer("project-1", "task-1", "v1", "image-1", Buffer.from("mask"));

  const deleted = await storage.softDeleteVersionImage("project-1", "task-1", "v1", "image-1", {
    deletedBy: "admin",
    reason: "wrong upload",
    now: "2026-04-30T01:00:00.000Z",
  });

  assert.equal(deleted.image_path, "images/image-1_raw.jpg");
  assert.equal(deleted.current_mask_path, "masks/image-1_mask.png");
  assert.equal(deleted.deleted_by, "admin");
  assert.equal(deleted.delete_reason, "wrong upload");
  assert.equal(deleted.deleted_at, "2026-04-30T01:00:00.000Z");
  await assert.rejects(() => stat(image.path), { code: "ENOENT" });
  await assert.rejects(() => stat(mask.path), { code: "ENOENT" });
  assert.equal(
    await readFile(
      path.join(
        rootDir,
        "projects",
        "project-1",
        "tasks",
        "task-1",
        "versions",
        "v1",
        "trash",
        "images",
        "image-1_raw.jpg",
      ),
      "utf8",
    ),
    "image",
  );

  const restored = await storage.restoreVersionImage("project-1", "task-1", "v1", "image-1", {
    now: "2026-04-30T01:10:00.000Z",
  });

  assert.equal(restored.deleted_at, "");
  assert.equal(restored.deleted_by, "");
  assert.equal(restored.delete_reason, "");
  assert.equal(restored.image_path, "images/image-1_raw.jpg");
  assert.equal(restored.current_mask_path, "masks/image-1_mask.png");
  assert.equal(restored.updated_at, "2026-04-30T01:10:00.000Z");
  assert.equal(await readFile(image.path, "utf8"), "image");
  assert.equal(await readFile(mask.path, "utf8"), "mask");
});

test("soft delete refuses to overwrite an existing trash file", async () => {
  const { storage, rootDir } = await createTempStorage();
  await storage.ensureVersionManifest("project-1", "task-1", "v1", {
    images: [
      {
        id: "image-1",
        image_path: "images/image-1_raw.jpg",
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
      },
    ],
  });
  await storage.writeVersionImageBuffer("project-1", "task-1", "v1", "image-1", "raw.jpg", Buffer.from("image"));
  const existingTrashPath = path.join(
    rootDir,
    "projects",
    "project-1",
    "tasks",
    "task-1",
    "versions",
    "v1",
    "trash",
    "images",
    "image-1_raw.jpg",
  );
  await mkdir(path.dirname(existingTrashPath), { recursive: true });
  await writeFile(existingTrashPath, "trash");

  await assert.rejects(
    () => storage.softDeleteVersionImage("project-1", "task-1", "v1", "image-1"),
    /Destination file already exists/,
  );
});

test("clones a version manifest with preserved relative paths and new version metadata", async () => {
  const { storage, rootDir } = await createTempStorage();
  const sourceImage = await storage.writeVersionImageBuffer(
    "project-1",
    "task-1",
    "v1",
    "image-1",
    "raw.jpg",
    Buffer.from("source-image"),
  );
  const sourceMask = await storage.writeVersionMaskBuffer(
    "project-1",
    "task-1",
    "v1",
    "image-1",
    Buffer.from("source-mask"),
  );
  await storage.ensureVersionManifest("project-1", "task-1", "v1", {
    status: "approved",
    now: "2026-04-30T01:00:00.000Z",
    images: [
      {
        id: "image-1",
        image_path: sourceImage.relativePath,
        current_mask_path: sourceMask.relativePath,
        status: "approved",
        worker_id: "worker-a",
        reviewer_id: "reviewer-a",
        created_at: "2026-04-30T01:01:00.000Z",
        updated_at: "2026-04-30T01:02:00.000Z",
      },
    ],
  });

  const cloned = await storage.cloneVersionManifest("project-1", "task-1", "v1", "v2", {
    status: "draft",
    now: "2026-04-30T02:00:00.000Z",
  });

  assert.equal(cloned.project_id, "project-1");
  assert.equal(cloned.task_id, "task-1");
  assert.equal(cloned.version_id, "v2");
  assert.equal(cloned.status, "draft");
  assert.equal(cloned.created_at, "2026-04-30T02:00:00.000Z");
  assert.equal(cloned.updated_at, "2026-04-30T02:00:00.000Z");
  assert.equal(cloned.revision, 1);
  assert.equal(cloned.source_version_id, "v1");
  assert.equal(cloned.images[0].version_id, "v2");
  assert.equal(cloned.images[0].image_path, "images/image-1_raw.jpg");
  assert.equal(cloned.images[0].current_mask_path, "masks/image-1_mask.png");
  assert.equal(cloned.images[0].status, "approved");
  assert.equal(cloned.images[0].worker_id, "worker-a");
  assert.equal(cloned.images[0].reviewer_id, "reviewer-a");
  assert.equal(cloned.images[0].created_at, "2026-04-30T02:00:00.000Z");
  assert.equal(cloned.images[0].updated_at, "2026-04-30T02:00:00.000Z");

  const source = await storage.readVersionManifest("project-1", "task-1", "v1");
  assert.equal(source.version_id, "v1");
  assert.equal(source.images[0].version_id, "v1");
  assert.equal(
    await readFile(
      path.join(rootDir, "projects", "project-1", "tasks", "task-1", "versions", "v2", "images", "image-1_raw.jpg"),
      "utf8",
    ),
    "source-image",
  );
  assert.equal(
    await readFile(
      path.join(rootDir, "projects", "project-1", "tasks", "task-1", "versions", "v2", "masks", "image-1_mask.png"),
      "utf8",
    ),
    "source-mask",
  );
});

test("soft deletes and restores a version manifest without moving files and increments revision", async () => {
  const { storage } = await createTempStorage();
  const image = await storage.writeVersionImageBuffer(
    "project-1",
    "task-1",
    "v1",
    "image-1",
    "raw.jpg",
    Buffer.from("image"),
  );
  const mask = await storage.writeVersionMaskBuffer("project-1", "task-1", "v1", "image-1", Buffer.from("mask"));
  await storage.ensureVersionManifest("project-1", "task-1", "v1", {
    now: "2026-04-30T01:00:00.000Z",
    images: [{ id: "image-1", image_path: image.relativePath, current_mask_path: mask.relativePath }],
  });

  const deleted = await storage.softDeleteVersionManifest("project-1", "task-1", "v1", {
    deletedBy: "lead",
    reason: "bad batch",
    now: "2026-04-30T02:00:00.000Z",
  });

  assert.equal(deleted.deleted_at, "2026-04-30T02:00:00.000Z");
  assert.equal(deleted.deleted_by, "lead");
  assert.equal(deleted.delete_reason, "bad batch");
  assert.equal(deleted.updated_at, "2026-04-30T02:00:00.000Z");
  assert.equal(deleted.revision, 2);
  assert.equal(await readFile(image.path, "utf8"), "image");
  assert.equal(await readFile(mask.path, "utf8"), "mask");

  const restored = await storage.restoreVersionManifest("project-1", "task-1", "v1", {
    now: "2026-04-30T03:00:00.000Z",
  });

  assert.equal(restored.deleted_at, "");
  assert.equal(restored.deleted_by, "");
  assert.equal(restored.delete_reason, "");
  assert.equal(restored.updated_at, "2026-04-30T03:00:00.000Z");
  assert.equal(restored.revision, 3);
  assert.equal(await readFile(image.path, "utf8"), "image");
  assert.equal(await readFile(mask.path, "utf8"), "mask");
});

test("purges only files referenced by soft-deleted version records", async () => {
  const { storage, rootDir } = await createTempStorage();
  const deletedImage = await storage.writeVersionImageBuffer(
    "project-1",
    "task-1",
    "v1",
    "deleted-image",
    "raw.jpg",
    Buffer.from("deleted-image"),
  );
  const deletedMask = await storage.writeVersionMaskBuffer(
    "project-1",
    "task-1",
    "v1",
    "deleted-image",
    Buffer.from("deleted-mask"),
  );
  const activeImage = await storage.writeVersionImageBuffer(
    "project-1",
    "task-1",
    "v1",
    "active-image",
    "raw.jpg",
    Buffer.from("active-image"),
  );
  await storage.ensureVersionManifest("project-1", "task-1", "v1", {
    images: [
      {
        id: "deleted-image",
        image_path: deletedImage.relativePath,
        current_mask_path: deletedMask.relativePath,
        deleted_at: "2026-04-30T01:00:00.000Z",
      },
      {
        id: "active-image",
        image_path: activeImage.relativePath,
        current_mask_path: "masks/missing-active-mask.png",
        deleted_at: "",
      },
    ],
  });

  const result = await storage.purgeSoftDeletedVersionFiles("project-1", "task-1", "v1");

  assert.equal(result.deleted_count, 2);
  assert.equal(result.missing_count, 0);
  assert.deepEqual(result.deleted_paths, ["images/deleted-image_raw.jpg", "masks/deleted-image_mask.png"]);
  await assert.rejects(() => stat(deletedImage.path), { code: "ENOENT" });
  await assert.rejects(() => stat(deletedMask.path), { code: "ENOENT" });
  assert.equal(await readFile(activeImage.path, "utf8"), "active-image");
  await assertStatDirectory(path.join(rootDir, "projects", "project-1", "tasks", "task-1", "versions", "v1", "images"));
  await assertStatDirectory(path.join(rootDir, "projects", "project-1", "tasks", "task-1", "versions", "v1", "masks"));
});

test("purges version files moved to trash by image soft delete", async () => {
  const { storage, rootDir } = await createTempStorage();
  const image = await storage.writeVersionImageBuffer(
    "project-1",
    "task-1",
    "v1",
    "image-1",
    "raw.jpg",
    Buffer.from("image"),
  );
  const mask = await storage.writeVersionMaskBuffer("project-1", "task-1", "v1", "image-1", Buffer.from("mask"));
  await storage.ensureVersionManifest("project-1", "task-1", "v1", {
    images: [{ id: "image-1", image_path: image.relativePath, current_mask_path: mask.relativePath }],
  });
  await storage.softDeleteVersionImage("project-1", "task-1", "v1", "image-1", {
    now: "2026-04-30T01:00:00.000Z",
  });

  const result = await storage.purgeSoftDeletedVersionFiles("project-1", "task-1", "v1");

  assert.equal(result.deleted_count, 2);
  assert.deepEqual(result.deleted_paths, ["trash/images/image-1_raw.jpg", "trash/masks/image-1_mask.png"]);
  await assert.rejects(
    () =>
      stat(
        path.join(
          rootDir,
          "projects",
          "project-1",
          "tasks",
          "task-1",
          "versions",
          "v1",
          "trash",
          "images",
          "image-1_raw.jpg",
        ),
      ),
    { code: "ENOENT" },
  );
  await assert.rejects(
    () =>
      stat(
        path.join(
          rootDir,
          "projects",
          "project-1",
          "tasks",
          "task-1",
          "versions",
          "v1",
          "trash",
          "masks",
          "image-1_mask.png",
        ),
      ),
    { code: "ENOENT" },
  );
});

async function createTempStorage() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-storage-test-"));
  return {
    rootDir,
    storage: createFileStorage({ rootDir }),
  };
}

async function assertStatDirectory(value) {
  const result = await stat(value);
  assert.equal(result.isDirectory(), true);
}

function assertStoragePath(rootDir, value) {
  const relative = path.relative(rootDir, value);
  assert.equal(relative.startsWith(".."), false);
  assert.equal(path.isAbsolute(relative), false);
}

function createPngHeader({ width, height }) {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header.writeUInt8(8, 24);
  header.writeUInt8(6, 25);
  return header;
}
