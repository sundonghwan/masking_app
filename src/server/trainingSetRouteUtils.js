import { filterActiveImages } from "../export/exporter.js";
import { normalizeRevision } from "./revisions.js";

export function createTrainingSourceSummary({ project = {}, task = {}, version = {} }) {
  const images = Array.isArray(version.images) ? version.images : [];
  const active = filterActiveImages(images);
  return {
    project_id: version.project_id || project.project_id,
    project_name: project.name || version.project_name || version.project_id || project.project_id,
    task_id: version.task_id || task.task_id || "legacy_project",
    task_name: task.name || version.task_name || version.task_id || "Legacy Project",
    version_id: version.version_id || "legacy",
    status: version.status || "",
    created_at: version.created_at || "",
    updated_at: version.updated_at || "",
    revision: normalizeRevision(version.revision),
    total_images: images.length,
    active_images: active.length,
    submitted_images: active.filter((image) => image.status === "submitted").length,
    approved_images: active.filter((image) => image.status === "approved").length,
    rejected_images: active.filter((image) => image.status === "rejected").length,
    deleted_at: version.deleted_at || "",
  };
}

export function normalizeTrainingSetId(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 120);
}

export function normalizeTrainingSourceRef(source = {}) {
  return {
    project_id: source.project_id || source.projectId || "",
    task_id: source.task_id || source.taskId || "legacy_project",
    version_id: source.version_id || source.versionId || "legacy",
  };
}

export function splitListFromManifest(manifest = {}, split) {
  return `${(manifest.training_set?.items || [])
    .filter((item) => item.split === split)
    .map((item) => `${item.image_path} ${item.mask_path}`)
    .join("\n")}\n`;
}
