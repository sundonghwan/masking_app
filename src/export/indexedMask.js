import { createGrayscale8Png, decodeGrayscale8PngPixels, parsePngHeader, validateBinaryMaskPixels } from "../server/maskValidation.js";

export const INDEXED_MASK_OVERLAP_POLICY = "higher_class_id_wins";

export function createIndexedMaskArtifact({ image = {}, annotations = [] } = {}) {
  const width = Number(image.width);
  const height = Number(image.height);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error("image width and height are required for indexed mask export");
  }

  const indexed = Buffer.alloc(width * height);
  const classMap = [];
  const sorted = annotations
    .filter((annotation) => annotation?.maskBuffer)
    .map((annotation) => ({
      ...annotation,
      class_id: Number(annotation.class_id),
    }))
    .sort((left, right) => left.class_id - right.class_id);

  for (const annotation of sorted) {
    if (!Number.isInteger(annotation.class_id) || annotation.class_id < 1 || annotation.class_id > 255) {
      throw new Error("class_id must fit in an 8-bit indexed mask");
    }
    const header = parsePngHeader(annotation.maskBuffer);
    const validation = validateBinaryMaskPixels(annotation.maskBuffer, header);
    if (!validation.valid) {
      throw new Error(`invalid binary mask for class_id ${annotation.class_id}: ${validation.reason}`);
    }
    if (Number(header.width) !== width || Number(header.height) !== height) {
      throw new Error(`mask dimensions must match image dimensions for class_id ${annotation.class_id}`);
    }
    const pixels = decodeGrayscale8PngPixels(annotation.maskBuffer, header);
    for (let index = 0; index < pixels.length; index += 1) {
      if (pixels[index] === 255) indexed[index] = annotation.class_id;
    }
    classMap.push({
      class_id: annotation.class_id,
      class_name: annotation.class_name || "",
      annotation_id: annotation.annotation_id || "",
    });
  }

  return {
    path: `indexed_masks/${safeFileToken(image.id || image.image_id || "image")}_indexed_mask.png`,
    png: createGrayscale8Png({ width, height, pixels: indexed }),
    class_map: classMap,
    overlap_policy: INDEXED_MASK_OVERLAP_POLICY,
  };
}

function safeFileToken(value) {
  return String(value || "image")
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/_{2,}/g, "_") || "image";
}
