import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnnotations,
  createImageRecord,
  createProjectRecord,
  serializeJson,
  validateExportItem,
} from "../src/export/exporter.js";

const NOW = "2026-04-29T03:00:00.000Z";

function createRestoredSubmittedRecord(overrides = {}) {
  return createImageRecord(
    {
      id: "image-0001",
      projectId: "mask_project_001",
      originalFileName: "rail crack 001.png",
      imagePath: "images/rail_crack_001.png",
      maskPath: "masks/rail_crack_001_mask.png",
      width: 1280,
      height: 720,
      maskWidth: 1280,
      maskHeight: 720,
      maskValuesValid: true,
      maskRatio: 0.14,
      status: "submitted",
      submittedAt: NOW,
      ...overrides,
    },
    { now: NOW },
  );
}

test("image records can be serialized without File objects or object URLs", () => {
  const record = createRestoredSubmittedRecord();

  assert.equal(record.object_url, "");
  assert.equal(Object.hasOwn(record, "file"), false);

  const serialized = serializeJson(record);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.id, "image-0001");
  assert.equal(parsed.image_path, "images/rail_crack_001.png");
  assert.equal(parsed.current_mask_path, "masks/rail_crack_001_mask.png");
  assert.equal(parsed.object_url, "");
  assert.equal(Object.hasOwn(parsed, "file"), false);
  assert.equal(serialized.includes("blob:"), false);
});

test("restored image metadata can be rehydrated with object URLs outside persistence", () => {
  const persisted = JSON.parse(serializeJson(createRestoredSubmittedRecord()));

  const rehydrated = createImageRecord(
    {
      ...persisted,
      objectUrl: "blob:rehydrated-image",
    },
    { now: NOW },
  );

  assert.equal(persisted.object_url, "");
  assert.equal(rehydrated.object_url, "blob:rehydrated-image");
  assert.equal(rehydrated.image_path, "images/rail_crack_001.png");
  assert.equal(rehydrated.current_mask_path, "masks/rail_crack_001_mask.png");
});

test("export validation accepts restored submitted records without runtime handles", () => {
  const project = createProjectRecord({ id: "mask_project_001", name: "Rail Masks" }, { now: NOW });
  const restored = JSON.parse(serializeJson(createRestoredSubmittedRecord()));

  const validation = validateExportItem(restored);
  const annotations = buildAnnotations({
    projectId: project.id,
    images: [restored],
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.reasons, []);
  assert.equal(validation.checks.notEmpty, true);
  assert.equal(validation.checks.pixelValues, true);
  assert.deepEqual(annotations.annotations, [
    {
      image_id: "image-0001",
      original_file_name: "rail crack 001.png",
      image_path: "images/rail_crack_001.png",
      mask_path: "masks/rail_crack_001_mask.png",
      width: 1280,
      height: 720,
      status: "submitted",
      submitted_at: NOW,
    },
  ]);
});
