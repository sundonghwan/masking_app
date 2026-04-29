import assert from "node:assert/strict";
import test from "node:test";

import {
  UPLOAD_REASONS,
  formatBytes,
  uploadReasonLabel,
  validateBrowserUploadFile,
  validateImageDataUrlUpload,
  validateUploadCandidate,
} from "../src/upload/policy.js";

test("accepts supported image files within size limit", () => {
  const result = validateUploadCandidate({
    fileName: "frame.JPG",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.meta.extension, ".jpg");
});

test("rejects unsupported MIME types and extensions", () => {
  const result = validateBrowserUploadFile({
    name: "notes.txt",
    type: "text/plain",
    size: 10,
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, [
    UPLOAD_REASONS.UNSUPPORTED_MIME_TYPE,
    UPLOAD_REASONS.UNSUPPORTED_EXTENSION,
  ]);
});

test("rejects empty and oversized files", () => {
  assert.deepEqual(
    validateUploadCandidate({ fileName: "empty.png", mimeType: "image/png", sizeBytes: 0 }).reasons,
    [UPLOAD_REASONS.EMPTY_FILE, UPLOAD_REASONS.FILE_TOO_LARGE],
  );

  const large = validateUploadCandidate({
    fileName: "large.png",
    mimeType: "image/png",
    sizeBytes: 16 * 1024 * 1024,
  });

  assert.equal(large.valid, false);
  assert.deepEqual(large.reasons, [UPLOAD_REASONS.FILE_TOO_LARGE]);
});

test("validates image data URL upload metadata", () => {
  const result = validateImageDataUrlUpload({
    fileName: "frame.png",
    dataUrl: "data:image/png;base64,cG5n",
  });

  assert.equal(result.valid, true);
  assert.equal(result.meta.mimeType, "image/png");
  assert.equal(result.meta.sizeBytes, 3);
});

test("rejects malformed image data URLs", () => {
  const result = validateImageDataUrlUpload({
    fileName: "frame.png",
    dataUrl: "not-a-data-url",
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, [UPLOAD_REASONS.INVALID_DATA_URL]);
});

test("formats upload reason labels and byte counts", () => {
  assert.equal(uploadReasonLabel(UPLOAD_REASONS.FILE_TOO_LARGE), "파일 크기가 제한을 초과했습니다");
  assert.equal(formatBytes(1536), "1.5KB");
  assert.equal(formatBytes(15 * 1024 * 1024), "15MB");
});
