import assert from "node:assert/strict";
import test from "node:test";

import {
  annotationMaskBlobKey,
  annotationMaskPath,
  createAnnotationRecord,
  createAnnotationSet,
  migrateLegacyImageAnnotations,
  upsertAnnotationRecord,
} from "../src/annotations/records.js";

const NOW = "2026-05-13T00:00:00.000Z";

test("creates class-labeled binary mask annotation records", () => {
  const annotation = createAnnotationRecord(
    {
      imageId: "image_0001",
      classId: "2",
      maskPath: "tasks/default_task/v1/masks/image_0001_class_2.png",
      maskWidth: "640",
      maskHeight: "480",
      maskRatio: 0.25,
    },
    { now: NOW, className: "scratch" },
  );

  assert.equal(annotation.annotation_id, "ann_image_0001_class_2");
  assert.equal(annotation.class_id, 2);
  assert.equal(annotation.class_name, "scratch");
  assert.equal(annotation.mask_width, 640);
  assert.equal(annotation.mask_height, 480);
  assert.equal(annotation.mask_ratio, 0.25);
  assert.equal(annotation.updated_at, NOW);
});

test("creates deterministic class-aware mask paths and local blob keys", () => {
  assert.equal(
    annotationMaskPath({ imageId: "frame 001", classId: 2, className: "scratch crack" }),
    "masks/frame_001_class_2_scratch_crack_mask.png",
  );
  assert.equal(annotationMaskBlobKey("frame 001", 2), "frame 001::class_2");
});

test("upserts annotations by class id without duplicating class masks", () => {
  const initial = createAnnotationRecord(
    { imageId: "image_0001", classId: 1, maskPath: "old.png" },
    { now: NOW, className: "target" },
  );
  const next = upsertAnnotationRecord([initial], {
    imageId: "image_0001",
    classId: 1,
    className: "target",
    maskPath: "new.png",
    updatedAt: "2026-05-13T01:00:00.000Z",
  });

  assert.equal(next.length, 1);
  assert.equal(next[0].mask_path, "new.png");
  assert.equal(next[0].updated_at, "2026-05-13T01:00:00.000Z");
});

test("creates image annotation sets sorted by class id", () => {
  const set = createAnnotationSet({
    imageId: "image_0001",
    annotations: [
      { imageId: "image_0001", classId: 3, className: "other" },
      { imageId: "image_0001", classId: 1, className: "target" },
    ],
  });

  assert.deepEqual(
    set.annotations.map((annotation) => annotation.class_id),
    [1, 3],
  );
});

test("migrates a legacy single mask image to a selected class annotation", () => {
  const annotations = migrateLegacyImageAnnotations(
    {
      id: "image_0001",
      current_mask_path: "masks/image_0001.png",
      mask_width: 640,
      mask_height: 480,
      mask_ratio: 0.3,
    },
    { classId: 2, className: "scratch", now: NOW },
  );

  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].class_id, 2);
  assert.equal(annotations[0].mask_path, "masks/image_0001.png");
});
