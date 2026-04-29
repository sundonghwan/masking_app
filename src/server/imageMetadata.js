const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL_PATTERN = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i;

export const IMAGE_METADATA_REASONS = {
  INVALID_DATA_URL: "invalid_data_url",
  UNSUPPORTED_IMAGE_FORMAT: "unsupported_image_format",
  INVALID_IMAGE_METADATA: "invalid_image_metadata",
  CLIENT_DIMENSION_MISMATCH: "client_dimension_mismatch",
};

export function parseImageMetadataFromDataUrl(dataUrl) {
  const match = DATA_URL_PATTERN.exec(String(dataUrl || ""));
  if (!match) {
    return { valid: false, reason: IMAGE_METADATA_REASONS.INVALID_DATA_URL };
  }

  const mimeType = (match[1] || "").toLowerCase();
  const buffer = Buffer.from(match[2] || "", "base64");
  const parsed = parseImageMetadata(buffer, mimeType);
  return {
    ...parsed,
    mimeType,
    sizeBytes: buffer.length,
  };
}

export function parseImageMetadata(buffer, mimeType = "") {
  const source = Buffer.from(buffer || []);
  const type = String(mimeType || "").toLowerCase();

  if (type === "image/png" || source.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return parsePngMetadata(source);
  }
  if (type === "image/jpeg" || type === "image/jpg" || looksLikeJpeg(source)) {
    return parseJpegMetadata(source);
  }
  if (type === "image/bmp" || looksLikeBmp(source)) {
    return parseBmpMetadata(source);
  }
  if (type === "image/webp" || looksLikeWebp(source)) {
    return parseWebpMetadata(source);
  }

  return {
    valid: false,
    reason: IMAGE_METADATA_REASONS.UNSUPPORTED_IMAGE_FORMAT,
  };
}

export function validateClientDimensions(clientInput = {}, serverMeta = {}) {
  const width = Number(clientInput.width);
  const height = Number(clientInput.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { valid: true, checked: false };
  }

  const valid = width === serverMeta.width && height === serverMeta.height;
  return {
    valid,
    checked: true,
    reason: valid ? null : IMAGE_METADATA_REASONS.CLIENT_DIMENSION_MISMATCH,
    client: { width, height },
    server: { width: serverMeta.width, height: serverMeta.height },
  };
}

function parsePngMetadata(source) {
  if (source.length < 33 || !source.subarray(0, 8).equals(PNG_SIGNATURE) || source.subarray(12, 16).toString("ascii") !== "IHDR") {
    return { valid: false, reason: IMAGE_METADATA_REASONS.INVALID_IMAGE_METADATA };
  }
  return {
    valid: true,
    format: "png",
    width: source.readUInt32BE(16),
    height: source.readUInt32BE(20),
  };
}

function parseJpegMetadata(source) {
  if (!looksLikeJpeg(source)) {
    return { valid: false, reason: IMAGE_METADATA_REASONS.INVALID_IMAGE_METADATA };
  }

  let offset = 2;
  while (offset + 9 < source.length) {
    if (source[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = source[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    const length = source.readUInt16BE(offset);
    if (length < 2 || offset + length > source.length) break;
    if (isJpegStartOfFrame(marker)) {
      return {
        valid: true,
        format: "jpeg",
        height: source.readUInt16BE(offset + 3),
        width: source.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }

  return { valid: false, reason: IMAGE_METADATA_REASONS.INVALID_IMAGE_METADATA };
}

function parseBmpMetadata(source) {
  if (!looksLikeBmp(source) || source.length < 26) {
    return { valid: false, reason: IMAGE_METADATA_REASONS.INVALID_IMAGE_METADATA };
  }
  return {
    valid: true,
    format: "bmp",
    width: source.readInt32LE(18),
    height: Math.abs(source.readInt32LE(22)),
  };
}

function parseWebpMetadata(source) {
  if (!looksLikeWebp(source) || source.length < 30) {
    return { valid: false, reason: IMAGE_METADATA_REASONS.INVALID_IMAGE_METADATA };
  }

  const chunkType = source.subarray(12, 16).toString("ascii");
  if (chunkType === "VP8X" && source.length >= 30) {
    return {
      valid: true,
      format: "webp",
      width: 1 + readUInt24LE(source, 24),
      height: 1 + readUInt24LE(source, 27),
    };
  }
  if (chunkType === "VP8L" && source.length >= 25) {
    const bits = source.readUInt32LE(21);
    return {
      valid: true,
      format: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunkType === "VP8 " && source.length >= 30) {
    return {
      valid: true,
      format: "webp",
      width: source.readUInt16LE(26) & 0x3fff,
      height: source.readUInt16LE(28) & 0x3fff,
    };
  }

  return { valid: false, reason: IMAGE_METADATA_REASONS.INVALID_IMAGE_METADATA };
}

function looksLikeJpeg(source) {
  return source.length >= 4 && source[0] === 0xff && source[1] === 0xd8;
}

function looksLikeBmp(source) {
  return source.length >= 2 && source.subarray(0, 2).toString("ascii") === "BM";
}

function looksLikeWebp(source) {
  return source.length >= 12 && source.subarray(0, 4).toString("ascii") === "RIFF" && source.subarray(8, 12).toString("ascii") === "WEBP";
}

function isJpegStartOfFrame(marker) {
  return [
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ].includes(marker);
}

function readUInt24LE(source, offset) {
  return source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16);
}
