import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TASK_ID = "default_task";
const DEFAULT_VERSION_ID = "v1";

export async function migrateFileStorageToObjectDb(options = {}) {
  const rootDir = path.resolve(options.rootDir || "data");
  const dryRun = options.dryRun !== false;
  const sources = await discoverFileStorageSources(rootDir);
  const summary = {
    ok: true,
    dry_run: dryRun,
    root_dir: rootDir,
    sources: sources.length,
    projects: 0,
    tasks: 0,
    versions: 0,
    images: 0,
    annotations: 0,
    uploaded_objects: 0,
    skipped_files: 0,
    errors: [],
  };

  for (const source of sources) {
    const plan = createSourceMigrationPlan(source);
    summary.projects += 1;
    summary.tasks += 1;
    summary.versions += 1;
    summary.images += plan.images.length;
    summary.annotations += plan.annotations.length;

    for (const object of plan.objects) {
      if (await fileExists(object.filePath)) {
        if (!dryRun) {
          await putFileObject(options.objectClient, options.bucket, object.objectKey, object.filePath);
        }
        summary.uploaded_objects += 1;
      } else {
        summary.skipped_files += 1;
        summary.errors.push({
          code: "source_file_missing",
          project_id: plan.project.project_id,
          path: object.relativePath,
        });
      }
    }

    if (!dryRun) {
      await upsertSourcePlan(options.pool, plan);
    }
  }

  summary.ok = summary.errors.length === 0;
  return summary;
}

export async function discoverFileStorageSources(rootDir) {
  const root = path.resolve(rootDir || "data");
  const sourcesByKey = new Map();

  for (const source of await discoverHierarchySources(root)) {
    sourcesByKey.set(sourceKey(source), source);
  }

  for (const source of await discoverLegacySources(root)) {
    const key = sourceKey(source);
    const existing = sourcesByKey.get(key);
    if (!existing || countImages(source.manifest) > countImages(existing.manifest)) {
      sourcesByKey.set(key, source);
    }
  }

  return [...sourcesByKey.values()].sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)));
}

export function createSourceMigrationPlan(source) {
  const projectId = source.projectId;
  const taskId = source.taskId || DEFAULT_TASK_ID;
  const versionId = source.versionId || DEFAULT_VERSION_ID;
  const manifest = source.manifest || {};
  const projectMetadata = source.projectMetadata || {};
  const taskMetadata = source.taskMetadata || {};
  const labelSchema = Array.isArray(manifest.label_schema) ? manifest.label_schema : [];
  const objects = [];
  const images = [];
  const annotations = [];

  for (const image of Array.isArray(manifest.images) ? manifest.images : []) {
    const imagePath = normalizeRelativePath(image.image_path || image.path || image.file_path);
    const imageObjectKey = objectKey(projectId, taskId, versionId, imagePath || `images/${image.id || image.image_id}`);
    if (imagePath) {
      objects.push({
        kind: "image",
        relativePath: imagePath,
        filePath: path.join(source.baseDir, imagePath),
        objectKey: imageObjectKey,
      });
    }
    images.push({
      project_id: projectId,
      task_id: taskId,
      version_id: versionId,
      image_id: String(image.id || image.image_id || path.basename(imagePath || "")).trim(),
      original_file_name: String(image.original_file_name || image.file_name || path.basename(imagePath || "")).trim(),
      object_key: imageObjectKey,
      width: normalizeInteger(image.width),
      height: normalizeInteger(image.height),
      status: String(image.status || "not_started"),
      worker_id: String(image.worker_id || image.assigned_to || ""),
      reviewer_id: String(image.reviewer_id || ""),
      deleted_at: nullableTimestamp(image.deleted_at),
    });

    for (const annotation of imageAnnotations(image, labelSchema)) {
      const maskPath = normalizeRelativePath(annotation.mask_path);
      const maskObjectKey = objectKey(projectId, taskId, versionId, maskPath || `masks/${image.id || image.image_id}-${annotation.class_id}.png`);
      if (maskPath) {
        objects.push({
          kind: "mask",
          relativePath: maskPath,
          filePath: path.join(source.baseDir, maskPath),
          objectKey: maskObjectKey,
        });
      }
      annotations.push({
        annotation_id: `${projectId}:${taskId}:${versionId}:${image.id || image.image_id}:${annotation.class_id}`,
        project_id: projectId,
        task_id: taskId,
        version_id: versionId,
        image_id: String(image.id || image.image_id || path.basename(imagePath || "")).trim(),
        class_id: normalizeInteger(annotation.class_id),
        class_name: String(annotation.class_name || ""),
        mask_object_key: maskObjectKey,
        mask_width: normalizeInteger(annotation.mask_width || image.mask_width || image.width),
        mask_height: normalizeInteger(annotation.mask_height || image.mask_height || image.height),
        mask_ratio: normalizeFloat(annotation.mask_ratio || image.mask_ratio),
        source: String(annotation.source || "manual"),
        score: annotation.score == null ? null : Number(annotation.score),
      });
    }
  }

  return {
    project: {
      project_id: projectId,
      name: String(manifest.name || projectMetadata.name || projectId),
      description: String(manifest.description || projectMetadata.description || ""),
      label_schema: labelSchema,
      upload_policy: manifest.upload_policy || {},
      revision: normalizeInteger(manifest.revision, 1),
      deleted_at: nullableTimestamp(manifest.deleted_at || projectMetadata.deleted_at),
      created_at: nullableTimestamp(manifest.created_at || projectMetadata.created_at),
      updated_at: nullableTimestamp(manifest.updated_at || projectMetadata.updated_at),
    },
    task: {
      project_id: projectId,
      task_id: taskId,
      name: String(taskMetadata.name || taskId),
      description: String(taskMetadata.description || ""),
      current_version: String(taskMetadata.current_version || versionId),
      archived: Boolean(taskMetadata.archived),
    },
    version: {
      project_id: projectId,
      task_id: taskId,
      version_id: versionId,
      status: String(manifest.status || "in_progress"),
      revision: normalizeInteger(manifest.revision, 1),
      deleted_at: nullableTimestamp(manifest.deleted_at),
    },
    images,
    annotations,
    objects,
  };
}

async function discoverHierarchySources(root) {
  const projectsRoot = path.join(root, "projects");
  const sources = [];
  for (const projectEntry of await readDirs(projectsRoot)) {
    const projectId = projectEntry.name;
    const projectRoot = path.join(projectsRoot, projectId);
    const projectMetadata = await readJson(path.join(projectRoot, "project.json")) || {};
    const tasksRoot = path.join(projectRoot, "tasks");
    for (const taskEntry of await readDirs(tasksRoot)) {
      const taskId = taskEntry.name;
      const taskRoot = path.join(tasksRoot, taskId);
      const taskMetadata = await readJson(path.join(taskRoot, "task.json")) || {};
      const versionsRoot = path.join(taskRoot, "versions");
      for (const versionEntry of await readDirs(versionsRoot)) {
        const versionId = versionEntry.name;
        const baseDir = path.join(versionsRoot, versionId);
        const manifest = await readJson(path.join(baseDir, "manifest.json"));
        if (manifest) {
          sources.push({ projectId, taskId, versionId, baseDir, manifest, projectMetadata, taskMetadata });
        }
      }
    }
  }
  return sources;
}

async function discoverLegacySources(root) {
  const sources = [];
  for (const entry of await readDirs(root)) {
    if (entry.name === "projects") continue;
    const baseDir = path.join(root, entry.name);
    const manifest = await readJson(path.join(baseDir, "manifest.json"));
    if (manifest) {
      sources.push({
        projectId: String(manifest.project_id || entry.name),
        taskId: DEFAULT_TASK_ID,
        versionId: DEFAULT_VERSION_ID,
        baseDir,
        manifest,
        projectMetadata: {},
        taskMetadata: {},
      });
    }
  }
  return sources;
}

async function upsertSourcePlan(pool, plan) {
  if (!pool?.query) throw new TypeError("metadata database pool is required");
  await pool.query("BEGIN");
  try {
    await upsertProject(pool, plan.project);
    await upsertTask(pool, plan.task);
    await upsertVersion(pool, plan.version);
    for (const image of plan.images) await upsertImage(pool, image);
    for (const annotation of plan.annotations) await upsertAnnotation(pool, annotation);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function upsertProject(pool, project) {
  await pool.query(`
INSERT INTO projects (project_id, name, description, label_schema, upload_policy, revision, deleted_at, created_at, updated_at)
VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, COALESCE($8, now()), COALESCE($9, now()))
ON CONFLICT (project_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  label_schema = EXCLUDED.label_schema,
  upload_policy = EXCLUDED.upload_policy,
  revision = EXCLUDED.revision,
  deleted_at = EXCLUDED.deleted_at,
  updated_at = EXCLUDED.updated_at
`, [
    project.project_id,
    project.name,
    project.description,
    JSON.stringify(project.label_schema),
    JSON.stringify(project.upload_policy),
    project.revision,
    project.deleted_at,
    project.created_at,
    project.updated_at,
  ]);
}

async function upsertTask(pool, task) {
  await pool.query(`
INSERT INTO tasks (project_id, task_id, name, description, current_version, archived)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (project_id, task_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  current_version = EXCLUDED.current_version,
  archived = EXCLUDED.archived,
  updated_at = now()
`, [task.project_id, task.task_id, task.name, task.description, task.current_version, task.archived]);
}

async function upsertVersion(pool, version) {
  await pool.query(`
INSERT INTO versions (project_id, task_id, version_id, status, revision, deleted_at)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (project_id, task_id, version_id) DO UPDATE SET
  status = EXCLUDED.status,
  revision = EXCLUDED.revision,
  deleted_at = EXCLUDED.deleted_at,
  updated_at = now()
`, [version.project_id, version.task_id, version.version_id, version.status, version.revision, version.deleted_at]);
}

async function upsertImage(pool, image) {
  await pool.query(`
INSERT INTO images (project_id, task_id, version_id, image_id, original_file_name, object_key, width, height, status, worker_id, reviewer_id, deleted_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (project_id, task_id, version_id, image_id) DO UPDATE SET
  original_file_name = EXCLUDED.original_file_name,
  object_key = EXCLUDED.object_key,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  status = EXCLUDED.status,
  worker_id = EXCLUDED.worker_id,
  reviewer_id = EXCLUDED.reviewer_id,
  deleted_at = EXCLUDED.deleted_at,
  updated_at = now()
`, [
    image.project_id,
    image.task_id,
    image.version_id,
    image.image_id,
    image.original_file_name,
    image.object_key,
    image.width,
    image.height,
    image.status,
    image.worker_id,
    image.reviewer_id,
    image.deleted_at,
  ]);
}

async function upsertAnnotation(pool, annotation) {
  await pool.query(`
INSERT INTO annotations (annotation_id, project_id, task_id, version_id, image_id, class_id, class_name, mask_object_key, mask_width, mask_height, mask_ratio, source, score)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
ON CONFLICT (project_id, task_id, version_id, image_id, class_id) DO UPDATE SET
  class_name = EXCLUDED.class_name,
  mask_object_key = EXCLUDED.mask_object_key,
  mask_width = EXCLUDED.mask_width,
  mask_height = EXCLUDED.mask_height,
  mask_ratio = EXCLUDED.mask_ratio,
  source = EXCLUDED.source,
  score = EXCLUDED.score,
  updated_at = now()
`, [
    annotation.annotation_id,
    annotation.project_id,
    annotation.task_id,
    annotation.version_id,
    annotation.image_id,
    annotation.class_id,
    annotation.class_name,
    annotation.mask_object_key,
    annotation.mask_width,
    annotation.mask_height,
    annotation.mask_ratio,
    annotation.source,
    annotation.score,
  ]);
}

async function putFileObject(client, bucket, objectKey, filePath) {
  if (!client) throw new TypeError("object storage client is required");
  if (client.fPutObject) {
    await client.fPutObject(bucket, objectKey, filePath);
    return;
  }
  const buffer = await readFile(filePath);
  await client.putObject(bucket, objectKey, buffer);
}

function imageAnnotations(image, labelSchema) {
  const annotations = [];
  for (const annotation of Array.isArray(image.class_annotations) ? image.class_annotations : []) {
    const label = labelSchema.find((item) => Number(item.class_id) === Number(annotation.class_id));
    annotations.push({
      class_id: annotation.class_id,
      class_name: annotation.class_name || label?.name || "",
      mask_path: annotation.mask_path || annotation.current_mask_path || annotation.mask_file_path,
      mask_width: annotation.mask_width,
      mask_height: annotation.mask_height,
      mask_ratio: annotation.mask_ratio,
      source: annotation.source,
      score: annotation.score,
    });
  }
  if (annotations.length === 0 && image.current_mask_path) {
    const label = labelSchema.length === 1 ? labelSchema[0] : null;
    annotations.push({
      class_id: label?.class_id || 0,
      class_name: label?.name || "unlabeled",
      mask_path: image.current_mask_path,
      mask_width: image.mask_width || image.width,
      mask_height: image.mask_height || image.height,
      mask_ratio: image.mask_ratio,
    });
  }
  return annotations.filter((annotation) => annotation.mask_path);
}

async function readDirs(dir) {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function sourceKey(source) {
  return `${source.projectId}/${source.taskId || DEFAULT_TASK_ID}/${source.versionId || DEFAULT_VERSION_ID}`;
}

function countImages(manifest) {
  return Array.isArray(manifest?.images) ? manifest.images.length : 0;
}

function objectKey(projectId, taskId, versionId, relativePath) {
  return ["projects", projectId, "tasks", taskId, "versions", versionId, normalizeRelativePath(relativePath)]
    .filter(Boolean)
    .join("/");
}

function normalizeRelativePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return "";
  return normalized;
}

function normalizeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function normalizeFloat(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableTimestamp(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}
