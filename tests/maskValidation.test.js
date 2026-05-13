import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  MASK_VALIDATION_REASONS,
  decodeGrayscale8PngPixels,
  normalizeMaskPngForStorage,
  parsePngHeader,
  validateBinaryMaskPixels,
  validateMaskContract,
  validateMaskDimensions,
} from "../src/server/maskValidation.js";

test("parses PNG signature and IHDR metadata", () => {
  const png = createMinimalPng({ width: 640, height: 480, bitDepth: 8, colorType: 0 });

  const metadata = parsePngHeader(png);

  assert.equal(metadata.valid, true);
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 480);
  assert.equal(metadata.bitDepth, 8);
  assert.equal(metadata.colorType, 0);
  assert.equal(metadata.colorTypeName, "grayscale");
});

test("rejects buffers without a PNG signature", () => {
  const metadata = parsePngHeader(Buffer.from("not a png"));

  assert.equal(metadata.valid, false);
  assert.equal(metadata.reason, MASK_VALIDATION_REASONS.INVALID_PNG_SIGNATURE);
});

test("validates mask dimensions against image metadata", () => {
  assert.deepEqual(validateMaskDimensions({ width: "12", height: 8 }, { width: 12, height: 8 }), {
    valid: true,
    reason: null,
    image: { width: 12, height: 8 },
    mask: { width: 12, height: 8 },
  });

  const mismatch = validateMaskDimensions({ width: 12, height: 8 }, { width: 11, height: 8 });

  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.reason, MASK_VALIDATION_REASONS.MASK_DIMENSION_MISMATCH);
});

test("validates mask contract and binary pixels for an 8-bit grayscale PNG", () => {
  const png = createGrayscalePng({ width: 4, height: 2, pixels: [0, 255, 0, 0, 0, 0, 255, 0] });

  const result = validateMaskContract({
    imageMeta: { width: 4, height: 2 },
    maskPngBuffer: png,
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, "valid");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.checks.png_header, "passed");
  assert.equal(result.checks.dimensions, "passed");
  assert.equal(result.checks.png_format, "passed");
  assert.equal(result.checks.binary_pixels, "passed");
  assert.equal(result.pixelValidation.status, "passed");
  assert.equal(result.pixelValidation.foregroundPixels, 2);
  assert.deepEqual(result.mask, {
    width: 4,
    height: 2,
    bitDepth: 8,
    colorType: 0,
    colorTypeName: "grayscale",
    compressionMethod: 0,
    filterMethod: 0,
    interlaceMethod: 0,
  });
});

test("rejects non-binary and empty mask pixels", () => {
  const nonBinary = validateBinaryMaskPixels(createGrayscalePng({ width: 2, height: 1, pixels: [0, 128] }));
  const empty = validateBinaryMaskPixels(createGrayscalePng({ width: 2, height: 1, pixels: [0, 0] }));

  assert.equal(nonBinary.valid, false);
  assert.equal(nonBinary.reason, MASK_VALIDATION_REASONS.MASK_NON_BINARY_PIXELS);
  assert.equal(empty.valid, false);
  assert.equal(empty.reason, MASK_VALIDATION_REASONS.MASK_EMPTY);
});

test("marks dimension mismatches invalid", () => {
  const png = createMinimalPng({ width: 32, height: 15, bitDepth: 8, colorType: 0 });

  const result = validateMaskContract({
    imageMeta: { width: 32, height: 16 },
    maskPngBuffer: png,
  });

  assert.equal(result.valid, false);
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.reasons, [MASK_VALIDATION_REASONS.MASK_DIMENSION_MISMATCH]);
  assert.equal(result.checks.dimensions, "failed");
});

test("reports invalid image metadata once and leaves dimensions unchecked", () => {
  const png = createMinimalPng({ width: 32, height: 16, bitDepth: 8, colorType: 0 });

  const result = validateMaskContract({
    imageMeta: { width: 0, height: 16 },
    maskPngBuffer: png,
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, [MASK_VALIDATION_REASONS.INVALID_IMAGE_META]);
  assert.equal(result.checks.image_meta, "failed");
  assert.equal(result.checks.dimensions, "not_checked");
});

test("marks non-8-bit-grayscale PNG masks invalid without decoding pixels", () => {
  const png = createMinimalPng({ width: 32, height: 16, bitDepth: 8, colorType: 6 });

  const result = validateMaskContract({
    imageMeta: { width: 32, height: 16 },
    maskPngBuffer: png,
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, [MASK_VALIDATION_REASONS.MASK_NOT_8BIT_GRAYSCALE]);
  assert.equal(result.checks.png_format, "failed");
  assert.equal(result.pixelValidation.status, "not_checked");
});

test("normalizes browser RGBA binary mask PNGs into 8-bit grayscale PNGs", () => {
  const browserPng = createRgbaPng({
    width: 2,
    height: 2,
    pixels: [
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 0,
      255, 255, 255, 255,
    ],
  });

  const normalized = normalizeMaskPngForStorage(browserPng);
  const header = parsePngHeader(normalized.buffer);
  const pixels = decodeGrayscale8PngPixels(normalized.buffer, header);

  assert.equal(normalized.normalized, true);
  assert.equal(header.colorType, 0);
  assert.deepEqual(Array.from(pixels), [0, 255, 0, 255]);
});

function createMinimalPng({ width, height, bitDepth, colorType }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(bitDepth, 8);
  ihdrData.writeUInt8(colorType, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdr = createChunk("IHDR", ihdrData);
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, iend]);
}

function createGrayscalePng({ width, height, pixels }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(0, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const rows = [];
  for (let row = 0; row < height; row += 1) {
    rows.push(Buffer.from([0, ...pixels.slice(row * width, (row + 1) * width)]));
  }

  return Buffer.concat([
    signature,
    createChunk("IHDR", ihdrData),
    createChunk("IDAT", deflateSync(Buffer.concat(rows))),
    createChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createRgbaPng({ width, height, pixels }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const rows = [];
  const stride = width * 4;
  for (let row = 0; row < height; row += 1) {
    rows.push(Buffer.from([0, ...pixels.slice(row * stride, (row + 1) * stride)]));
  }

  return Buffer.concat([
    signature,
    createChunk("IHDR", ihdrData),
    createChunk("IDAT", deflateSync(Buffer.concat(rows))),
    createChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(0, 8 + data.length);
  return chunk;
}
