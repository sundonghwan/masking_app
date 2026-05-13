import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { profileCapacity, writeCapacityProfileOutput } from "../scripts/harness/capacity-profile.mjs";

test("capacity profile summarizes image mask and manifest bytes", async () => {
  const rootDir = await createCapacityFixture();

  const result = await profileCapacity({ dataRoot: rootDir });

  assert.equal(result.ok, true);
  assert.equal(result.counts.manifests, 1);
  assert.equal(result.counts.images, 1);
  assert.equal(result.counts.masks, 1);
  assert.equal(result.bytes.total > 0, true);
  assert.equal(result.largest_manifest.path, path.join("project-a", "manifest.json"));
});

test("capacity profile strict mode fails on configured warning thresholds", async () => {
  const rootDir = await createCapacityFixture();

  const result = await profileCapacity({
    dataRoot: rootDir,
    strict: true,
    limits: {
      manifestBytesWarn: 1,
      totalBytesWarn: 1,
      imageCountWarn: 0,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "manifest_large"), true);
  assert.equal(result.errors.some((error) => error.code === "data_root_large"), true);
  assert.equal(result.errors.some((error) => error.code === "image_count_large"), true);
});

test("capacity profile output writes pretty JSON evidence", async () => {
  const rootDir = await createCapacityFixture();
  const outputPath = path.join(rootDir, "artifacts", "capacity-profile.json");
  const result = await profileCapacity({ dataRoot: rootDir });

  await writeCapacityProfileOutput(result, outputPath);

  const payload = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(payload.ok, true);
  assert.equal(payload.data_root, rootDir);
  assert.equal(payload.counts.images, 1);
});

async function createCapacityFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-capacity-profile-test-"));
  const projectRoot = path.join(rootDir, "project-a");
  await mkdir(path.join(projectRoot, "images"), { recursive: true });
  await mkdir(path.join(projectRoot, "masks"), { recursive: true });
  await writeFile(path.join(projectRoot, "manifest.json"), JSON.stringify({ project_id: "project-a", images: [] }));
  await writeFile(path.join(projectRoot, "images", "image-a.png"), "image-bytes");
  await writeFile(path.join(projectRoot, "masks", "mask-a.png"), "mask-bytes");
  return rootDir;
}
