import { sendJson } from "./httpUtils.js";

export function assertRevisionMatch(response, request, body = {}, currentRevision = 0) {
  const expected = readIfMatchRevision(request, body);
  if (expected === null) return true;
  const actual = normalizeRevision(currentRevision);
  if (expected === actual) return true;
  sendJson(response, 409, {
    error: "revision_conflict",
    message: "The requested mutation is based on a stale revision",
    expected_revision: actual,
    received_revision: expected,
  });
  return false;
}

export function readIfMatchRevision(request, body = {}) {
  const value = body.if_match_revision ?? body.ifMatchRevision ?? request.headers["if-match"] ?? request.headers["If-Match"];
  if (value === undefined || value === null || value === "") return null;
  const cleaned = String(value).trim().replace(/^W\//i, "").replace(/^"|"$/g, "");
  const revision = Number(cleaned);
  return Number.isFinite(revision) ? revision : null;
}

export function normalizeRevision(value) {
  const revision = Number(value || 0);
  return Number.isFinite(revision) && revision >= 0 ? revision : 0;
}

export function nextRevision(value) {
  return normalizeRevision(value) + 1;
}
