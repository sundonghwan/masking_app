import { normalizeLabelSchema } from "../annotations/labels.js";
import { normalizeUploadPolicy } from "../upload/policy.js";
import { nextRevision } from "./revisions.js";

export function buildProjectSettingsUpdate({ projectId, manifest, body = {}, now = new Date().toISOString() } = {}) {
  const projectNameProvided = Object.hasOwn(body, "name") || Object.hasOwn(body, "project_name") || Object.hasOwn(body, "projectName");
  const descriptionProvided = Object.hasOwn(body, "description");
  const uploadPolicyProvided = Object.hasOwn(body, "upload_policy") || Object.hasOwn(body, "uploadPolicy");
  const magicToolProvided = Object.hasOwn(body, "magic_tool_preset") || Object.hasOwn(body, "magicToolPreset");
  const labelSchemaProvided = Object.hasOwn(body, "label_schema") || Object.hasOwn(body, "labelSchema");

  return {
    ...manifest,
    ...(projectNameProvided
      ? { name: String(body.name || body.project_name || body.projectName || projectId).trim() || projectId }
      : {}),
    ...(descriptionProvided
      ? { description: String(body.description || "").trim() }
      : {}),
    ...(uploadPolicyProvided
      ? { upload_policy: normalizeUploadPolicy(body.upload_policy || body.uploadPolicy || {}, manifest.upload_policy) }
      : {}),
    ...(magicToolProvided
      ? { magic_tool_preset: normalizeMagicToolPreset(body.magic_tool_preset || body.magicToolPreset || {}, manifest.magic_tool_preset) }
      : {}),
    ...(labelSchemaProvided
      ? { label_schema: normalizeLabelSchema(body.label_schema || body.labelSchema || manifest.label_schema) }
      : {}),
    revision: nextRevision(manifest.revision),
    updated_at: now,
  };
}

export function normalizeMagicToolPreset(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    colorTolerance: clampNumber(source.colorTolerance ?? source.color_tolerance ?? base.colorTolerance ?? 42, 0, 255),
    edgeThreshold: clampNumber(source.edgeThreshold ?? source.edge_threshold ?? base.edgeThreshold ?? 55, 0, 255),
    maxPixels: clampNumber(source.maxPixels ?? source.max_pixels ?? base.maxPixels ?? 70000, 1, 10000000),
    smoothIterations: clampNumber(source.smoothIterations ?? source.smooth_iterations ?? base.smoothIterations ?? 1, 0, 8),
  };
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
