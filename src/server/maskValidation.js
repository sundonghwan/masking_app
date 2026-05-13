import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const MASK_VALIDATION_REASONS = {
  INVALID_PNG_SIGNATURE: "invalid_png_signature",
  PNG_IHDR_NOT_FOUND: "png_ihdr_not_found",
  INVALID_IMAGE_META: "invalid_image_meta",
  MASK_DIMENSION_MISMATCH: "mask_dimension_mismatch",
  MASK_NOT_8BIT_GRAYSCALE: "mask_not_8bit_grayscale",
  PNG_INTERLACE_UNSUPPORTED: "png_interlace_unsupported",
  PNG_IDAT_NOT_FOUND: "png_idat_not_found",
  PNG_PIXEL_DECODE_FAILED: "png_pixel_decode_failed",
  MASK_NON_BINARY_PIXELS: "mask_non_binary_pixels",
  MASK_EMPTY: "mask_empty",
};

export function parsePngHeader(buffer) {
  const source = Buffer.from(buffer || []);
  if (source.length < 33 || !source.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return {
      valid: false,
      reason: MASK_VALIDATION_REASONS.INVALID_PNG_SIGNATURE,
    };
  }

  const chunkType = source.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    return {
      valid: false,
      reason: MASK_VALIDATION_REASONS.PNG_IHDR_NOT_FOUND,
    };
  }

  const colorType = source.readUInt8(25);

  return {
    valid: true,
    width: source.readUInt32BE(16),
    height: source.readUInt32BE(20),
    bitDepth: source.readUInt8(24),
    colorType,
    colorTypeName: colorTypeName(colorType),
    compressionMethod: source.readUInt8(26),
    filterMethod: source.readUInt8(27),
    interlaceMethod: source.readUInt8(28),
  };
}

export function validateMaskDimensions(imageMeta, maskMeta) {
  const image = {
    width: Number(imageMeta?.width),
    height: Number(imageMeta?.height),
  };
  const mask = {
    width: Number(maskMeta?.width),
    height: Number(maskMeta?.height),
  };

  if (!isPositiveInteger(image.width) || !isPositiveInteger(image.height)) {
    return {
      valid: false,
      reason: MASK_VALIDATION_REASONS.INVALID_IMAGE_META,
      image,
      mask,
    };
  }

  const valid = image.width === mask.width && image.height === mask.height;
  return {
    valid,
    reason: valid ? null : MASK_VALIDATION_REASONS.MASK_DIMENSION_MISMATCH,
    image,
    mask,
  };
}

export function validateImageMaskDimensions(imagePngBuffer, maskPngBuffer) {
  const image = parsePngHeader(imagePngBuffer);
  const mask = parsePngHeader(maskPngBuffer);
  if (!image.valid) return { valid: false, reason: image.reason, image, mask };
  if (!mask.valid) return { valid: false, reason: mask.reason, image, mask };
  return validateMaskDimensions(image, mask);
}

export function validateMaskContract({ imageMeta, maskPngBuffer }) {
  const mask = parsePngHeader(maskPngBuffer);
  const reasons = [];
  const checks = {
    image_meta: "passed",
    png_header: mask.valid ? "passed" : "failed",
    dimensions: "not_checked",
    png_format: "not_checked",
    binary_pixels: "not_checked",
  };

  if (!mask.valid) {
    reasons.push(mask.reason);
  }

  const image = {
    width: Number(imageMeta?.width),
    height: Number(imageMeta?.height),
  };

  if (!isPositiveInteger(image.width) || !isPositiveInteger(image.height)) {
    checks.image_meta = "failed";
    reasons.push(MASK_VALIDATION_REASONS.INVALID_IMAGE_META);
  }

  if (mask.valid && checks.image_meta === "passed") {
    const dimensions = validateMaskDimensions(image, mask);
    checks.dimensions = dimensions.valid ? "passed" : "failed";
    if (!dimensions.valid) {
      reasons.push(dimensions.reason);
    }
  }

  if (mask.valid) {
    const is8BitGrayscale = mask.bitDepth === 8 && mask.colorType === 0;
    checks.png_format = is8BitGrayscale ? "passed" : "failed";
    if (!is8BitGrayscale) {
      reasons.push(MASK_VALIDATION_REASONS.MASK_NOT_8BIT_GRAYSCALE);
    }
  }

  let pixelValidation = {
    status: "not_checked",
    reason: "mask PNG header, dimensions, or format checks did not pass",
  };
  if (
    mask.valid &&
    checks.image_meta === "passed" &&
    checks.dimensions === "passed" &&
    checks.png_format === "passed"
  ) {
    pixelValidation = validateBinaryMaskPixels(maskPngBuffer, mask);
    checks.binary_pixels = pixelValidation.valid ? "passed" : "failed";
    if (!pixelValidation.valid) {
      reasons.push(pixelValidation.reason);
    }
  }

  const uniqueReasons = [...new Set(reasons)];

  return {
    valid: uniqueReasons.length === 0,
    status: uniqueReasons.length === 0 ? "valid" : "invalid",
    reasons: uniqueReasons,
    checks,
    image,
    mask: mask.valid ? {
      width: mask.width,
      height: mask.height,
      bitDepth: mask.bitDepth,
      colorType: mask.colorType,
      colorTypeName: mask.colorTypeName,
      compressionMethod: mask.compressionMethod,
      filterMethod: mask.filterMethod,
      interlaceMethod: mask.interlaceMethod,
    } : mask,
    pixelValidation,
  };
}

export function validateBinaryMaskPixels(maskPngBuffer, maskMeta = parsePngHeader(maskPngBuffer)) {
  if (!maskMeta.valid) {
    return { valid: false, status: "failed", reason: maskMeta.reason };
  }
  if (maskMeta.interlaceMethod !== 0) {
    return { valid: false, status: "failed", reason: MASK_VALIDATION_REASONS.PNG_INTERLACE_UNSUPPORTED };
  }

  try {
    const pixels = decodeGrayscale8PngPixels(maskPngBuffer, maskMeta);
    let foregroundPixels = 0;

    for (const value of pixels) {
      if (value === 255) {
        foregroundPixels += 1;
      } else if (value !== 0) {
        return {
          valid: false,
          status: "failed",
          reason: MASK_VALIDATION_REASONS.MASK_NON_BINARY_PIXELS,
          foregroundPixels,
        };
      }
    }

    if (foregroundPixels === 0) {
      return {
        valid: false,
        status: "failed",
        reason: MASK_VALIDATION_REASONS.MASK_EMPTY,
        foregroundPixels,
      };
    }

    return {
      valid: true,
      status: "passed",
      reason: null,
      totalPixels: pixels.length,
      foregroundPixels,
    };
  } catch (error) {
    return {
      valid: false,
      status: "failed",
      reason: MASK_VALIDATION_REASONS.PNG_PIXEL_DECODE_FAILED,
      message: error instanceof Error ? error.message : "unknown decode error",
    };
  }
}

export function decodeGrayscale8PngPixels(maskPngBuffer, maskMeta = parsePngHeader(maskPngBuffer)) {
  if (!maskMeta.valid) throw new Error(maskMeta.reason);
  if (maskMeta.bitDepth !== 8 || maskMeta.colorType !== 0) {
    throw new Error(MASK_VALIDATION_REASONS.MASK_NOT_8BIT_GRAYSCALE);
  }
  if (maskMeta.interlaceMethod !== 0) {
    throw new Error(MASK_VALIDATION_REASONS.PNG_INTERLACE_UNSUPPORTED);
  }
  const chunks = parsePngChunks(maskPngBuffer);
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  if (idat.length === 0) {
    throw new Error(MASK_VALIDATION_REASONS.PNG_IDAT_NOT_FOUND);
  }
  return unfilterPngRows(inflateSync(idat), maskMeta.width, maskMeta.height, 1);
}

export function normalizeMaskPngForStorage(maskPngBuffer) {
  const source = Buffer.from(maskPngBuffer || []);
  const maskMeta = parsePngHeader(source);
  if (!maskMeta.valid || (maskMeta.bitDepth === 8 && maskMeta.colorType === 0)) {
    return { buffer: source, normalized: false, source: maskMeta };
  }
  if (maskMeta.bitDepth !== 8 || maskMeta.colorType !== 6 || maskMeta.interlaceMethod !== 0) {
    return { buffer: source, normalized: false, source: maskMeta };
  }

  try {
    const rgba = decodeTruecolorAlpha8PngPixels(source, maskMeta);
    const pixels = Buffer.alloc(maskMeta.width * maskMeta.height);
    for (let index = 0; index < pixels.length; index += 1) {
      const offset = index * 4;
      const red = rgba[offset];
      const green = rgba[offset + 1];
      const blue = rgba[offset + 2];
      const alpha = rgba[offset + 3];
      if (alpha === 0 || (red === 0 && green === 0 && blue === 0)) {
        pixels[index] = 0;
      } else if (red === 255 && green === 255 && blue === 255) {
        pixels[index] = 255;
      } else {
        return { buffer: source, normalized: false, source: maskMeta };
      }
    }
    return {
      buffer: createGrayscale8Png({ width: maskMeta.width, height: maskMeta.height, pixels }),
      normalized: true,
      source: maskMeta,
    };
  } catch {
    return { buffer: source, normalized: false, source: maskMeta };
  }
}

export function decodeTruecolorAlpha8PngPixels(maskPngBuffer, maskMeta = parsePngHeader(maskPngBuffer)) {
  if (!maskMeta.valid) throw new Error(maskMeta.reason);
  if (maskMeta.bitDepth !== 8 || maskMeta.colorType !== 6) {
    throw new Error(MASK_VALIDATION_REASONS.MASK_NOT_8BIT_GRAYSCALE);
  }
  if (maskMeta.interlaceMethod !== 0) {
    throw new Error(MASK_VALIDATION_REASONS.PNG_INTERLACE_UNSUPPORTED);
  }
  const chunks = parsePngChunks(maskPngBuffer);
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  if (idat.length === 0) {
    throw new Error(MASK_VALIDATION_REASONS.PNG_IDAT_NOT_FOUND);
  }
  return unfilterPngRows(inflateSync(idat), maskMeta.width, maskMeta.height, 4);
}

export function createGrayscale8Png({ width, height, pixels }) {
  if (!isPositiveInteger(Number(width)) || !isPositiveInteger(Number(height))) {
    throw new Error("width and height must be positive integers");
  }
  const source = Buffer.from(pixels || []);
  if (source.length !== Number(width) * Number(height)) {
    throw new Error("pixel buffer length must match width * height");
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(Number(width), 0);
  ihdrData.writeUInt32BE(Number(height), 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(0, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const rows = [];
  for (let row = 0; row < Number(height); row += 1) {
    rows.push(Buffer.from([0, ...source.subarray(row * Number(width), (row + 1) * Number(width))]));
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    createPngChunk("IHDR", ihdrData),
    createPngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function createMinimalPngHeader({ width, height, bitDepth = 8, colorType = 0 }) {
  const buffer = Buffer.alloc(33);
  PNG_SIGNATURE.copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, 4, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer.writeUInt8(bitDepth, 24);
  buffer.writeUInt8(colorType, 25);
  buffer.writeUInt8(0, 26);
  buffer.writeUInt8(0, 27);
  buffer.writeUInt8(0, 28);
  return buffer;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function parsePngChunks(buffer) {
  const source = Buffer.from(buffer || []);
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > source.length) {
      throw new Error("PNG chunk exceeds buffer length");
    }
    chunks.push({ type, data: source.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

function createPngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function unfilterPngRows(inflated, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  const expected = (stride + 1) * height;
  if (inflated.length < expected) {
    throw new Error("PNG scanline data is shorter than expected");
  }

  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  let targetOffset = 0;
  let previousRow = Buffer.alloc(stride);

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const raw = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const current = Buffer.alloc(stride);

    for (let column = 0; column < stride; column += 1) {
      const left = column >= bytesPerPixel ? current[column - bytesPerPixel] : 0;
      const up = previousRow[column] || 0;
      const upLeft = column >= bytesPerPixel ? previousRow[column - bytesPerPixel] : 0;
      current[column] = (raw[column] + filterPredictor(filter, left, up, upLeft)) & 0xff;
    }

    current.copy(pixels, targetOffset);
    targetOffset += stride;
    previousRow = current;
  }

  return pixels;
}

function filterPredictor(filter, left, up, upLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`Unsupported PNG filter type: ${filter}`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  if (distanceUp <= distanceUpLeft) return up;
  return upLeft;
}

function colorTypeName(colorType) {
  return {
    0: "grayscale",
    2: "truecolor",
    3: "indexed-color",
    4: "grayscale-alpha",
    6: "truecolor-alpha",
  }[colorType] || "unknown";
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
