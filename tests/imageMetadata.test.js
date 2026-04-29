import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_METADATA_REASONS,
  parseImageMetadata,
  parseImageMetadataFromDataUrl,
  validateClientDimensions,
} from "../src/server/imageMetadata.js";
import { createMinimalPngHeader } from "../src/server/maskValidation.js";

test("extracts PNG dimensions from uploaded image data URL", () => {
  const dataUrl = `data:image/png;base64,${createMinimalPngHeader({ width: 64, height: 32, bitDepth: 8, colorType: 6 }).toString("base64")}`;

  const result = parseImageMetadataFromDataUrl(dataUrl);

  assert.equal(result.valid, true);
  assert.equal(result.format, "png");
  assert.equal(result.width, 64);
  assert.equal(result.height, 32);
  assert.equal(result.mimeType, "image/png");
});

test("extracts BMP dimensions", () => {
  const bmp = Buffer.alloc(54);
  bmp.write("BM", 0, 2, "ascii");
  bmp.writeInt32LE(12, 18);
  bmp.writeInt32LE(-8, 22);

  const result = parseImageMetadata(bmp, "image/bmp");

  assert.equal(result.valid, true);
  assert.equal(result.format, "bmp");
  assert.equal(result.width, 12);
  assert.equal(result.height, 8);
});

test("detects client dimension mismatch", () => {
  const result = validateClientDimensions({ width: 63, height: 32 }, { width: 64, height: 32 });

  assert.equal(result.valid, false);
  assert.equal(result.reason, IMAGE_METADATA_REASONS.CLIENT_DIMENSION_MISMATCH);
  assert.deepEqual(result.client, { width: 63, height: 32 });
  assert.deepEqual(result.server, { width: 64, height: 32 });
});

test("rejects invalid image metadata", () => {
  const result = parseImageMetadata(Buffer.from("not an image"), "image/png");

  assert.equal(result.valid, false);
  assert.equal(result.reason, IMAGE_METADATA_REASONS.INVALID_IMAGE_METADATA);
});
