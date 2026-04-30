import { createExportPaths, createProjectRecord, createValidationSummary, serializeJson } from "./exporter.js";

export function createTrainingSetManifest(sources = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const items = [];
  const sourceVersions = [];

  for (const source of sources) {
    const project = createProjectRecord({
      id: source.project_id || source.projectId,
      name: source.project_name || source.projectName || source.project_id || source.projectId,
    }, { now });
    const taskId = source.task_id || source.taskId || "legacy_project";
    const versionId = source.version_id || source.versionId || "legacy";
    const images = Array.isArray(source.images) ? source.images.filter((image) => !image.deleted_at) : [];
    const validation = createValidationSummary(project, images, {
      now,
      approvedOnly: Boolean(options.approvedOnly),
    });

    sourceVersions.push({
      project_id: project.id,
      task_id: taskId,
      version_id: versionId,
      total_images: validation.total_images,
      exportable_images: validation.exportable_images,
      excluded_images: validation.excluded_images,
    });

    images.forEach((image, index) => {
      const validationItem = validation.items[index];
      if (!validationItem?.exportable) return;
      const paths = createTrainingSetPaths({ projectId: project.id, taskId, versionId, image, index: items.length });
      const exportPaths = createExportPaths(image, { index });
      items.push({
        image_id: image.id,
        project_id: project.id,
        task_id: taskId,
        version_id: versionId,
        original_file_name: image.original_file_name || image.fileName || "",
        source_image_path: image.image_path || "",
        source_mask_path: image.current_mask_path || "",
        image_path: paths.image_path,
        mask_path: paths.mask_path,
        default_image_path: exportPaths.image_path,
        default_mask_path: exportPaths.mask_path,
        width: image.width,
        height: image.height,
        status: image.status,
      });
    });
  }

  return {
    training_set: {
      version: 1,
      generated_at: now,
      approved_only: Boolean(options.approvedOnly),
      total_sources: sourceVersions.length,
      total_items: items.length,
      items,
    },
    source_versions: {
      version: 1,
      generated_at: now,
      sources: sourceVersions,
    },
  };
}

export function createTrainingSetZipEntries(sources = [], options = {}) {
  const manifest = createTrainingSetManifest(sources, options);
  const entries = [
    {
      path: "training_set.json",
      data: serializeJson(manifest.training_set),
    },
    {
      path: "source_versions.json",
      data: serializeJson(manifest.source_versions),
    },
  ];

  for (const item of manifest.training_set.items) {
    entries.push({
      path: item.image_path,
      source_project_id: item.project_id,
      source_task_id: item.task_id,
      source_version_id: item.version_id,
      source_path: item.source_image_path,
      kind: "image",
    });
    entries.push({
      path: item.mask_path,
      source_project_id: item.project_id,
      source_task_id: item.task_id,
      source_version_id: item.version_id,
      source_path: item.source_mask_path,
      kind: "mask",
    });
  }

  return {
    ...manifest,
    entries,
  };
}

function createTrainingSetPaths({ projectId, taskId, versionId, image, index }) {
  const prefix = sanitizeTrainingPath(`${projectId}_${taskId}_${versionId}_${String(index + 1).padStart(4, "0")}_${image.id}`);
  const sourceName = sanitizeTrainingPath(image.original_file_name || image.fileName || `${image.id}.png`);
  const imageName = sourceName.includes(".") ? `${prefix}_${sourceName}` : `${prefix}_${sourceName}.png`;
  return {
    image_path: `images/${imageName}`,
    mask_path: `masks/${stripExtension(imageName)}_mask.png`,
  };
}

function sanitizeTrainingPath(value) {
  return String(value || "item")
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 180) || "item";
}

function stripExtension(value) {
  return String(value).replace(/\.[^.]+$/, "");
}
