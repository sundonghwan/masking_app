export const UPLOAD_POLICY = {
  maxFileBytes: 15 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/bmp", "image/webp"],
  allowedExtensions: [".png", ".jpg", ".jpeg", ".bmp", ".webp"],
};

export const UPLOAD_REASONS = {
  MISSING_FILE_NAME: "missing_file_name",
  UNSUPPORTED_MIME_TYPE: "unsupported_mime_type",
  UNSUPPORTED_EXTENSION: "unsupported_extension",
  FILE_TOO_LARGE: "file_too_large",
  INVALID_DATA_URL: "invalid_data_url",
  EMPTY_FILE: "empty_file",
};

const DATA_URL_PATTERN = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i;

export function validateBrowserUploadFile(file, policy = UPLOAD_POLICY) {
  return validateUploadCandidate({
    fileName: file?.name || "",
    mimeType: file?.type || "",
    sizeBytes: Number(file?.size || 0),
  }, policy);
}

export function validateImageDataUrlUpload(input = {}, policy = UPLOAD_POLICY) {
  const parsed = parseDataUrlMeta(input.dataUrl || input.data_url || "");
  if (!parsed.valid) {
    return {
      valid: false,
      reasons: [UPLOAD_REASONS.INVALID_DATA_URL],
      checks: baseChecks({
        fileName: input.fileName || input.file_name || "",
        mimeType: "",
        sizeBytes: 0,
      }),
      meta: parsed,
    };
  }

  const result = validateUploadCandidate({
    fileName: input.fileName || input.file_name || "",
    mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes,
  }, policy);

  return {
    ...result,
    meta: parsed,
  };
}

export function validateUploadCandidate(input = {}, policy = UPLOAD_POLICY) {
  const fileName = String(input.fileName || "").trim();
  const mimeType = String(input.mimeType || "").toLowerCase();
  const sizeBytes = Number(input.sizeBytes || 0);
  const extension = fileExtension(fileName);
  const checks = baseChecks({ fileName, mimeType, sizeBytes, extension }, policy);
  const reasons = [];

  if (!checks.file_name) reasons.push(UPLOAD_REASONS.MISSING_FILE_NAME);
  if (!checks.mime_type) reasons.push(UPLOAD_REASONS.UNSUPPORTED_MIME_TYPE);
  if (!checks.extension) reasons.push(UPLOAD_REASONS.UNSUPPORTED_EXTENSION);
  if (!checks.not_empty) reasons.push(UPLOAD_REASONS.EMPTY_FILE);
  if (!checks.size) reasons.push(UPLOAD_REASONS.FILE_TOO_LARGE);

  return {
    valid: reasons.length === 0,
    reasons,
    checks,
    meta: {
      fileName,
      mimeType,
      extension,
      sizeBytes,
      maxFileBytes: policy.maxFileBytes,
    },
  };
}

export function normalizeUploadPolicy(input = {}, fallback = UPLOAD_POLICY) {
  const maxFileBytes = Number(input.maxFileBytes || input.max_file_bytes || fallback.maxFileBytes);
  const allowedMimeTypes = normalizeList(input.allowedMimeTypes || input.allowed_mime_types, fallback.allowedMimeTypes);
  const allowedExtensions = normalizeList(input.allowedExtensions || input.allowed_extensions, fallback.allowedExtensions)
    .map((extension) => extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`);
  return {
    maxFileBytes: Number.isFinite(maxFileBytes) && maxFileBytes > 0 ? maxFileBytes : fallback.maxFileBytes,
    allowedMimeTypes,
    allowedExtensions,
  };
}

export function uploadReasonLabel(reason) {
  return {
    [UPLOAD_REASONS.MISSING_FILE_NAME]: "파일명이 없습니다",
    [UPLOAD_REASONS.UNSUPPORTED_MIME_TYPE]: "지원하지 않는 이미지 형식입니다",
    [UPLOAD_REASONS.UNSUPPORTED_EXTENSION]: "지원하지 않는 확장자입니다",
    [UPLOAD_REASONS.FILE_TOO_LARGE]: "파일 크기가 제한을 초과했습니다",
    [UPLOAD_REASONS.INVALID_DATA_URL]: "이미지 payload 형식이 올바르지 않습니다",
    [UPLOAD_REASONS.EMPTY_FILE]: "빈 파일입니다",
  }[reason] || reason;
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${Math.round((value / 1024 / 1024) * 10) / 10}MB`;
  if (value >= 1024) return `${Math.round((value / 1024) * 10) / 10}KB`;
  return `${value}B`;
}

function baseChecks(input = {}, policy = UPLOAD_POLICY) {
  const fileName = String(input.fileName || "").trim();
  const mimeType = String(input.mimeType || "").toLowerCase();
  const sizeBytes = Number(input.sizeBytes || 0);
  const extension = input.extension || fileExtension(fileName);

  return {
    file_name: Boolean(fileName),
    mime_type: policy.allowedMimeTypes.includes(mimeType),
    extension: policy.allowedExtensions.includes(extension),
    not_empty: sizeBytes > 0,
    size: sizeBytes > 0 && sizeBytes <= policy.maxFileBytes,
  };
}

function parseDataUrlMeta(dataUrl) {
  const match = DATA_URL_PATTERN.exec(String(dataUrl || ""));
  if (!match) {
    return { valid: false, reason: UPLOAD_REASONS.INVALID_DATA_URL };
  }
  const base64 = match[2] || "";
  return {
    valid: true,
    mimeType: (match[1] || "text/plain").toLowerCase(),
    sizeBytes: estimateBase64DecodedBytes(base64),
  };
}

function estimateBase64DecodedBytes(base64) {
  const clean = String(base64 || "").replace(/\s/g, "");
  if (!clean) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function fileExtension(fileName) {
  const lower = String(fileName || "").toLowerCase();
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index) : "";
}

function normalizeList(value, fallback) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  return normalized.length > 0 ? normalized : [...fallback];
}
