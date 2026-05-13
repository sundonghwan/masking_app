import { normalizeLabelSchema } from "../annotations/labels.js";
import { createExportPaths, createProjectRecord, createValidationSummary, serializeJson } from "./exporter.js";

export function createTrainingSetManifest(sources = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const items = [];
  const sourceVersions = [];
  const labelSchema = [];
  const splitConfig = normalizeSplitConfig(options.split || options.splitConfig);

  for (const source of sources) {
    const project = createProjectRecord({
      id: source.project_id || source.projectId,
      name: source.project_name || source.projectName || source.project_id || source.projectId,
    }, { now });
    const taskId = source.task_id || source.taskId || "legacy_project";
    const versionId = source.version_id || source.versionId || "legacy";
    const images = Array.isArray(source.images) ? source.images.filter((image) => !image.deleted_at) : [];
    mergeLabelSchema(labelSchema, normalizeLabelSchema(source.label_schema || source.labelSchema || []));
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
      const annotations = trainingAnnotationsForImage(image);
      annotations.forEach((annotation) => {
        const paths = createTrainingSetPaths({ projectId: project.id, taskId, versionId, image, annotation, index: items.length });
        const exportPaths = createExportPaths(image, { index });
        items.push({
          annotation_id: annotation.annotation_id,
          class_id: annotation.class_id,
          class_name: annotation.class_name,
          image_id: image.id,
          project_id: project.id,
          task_id: taskId,
          version_id: versionId,
          original_file_name: image.original_file_name || image.fileName || "",
          source_image_path: image.image_path || "",
          source_mask_path: annotation.mask_path || image.current_mask_path || "",
          image_path: paths.image_path,
          mask_path: paths.mask_path,
          default_image_path: exportPaths.image_path,
          default_mask_path: exportPaths.mask_path,
          width: image.width,
          height: image.height,
          mask_ratio: Number(annotation.mask_ratio ?? image.mask_ratio ?? 0),
          status: image.status,
          split: "",
        });
      });
    });
  }

  applySplits(items, splitConfig);
  const splitCounts = countSplits(items);

  return {
    training_set: {
      version: 1,
      training_set_id: options.trainingSetId || options.training_set_id || "",
      name: options.name || "",
      description: options.description || "",
      generated_at: now,
      approved_only: Boolean(options.approvedOnly),
      label_schema: labelSchema,
      split: splitConfig,
      split_counts: splitCounts,
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
    {
      path: "splits/train.txt",
      data: splitList(manifest.training_set.items, "train"),
    },
    {
      path: "splits/val.txt",
      data: splitList(manifest.training_set.items, "val"),
    },
    {
      path: "splits/test.txt",
      data: splitList(manifest.training_set.items, "test"),
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

function createTrainingSetPaths({ projectId, taskId, versionId, image, annotation, index }) {
  const classPart = annotation?.class_id ? `_class_${annotation.class_id}_${annotation.class_name || "mask"}` : "";
  const prefix = sanitizeTrainingPath(`${projectId}_${taskId}_${versionId}_${String(index + 1).padStart(4, "0")}_${image.id}${classPart}`);
  const sourceName = sanitizeTrainingPath(image.original_file_name || image.fileName || `${image.id}.png`);
  const imageName = sourceName.includes(".") ? `${prefix}_${sourceName}` : `${prefix}_${sourceName}.png`;
  return {
    image_path: `images/${imageName}`,
    mask_path: `masks/${stripExtension(imageName)}_mask.png`,
  };
}

function trainingAnnotationsForImage(image = {}) {
  if (Array.isArray(image.annotations) && image.annotations.length > 0) {
    return image.annotations.map((annotation) => ({
      annotation_id: annotation.annotation_id || `ann_${image.id}_class_${annotation.class_id}`,
      class_id: Number(annotation.class_id),
      class_name: annotation.class_name || "",
      mask_path: annotation.mask_path || image.current_mask_path || "",
      mask_ratio: Number(annotation.mask_ratio ?? image.mask_ratio ?? 0),
    }));
  }
  return [{
    annotation_id: "",
    class_id: null,
    class_name: "",
    mask_path: image.current_mask_path || "",
    mask_ratio: Number(image.mask_ratio || 0),
  }];
}

function mergeLabelSchema(target, labels) {
  for (const label of labels) {
    if (target.some((item) => Number(item.class_id) === Number(label.class_id))) continue;
    target.push({ ...label });
  }
  target.sort((left, right) => Number(left.class_id) - Number(right.class_id));
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

function normalizeSplitConfig(input = {}) {
  const train = Number(input.train ?? input.train_ratio ?? 0.8);
  const val = Number(input.val ?? input.validation ?? input.val_ratio ?? 0.1);
  const test = Number(input.test ?? input.test_ratio ?? 0.1);
  const seed = Number(input.seed ?? 42);
  const total = [train, val, test].filter(Number.isFinite).reduce((sum, value) => sum + Math.max(0, value), 0);
  const safeTotal = total > 0 ? total : 1;
  return {
    train: Math.max(0, Number.isFinite(train) ? train : 0.8) / safeTotal,
    val: Math.max(0, Number.isFinite(val) ? val : 0.1) / safeTotal,
    test: Math.max(0, Number.isFinite(test) ? test : 0.1) / safeTotal,
    seed: Number.isFinite(seed) ? Math.trunc(seed) : 42,
  };
}

function applySplits(items, splitConfig) {
  if (!Array.isArray(items) || items.length === 0) return;
  const ordered = [...items].sort((left, right) => {
    const leftKey = splitSortKey(left, splitConfig.seed);
    const rightKey = splitSortKey(right, splitConfig.seed);
    return leftKey.localeCompare(rightKey);
  });
  const total = ordered.length;
  const trainCount = Math.min(total, Math.round(total * splitConfig.train));
  const valCount = Math.min(total - trainCount, Math.round(total * splitConfig.val));
  ordered.forEach((item, index) => {
    item.split = index < trainCount
      ? "train"
      : index < trainCount + valCount
        ? "val"
        : "test";
  });
}

function splitSortKey(item, seed) {
  return `${hashString(`${seed}:${item.project_id}:${item.task_id}:${item.version_id}:${item.image_id}:${item.annotation_id || item.class_id || ""}`)}`.padStart(10, "0");
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function countSplits(items) {
  return {
    train: items.filter((item) => item.split === "train").length,
    val: items.filter((item) => item.split === "val").length,
    test: items.filter((item) => item.split === "test").length,
  };
}

function splitList(items, split) {
  return `${items
    .filter((item) => item.split === split)
    .map((item) => `${item.image_path} ${item.mask_path}`)
    .join("\n")}\n`;
}
