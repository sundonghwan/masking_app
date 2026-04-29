import { DEFAULT_ACTORS, DEFAULT_PROJECT } from "../config/runtimeDefaults.js";

export const MASK_CONTRACT = {
  format: "8-bit grayscale PNG",
  background_value: 0,
  mask_value: 255,
  width_height: "same_as_original",
};

export const EXCLUSION_REASONS = {
  MISSING_PROJECT_ID: "missing_project_id",
  MISSING_IMAGE_ID: "missing_image_id",
  MISSING_ORIGINAL: "missing_original",
  INVALID_DIMENSIONS: "invalid_dimensions",
  STATUS_NOT_EXPORTABLE: "status_not_exportable",
  MISSING_MASK: "missing_mask",
  MASK_DIMENSION_MISMATCH: "mask_dimension_mismatch",
  INVALID_MASK_VALUES: "invalid_mask_values",
  EMPTY_MASK: "empty_mask",
  NOT_APPROVED: "not_approved",
};

const EXPORTABLE_STATUSES = new Set(["submitted", "approved"]);
const APPROVED_ONLY_STATUSES = new Set(["approved"]);

export function createProjectRecord(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();

  return {
    id: normalizeText(input.id || input.projectId || DEFAULT_PROJECT.id),
    name: normalizeText(input.name || DEFAULT_PROJECT.name),
    description: normalizeText(input.description || ""),
    created_at: input.createdAt || input.created_at || now,
    updated_at: input.updatedAt || input.updated_at || now,
  };
}

export function createImageRecord(input = {}, options = {}) {
  if (isFileLike(input)) {
    return createBrowserImageRecord(input, options);
  }

  const now = options.now || new Date().toISOString();
  const id = normalizeText(input.id || input.imageId || `image-${String(options.index || 1)}`);
  const width = toPositiveInt(input.width);
  const height = toPositiveInt(input.height);
  const maskWidth = toOptionalPositiveInt(input.maskWidth ?? input.mask_width ?? input.width);
  const maskHeight = toOptionalPositiveInt(input.maskHeight ?? input.mask_height ?? input.height);
  const originalFileName = normalizeText(input.originalFileName || input.original_file_name || input.fileName || `${id}.png`);
  const maskPath = normalizeText(input.maskPath || input.mask_path || input.current_mask_path || "");

  return {
    id,
    project_id: normalizeText(input.projectId || input.project_id || ""),
    original_file_name: originalFileName,
    image_path: normalizeText(input.imagePath || input.image_path || ""),
    current_mask_path: maskPath,
    width,
    height,
    mask_width: maskWidth,
    mask_height: maskHeight,
    mask_values_valid: input.maskValuesValid ?? input.mask_values_valid ?? null,
    mask_ratio: Number(input.maskRatio ?? input.mask_ratio ?? 0),
    status: normalizeText(input.status || "not_started"),
    assigned_to: normalizeText(input.assignedTo || input.assigned_to || ""),
    worker_id: normalizeText(input.workerId || input.worker_id || DEFAULT_ACTORS.worker),
    reviewer_id: normalizeText(input.reviewerId || input.reviewer_id || ""),
    submitted_at: input.submittedAt || input.submitted_at || "",
    created_at: input.createdAt || input.created_at || now,
    updated_at: input.updatedAt || input.updated_at || now,
    object_url: input.objectUrl || input.object_url || "",
    mask_data_url: input.maskDataUrl || input.mask_data_url || "",
    export_image_file_name: input.exportImageFileName || input.export_image_file_name || "",
    export_mask_file_name: input.exportMaskFileName || input.export_mask_file_name || "",
    review_events: Array.isArray(input.reviewEvents || input.review_events) ? input.reviewEvents || input.review_events : [],
  };
}

export function createValidationSummary(projectRecord, imageRecords, options = {}) {
  const now = options.now || new Date().toISOString();
  const items = imageRecords.map((image, index) => {
    const validation = validateImageForExport(image, { index, approvedOnly: options.approvedOnly });
    const paths = createExportPaths(image, { index });

    return {
      image_id: image.id,
      image_path: paths.image_path,
      mask_path: paths.mask_path,
      exportable: validation.valid,
      reasons: validation.reasons,
      checks: validation.checks,
    };
  });
  const exportable = items.filter((item) => item.exportable);

  return {
    project_id: projectRecord.id,
    generated_at: now,
    total_images: items.length,
    exportable_images: exportable.length,
    excluded_images: items.length - exportable.length,
    items,
  };
}

export function validateImageForExport(imageRecord, options = {}) {
  const allowedStatuses = options.approvedOnly ? APPROVED_ONLY_STATUSES : EXPORTABLE_STATUSES;
  const reasons = [];
  const checks = {
    project_id: Boolean(imageRecord.project_id),
    image_id: Boolean(imageRecord.id),
    original: Boolean(imageRecord.image_path || imageRecord.object_url),
    dimensions: imageRecord.width > 0 && imageRecord.height > 0,
    status: allowedStatuses.has(imageRecord.status),
    mask: Boolean(imageRecord.current_mask_path || imageRecord.mask_data_url),
    mask_dimensions: true,
    mask_values: imageRecord.mask_values_valid !== false,
    not_empty: true,
  };

  if (!checks.project_id && options.requireProjectId) reasons.push(EXCLUSION_REASONS.MISSING_PROJECT_ID);
  if (!checks.image_id) reasons.push(EXCLUSION_REASONS.MISSING_IMAGE_ID);
  if (!checks.original) reasons.push(EXCLUSION_REASONS.MISSING_ORIGINAL);
  if (!checks.dimensions) reasons.push(EXCLUSION_REASONS.INVALID_DIMENSIONS);
  if (!checks.status) reasons.push(options.approvedOnly ? EXCLUSION_REASONS.NOT_APPROVED : EXCLUSION_REASONS.STATUS_NOT_EXPORTABLE);
  if (!checks.mask) reasons.push(EXCLUSION_REASONS.MISSING_MASK);

  if (
    imageRecord.mask_width &&
    imageRecord.mask_height &&
    (imageRecord.mask_width !== imageRecord.width || imageRecord.mask_height !== imageRecord.height)
  ) {
    checks.mask_dimensions = false;
    reasons.push(EXCLUSION_REASONS.MASK_DIMENSION_MISMATCH);
  }

  if (checks.mask && imageRecord.mask_values_valid === false) {
    reasons.push(EXCLUSION_REASONS.INVALID_MASK_VALUES);
  }

  if (options.rejectEmptyMask && Number(imageRecord.mask_ratio || 0) <= 0) {
    checks.not_empty = false;
    reasons.push(EXCLUSION_REASONS.EMPTY_MASK);
  }

  return {
    image_id: imageRecord.id,
    file_name: imageRecord.original_file_name,
    valid: reasons.length === 0,
    reasons,
    checks,
  };
}

export function createAnnotationsJson(projectRecord, imageRecords, options = {}) {
  const now = options.now || new Date().toISOString();
  const exportable = imageRecords
    .map((image, index) => ({ image, index, validation: validateImageForExport(image, { index, approvedOnly: options.approvedOnly }) }))
    .filter((item) => item.validation.valid);

  return {
    version: 1,
    project_id: projectRecord.id,
    generated_at: now,
    mask_contract: MASK_CONTRACT,
    annotations: exportable.map(({ image, index }) => {
      const paths = createExportPaths(image, { index });
      return {
        image_id: image.id,
        original_file_name: image.original_file_name,
        image_path: paths.image_path,
        mask_path: paths.mask_path,
        width: image.width,
        height: image.height,
        status: image.status,
        submitted_at: image.submitted_at || "",
      };
    }),
  };
}

export function createExportSummaryJson(projectRecord, imageRecords, options = {}) {
  const now = options.now || new Date().toISOString();
  const validationSummary = options.validationSummary || createValidationSummary(projectRecord, imageRecords, { now, approvedOnly: options.approvedOnly });
  const validationErrors = validationSummary.items
    .filter((item) => !item.exportable)
    .map((item) => ({
      image_id: item.image_id,
      reasons: item.reasons,
    }));

  return {
    project_id: projectRecord.id,
    total_images: validationSummary.total_images,
    exported_images: validationSummary.exportable_images,
    approved_images: imageRecords.filter((image) => image.status === "approved").length,
    rejected_images: imageRecords.filter((image) => image.status === "rejected").length,
    review_events: imageRecords.reduce((count, image) => count + (Array.isArray(image.review_events) ? image.review_events.length : 0), 0),
    excluded_images: validationSummary.excluded_images,
    exported_at: now,
    export_policy: {
      statuses: options.approvedOnly ? [...APPROVED_ONLY_STATUSES] : [...EXPORTABLE_STATUSES],
      approved_only: Boolean(options.approvedOnly),
      archive_files: {
        annotations: "annotations.json",
        summary: "export_summary.json",
      },
    },
    validation_errors: validationErrors,
  };
}

export function createExportPaths(imageRecord, options = {}) {
  const imageFileName = createExportImageFileName(imageRecord, options.index);
  return {
    image_path: `images/${imageFileName}`,
    mask_path: `masks/${createExportMaskFileName(imageRecord, imageFileName)}`,
  };
}

export function createExportImageFileName(imageRecord = {}, index = 0) {
  if (imageRecord.export_image_file_name) return sanitizeFileName(imageRecord.export_image_file_name);
  const source = imageRecord.original_file_name || imageRecord.fileName || `image_${String(index + 1).padStart(4, "0")}.png`;
  return sanitizeFileName(source);
}

export function createExportMaskFileName(imageRecord = {}, imageFileName = "") {
  if (imageRecord.export_mask_file_name) return sanitizeFileName(imageRecord.export_mask_file_name);
  const base = stripExtension(sanitizeFileName(imageFileName || imageRecord.original_file_name || imageRecord.id || "image"));
  return `${base}_mask.png`;
}

export function serializeJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function createJsonBlob(data, dependencies = {}) {
  const BlobCtor = dependencies.Blob || globalThis.Blob;
  return new BlobCtor([serializeJson(data)], {
    type: "application/json;charset=utf-8",
  });
}

export function downloadJsonFile(fileName, data, dependencies = {}) {
  return downloadBlobFile(fileName, createJsonBlob(data, dependencies), dependencies);
}

export function downloadTextFile(fileName, text, dependencies = {}) {
  const BlobCtor = dependencies.Blob || globalThis.Blob;
  return downloadBlobFile(fileName, new BlobCtor([text], { type: "text/plain;charset=utf-8" }), dependencies);
}

export function downloadBlobFile(fileName, blob, dependencies = {}) {
  const doc = dependencies.document || globalThis.document;
  const urlApi = dependencies.URL || globalThis.URL;
  const safeName = sanitizeFileName(fileName);
  const objectUrl = urlApi.createObjectURL(blob);
  const link = doc.createElement("a");

  link.href = objectUrl;
  link.download = safeName;
  doc.body.appendChild(link);
  link.click();

  if (link.parentNode) {
    link.parentNode.removeChild(link);
  }

  urlApi.revokeObjectURL(objectUrl);

  return {
    file_name: safeName,
    object_url: objectUrl,
  };
}

export function buildAnnotations({ projectId, images, approvedOnly = false }) {
  return createAnnotationsJson(createProjectRecord({ id: projectId }), images.map(toCanonicalImageRecord), { approvedOnly });
}

export function buildExportSummary({ projectId, results, images = [], approvedOnly = false }) {
  const excluded = results.filter((result) => !result.valid);
  return {
    project_id: projectId,
    total_images: results.length,
    exported_images: results.length - excluded.length,
    approved_images: images.filter((image) => image.status === "approved").length,
    rejected_images: images.filter((image) => image.status === "rejected").length,
    review_events: images.reduce((count, image) => count + (Array.isArray(image.review_events) ? image.review_events.length : 0), 0),
    excluded_images: excluded.length,
    export_policy: {
      approved_only: Boolean(approvedOnly),
    },
    excluded,
    exported_at: new Date().toISOString(),
  };
}

export function validateExportItem(image, options = {}) {
  const result = validateImageForExport(toCanonicalImageRecord(image), { rejectEmptyMask: true, approvedOnly: options.approvedOnly });
  return {
    ...result,
    imageId: result.image_id,
    fileName: result.file_name,
    checks: {
      ...result.checks,
      dimensions: result.checks.dimensions,
      notEmpty: result.checks.not_empty,
      pixelValues: result.checks.mask_values,
    },
  };
}

export function downloadJson(value, filename) {
  return downloadJsonFile(filename, value);
}

export function downloadBlob(blob, filename) {
  return downloadBlobFile(filename, blob);
}

async function createBrowserImageRecord(file, options = {}) {
  const dimensions = await readImageDimensions(file);
  const index = Number(options.index || 1);
  const id = `image_${String(index).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const exportImageFileName = createExportImageFileName({ original_file_name: file.name }, index - 1);

  const objectUrl = URL.createObjectURL(file);

  return {
    id,
    project_id: options.projectId || DEFAULT_PROJECT.id,
    original_file_name: file.name,
    fileName: file.name,
    image_path: `images/${exportImageFileName}`,
    imagePath: `images/${exportImageFileName}`,
    current_mask_path: "",
    maskPath: "",
    width: dimensions.width,
    height: dimensions.height,
    mask_width: 0,
    mask_height: 0,
    mask_values_valid: null,
    mask_ratio: 0,
    maskRatio: 0,
    status: "not_started",
    worker_id: DEFAULT_ACTORS.worker,
    reviewer_id: "",
    created_at: now,
    updated_at: now,
    createdAt: now,
    updatedAt: now,
    object_url: objectUrl,
    objectUrl,
    file,
  };
}

function toCanonicalImageRecord(image) {
  return createImageRecord({
    id: image.id,
    projectId: image.project_id || image.projectId,
    originalFileName: image.original_file_name || image.fileName,
    imagePath: image.image_path || image.imagePath || image.object_url || image.objectUrl,
    maskPath: image.current_mask_path || image.maskPath,
    width: image.width,
    height: image.height,
    maskWidth: image.mask_width || image.maskWidth || image.width,
    maskHeight: image.mask_height || image.maskHeight || image.height,
    maskValuesValid: image.mask_values_valid ?? image.maskValuesValid,
    maskRatio: image.mask_ratio ?? image.maskRatio,
    status: image.status,
    workerId: image.worker_id || image.workerId,
    reviewerId: image.reviewer_id || image.reviewerId,
    submittedAt: image.submitted_at || image.submittedAt,
    updatedAt: image.updated_at || image.updatedAt,
    objectUrl: image.object_url || image.objectUrl,
    maskDataUrl: image.mask_data_url || image.maskDataUrl,
    reviewEvents: image.review_events || image.reviewEvents || [],
  });
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to read image dimensions: ${file.name}`));
    };
    image.src = url;
  });
}

function isFileLike(value) {
  return value && typeof value === "object" && typeof value.name === "string" && typeof value.type === "string";
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function toOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === "") return 0;
  return toPositiveInt(value);
}

function sanitizeFileName(value) {
  const name = String(value || "download").split(/[\\/]/).filter(Boolean).pop() || "download";
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_") || "download";
}

function stripExtension(fileName) {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(0, index) : fileName;
}
