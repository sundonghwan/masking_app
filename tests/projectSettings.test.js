import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectSettingsUpdate } from "../src/server/projectSettings.js";

test("buildProjectSettingsUpdate merges only provided settings and increments revision", () => {
  const manifest = {
    project_id: "project-1",
    name: "Original",
    description: "Keep me",
    upload_policy: { maxBytes: 1000, allowedMimeTypes: ["image/png"] },
    magic_tool_preset: { colorTolerance: 20, edgeThreshold: 30, maxPixels: 1000, smoothIterations: 1 },
    label_schema: [{ class_id: 1, name: "old", color: "#111111", enabled: true }],
    revision: 4,
    updated_at: "2026-05-12T00:00:00.000Z",
  };

  const updated = buildProjectSettingsUpdate({
    projectId: "project-1",
    manifest,
    body: {
      projectName: " Renamed ",
      magicToolPreset: { edgeThreshold: 88 },
    },
    now: "2026-05-13T00:00:00.000Z",
  });

  assert.equal(updated.name, "Renamed");
  assert.equal(updated.description, "Keep me");
  assert.deepEqual(updated.upload_policy, manifest.upload_policy);
  assert.deepEqual(updated.magic_tool_preset, {
    colorTolerance: 20,
    edgeThreshold: 88,
    maxPixels: 1000,
    smoothIterations: 1,
  });
  assert.deepEqual(updated.label_schema, manifest.label_schema);
  assert.equal(updated.revision, 5);
  assert.equal(updated.updated_at, "2026-05-13T00:00:00.000Z");
});

test("buildProjectSettingsUpdate normalizes upload policy and label schema fields", () => {
  const updated = buildProjectSettingsUpdate({
    projectId: "project-1",
    manifest: {
      project_id: "project-1",
      name: "Original",
      revision: 1,
    },
    body: {
      description: "  Updated description  ",
      uploadPolicy: { maxFileBytes: "2048", allowedMimeTypes: ["image/png", "image/jpeg"] },
      labelSchema: [{ class_id: "7", name: "bolt", color: "#ff0000", enabled: true }],
    },
    now: "2026-05-13T00:00:00.000Z",
  });

  assert.equal(updated.description, "Updated description");
  assert.equal(updated.upload_policy.maxFileBytes, 2048);
  assert.deepEqual(updated.upload_policy.allowedMimeTypes, ["image/png", "image/jpeg"]);
  assert.equal(updated.label_schema[0].class_id, 7);
  assert.equal(updated.label_schema[0].name, "bolt");
  assert.equal(updated.revision, 2);
});
