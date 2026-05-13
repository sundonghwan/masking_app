import assert from "node:assert/strict";
import test from "node:test";

import { createIndexedMaskArtifact } from "../src/export/indexedMask.js";
import { createGrayscale8Png, decodeGrayscale8PngPixels, parsePngHeader } from "../src/server/maskValidation.js";

test("creates an indexed grayscale mask from class binary masks", () => {
  const class1 = createGrayscale8Png({ width: 3, height: 2, pixels: [0, 255, 0, 0, 0, 255] });
  const class2 = createGrayscale8Png({ width: 3, height: 2, pixels: [0, 0, 255, 0, 255, 0] });

  const artifact = createIndexedMaskArtifact({
    image: { id: "image-1", width: 3, height: 2 },
    annotations: [
      { annotation_id: "ann_1", class_id: 1, class_name: "target", maskBuffer: class1 },
      { annotation_id: "ann_2", class_id: 2, class_name: "defect", maskBuffer: class2 },
    ],
  });

  const header = parsePngHeader(artifact.png);
  const pixels = decodeGrayscale8PngPixels(artifact.png, header);

  assert.equal(header.valid, true);
  assert.equal(header.width, 3);
  assert.equal(header.height, 2);
  assert.deepEqual([...pixels], [0, 1, 2, 0, 2, 1]);
  assert.equal(artifact.path, "indexed_masks/image-1_indexed_mask.png");
  assert.deepEqual(artifact.class_map, [
    { class_id: 1, class_name: "target", annotation_id: "ann_1" },
    { class_id: 2, class_name: "defect", annotation_id: "ann_2" },
  ]);
});

test("uses higher class id as the deterministic overlap winner", () => {
  const class1 = createGrayscale8Png({ width: 2, height: 1, pixels: [255, 255] });
  const class2 = createGrayscale8Png({ width: 2, height: 1, pixels: [0, 255] });

  const artifact = createIndexedMaskArtifact({
    image: { id: "image-1", width: 2, height: 1 },
    annotations: [
      { class_id: 1, class_name: "target", maskBuffer: class1 },
      { class_id: 2, class_name: "defect", maskBuffer: class2 },
    ],
  });
  const pixels = decodeGrayscale8PngPixels(artifact.png, parsePngHeader(artifact.png));

  assert.deepEqual([...pixels], [1, 2]);
  assert.equal(artifact.overlap_policy, "higher_class_id_wins");
});

test("rejects class ids that cannot fit in an 8-bit indexed mask", () => {
  const mask = createGrayscale8Png({ width: 1, height: 1, pixels: [255] });

  assert.throws(
    () => createIndexedMaskArtifact({
      image: { id: "image-1", width: 1, height: 1 },
      annotations: [{ class_id: 300, class_name: "too_large", maskBuffer: mask }],
    }),
    /class_id must fit in an 8-bit indexed mask/,
  );
});
