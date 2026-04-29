import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
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
  readProjectManifest,
  writeMaskBuffer,
  writeImageFromDataUrl,
  writeMaskFromDataUrl,
  writeProjectManifest,
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
  assert.equal(typeof listProjectFiles, "function");
  assert.equal(typeof listProjects, "function");
  assert.equal(typeof clearStorageForTests, "function");
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
