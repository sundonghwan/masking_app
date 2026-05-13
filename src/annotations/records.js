export function createAnnotationRecord(input = {}, options = {}) {
  const imageId = normalizeText(input.imageId || input.image_id);
  const classId = toPositiveInt(input.classId ?? input.class_id);
  const now = options.now || input.updatedAt || input.updated_at || new Date().toISOString();

  if (!imageId) {
    throw new Error("image_id is required");
  }
  if (!classId) {
    throw new Error("class_id must be a positive integer");
  }

  return {
    annotation_id: normalizeText(input.annotationId || input.annotation_id) || `ann_${imageId}_class_${classId}`,
    image_id: imageId,
    class_id: classId,
    class_name: normalizeText(options.className || input.className || input.class_name),
    mask_path: normalizeText(input.maskPath || input.mask_path),
    mask_width: toNonNegativeInt(input.maskWidth ?? input.mask_width),
    mask_height: toNonNegativeInt(input.maskHeight ?? input.mask_height),
    mask_ratio: clampRatio(input.maskRatio ?? input.mask_ratio),
    source: normalizeText(input.source || "manual"),
    score: normalizeScore(input.score),
    status: normalizeText(input.status || "draft"),
    created_at: input.createdAt || input.created_at || now,
    updated_at: now,
  };
}

export function annotationMaskPath(input = {}) {
  const imageId = normalizeText(input.imageId || input.image_id);
  const classId = toPositiveInt(input.classId ?? input.class_id);
  if (!imageId) throw new Error("image_id is required");
  if (!classId) throw new Error("class_id must be a positive integer");
  const className = safeFileToken(input.className || input.class_name || `class_${classId}`);
  return `masks/${safeFileToken(imageId)}_class_${classId}_${className}_mask.png`;
}

export function annotationMaskBlobKey(imageId, classId) {
  const normalizedImageId = normalizeText(imageId);
  const normalizedClassId = toPositiveInt(classId);
  if (!normalizedImageId) throw new Error("image_id is required");
  if (!normalizedClassId) throw new Error("class_id must be a positive integer");
  return `${normalizedImageId}::class_${normalizedClassId}`;
}

export function upsertAnnotationRecord(annotations = [], input = {}, options = {}) {
  const next = createAnnotationRecord(input, options);
  const records = Array.isArray(annotations) ? annotations.map((annotation) => ({ ...annotation })) : [];
  const index = records.findIndex((annotation) => Number(annotation.class_id) === next.class_id);

  if (index >= 0) {
    records[index] = {
      ...records[index],
      ...next,
      created_at: records[index].created_at || next.created_at,
    };
    return sortAnnotations(records);
  }

  return sortAnnotations([...records, next]);
}

export function createAnnotationSet(input = {}, options = {}) {
  const imageId = normalizeText(input.imageId || input.image_id);
  const annotations = Array.isArray(input.annotations)
    ? input.annotations.map((annotation) => createAnnotationRecord({ imageId, ...annotation }, options))
    : [];

  return {
    image_id: imageId,
    annotations: sortAnnotations(annotations),
  };
}

export function migrateLegacyImageAnnotations(image = {}, options = {}) {
  const maskPath = normalizeText(image.current_mask_path || image.mask_path || image.maskPath);
  if (!maskPath) return [];

  return [
    createAnnotationRecord(
      {
        imageId: image.id || image.image_id,
        classId: options.classId || 1,
        maskPath,
        maskWidth: image.mask_width || image.maskWidth || image.width,
        maskHeight: image.mask_height || image.maskHeight || image.height,
        maskRatio: image.mask_ratio ?? image.maskRatio,
        status: image.status || "draft",
      },
      {
        now: options.now,
        className: options.className || "target",
      },
    ),
  ];
}

function sortAnnotations(annotations) {
  return [...annotations].sort((a, b) => Number(a.class_id) - Number(b.class_id));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function safeFileToken(value) {
  const safe = normalizeText(value)
    .replace(/[\\/]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/_{2,}/g, "_");
  return safe || "mask";
}

function toPositiveInt(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return 0;
  return number;
}

function toNonNegativeInt(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return 0;
  return number;
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  if (number > 1) return 1;
  return number;
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0) return 0;
  if (number > 1) return 1;
  return number;
}
