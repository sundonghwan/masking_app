import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LABEL_SCHEMA,
  labelByClassId,
  normalizeLabelSchema,
  validateClassId,
} from "../src/annotations/labels.js";

test("default label schema exposes stable class ids names and colors", () => {
  assert.deepEqual(
    DEFAULT_LABEL_SCHEMA.map((label) => label.class_id),
    [1, 2, 3],
  );
  assert.equal(DEFAULT_LABEL_SCHEMA[0].name, "target");
  assert.match(DEFAULT_LABEL_SCHEMA[0].color, /^#[0-9A-F]{6}$/u);
});

test("normalizes label schemas without losing class identity", () => {
  const labels = normalizeLabelSchema([
    { classId: "2", name: "scratch", color: "#123abc" },
    { class_id: 1, class_name: "crack", enabled: false },
  ]);

  assert.deepEqual(
    labels.map((label) => [label.class_id, label.name, label.enabled]),
    [
      [1, "crack", false],
      [2, "scratch", true],
    ],
  );
  assert.equal(labels[1].color, "#123ABC");
});

test("invalid or empty label schemas fall back to defaults", () => {
  assert.deepEqual(normalizeLabelSchema([]), DEFAULT_LABEL_SCHEMA);
  assert.deepEqual(normalizeLabelSchema([{ class_id: 0, name: "" }]), DEFAULT_LABEL_SCHEMA);
});

test("class id lookup and validation reject disabled or unknown labels", () => {
  const labels = normalizeLabelSchema([
    { class_id: 4, name: "bolt" },
    { class_id: 5, name: "ignored", enabled: false },
  ]);

  assert.equal(labelByClassId(labels, 4).name, "bolt");
  assert.equal(labelByClassId(labels, "5").enabled, false);
  assert.equal(validateClassId(labels, 4).valid, true);
  assert.equal(validateClassId(labels, 5).valid, false);
  assert.equal(validateClassId(labels, 99).reason, "unknown_class_id");
});
