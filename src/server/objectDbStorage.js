import { Readable } from "node:stream";

import { normalizeLabelSchema } from "../annotations/labels.js";
import { normalizeUploadPolicy } from "../upload/policy.js";
import { sanitizeRelativePath, sanitizeSegment } from "./storage.js";

const DEFAULT_TASK_ID = "default_task";
const DEFAULT_VERSION_ID = "v1";

export function createObjectDbStorage({ pool, objectClient, bucket } = {}) {
  if (!pool?.query) throw new TypeError("metadata database pool is required");
  if (!objectClient) throw new TypeError("object storage client is required");
  const bucketName = String(bucket || "").trim();
  if (!bucketName) throw new TypeError("object storage bucket is required");

  return {
    async close() {
      if (typeof pool.end === "function") {
        await pool.end();
      }
    },

    async ensureProject(projectId, input = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const existing = await this.readProjectManifest(safeProjectId);
      if (existing) return existing;
      const now = new Date().toISOString();
      const manifest = {
        project_id: safeProjectId,
        id: safeProjectId,
        name: String(input.name || safeProjectId),
        description: String(input.description || ""),
        images: [],
        label_schema: normalizeLabelSchema(input.label_schema || []),
        upload_policy: normalizeUploadPolicy(input.upload_policy || {}),
        revision: 1,
        created_at: now,
        updated_at: now,
      };
      await this.writeProjectManifest(safeProjectId, manifest);
      return manifest;
    },

    async listProjects(options = {}) {
      const result = await pool.query(`
        SELECT
          p.project_id,
          p.name,
          p.description,
          p.revision,
          p.deleted_at,
          p.created_at,
          p.updated_at,
          COUNT(i.image_id) FILTER (WHERE i.deleted_at IS NULL) AS total_images,
          COUNT(i.image_id) FILTER (WHERE i.deleted_at IS NULL AND i.status = 'submitted') AS submitted_images,
          COUNT(i.image_id) FILTER (WHERE i.deleted_at IS NULL AND i.status = 'approved') AS approved_images,
          COUNT(i.image_id) FILTER (WHERE i.deleted_at IS NULL AND i.status = 'rejected') AS rejected_images
        FROM projects p
        LEFT JOIN images i ON i.project_id = p.project_id
        WHERE ($1::boolean OR p.deleted_at IS NULL)
        GROUP BY p.project_id
        ORDER BY p.updated_at DESC, p.project_id ASC
      `, [Boolean(options.includeDeleted)]);
      return result.rows.map((row) => ({
        project_id: row.project_id,
        name: row.name || row.project_id,
        description: row.description || "",
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
        revision: Number(row.revision || 1),
        deleted_at: iso(row.deleted_at),
        total_images: Number(row.total_images || 0),
        submitted_images: Number(row.submitted_images || 0),
        approved_images: Number(row.approved_images || 0),
        rejected_images: Number(row.rejected_images || 0),
      }));
    },

    async readProjectManifest(projectId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const projectResult = await pool.query("SELECT * FROM projects WHERE project_id = $1", [safeProjectId]);
      const project = projectResult.rows[0];
      if (!project) return null;

      const imageResult = await pool.query(`
        SELECT * FROM images
        WHERE project_id = $1
        ORDER BY image_id ASC
      `, [safeProjectId]);
      const annotationResult = await pool.query(`
        SELECT * FROM annotations
        WHERE project_id = $1
        ORDER BY image_id ASC, class_id ASC
      `, [safeProjectId]);
      const reviewResult = await pool.query(`
        SELECT * FROM review_events
        WHERE project_id = $1
        ORDER BY created_at ASC, event_id ASC
      `, [safeProjectId]);

      const annotationsByImage = groupBy(annotationResult.rows, "image_id");
      const reviewsByImage = groupBy(reviewResult.rows, "image_id");
      const images = imageResult.rows.map((image) => imageRowToManifestRecord(image, {
        annotations: annotationsByImage.get(image.image_id) || [],
        reviewEvents: reviewsByImage.get(image.image_id) || [],
      }));

      return {
        project_id: project.project_id,
        id: project.project_id,
        name: project.name || project.project_id,
        description: project.description || "",
        images,
        label_schema: normalizeLabelSchema(project.label_schema || []),
        upload_policy: normalizeUploadPolicy(project.upload_policy || {}),
        revision: Number(project.revision || 1),
        deleted_at: iso(project.deleted_at),
        deleted_by: project.deleted_by || "",
        delete_reason: project.delete_reason || "",
        created_at: iso(project.created_at),
        updated_at: iso(project.updated_at),
      };
    },

    async writeProjectManifest(projectId, manifest = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const now = new Date().toISOString();
      await pool.query("BEGIN");
      try {
        await pool.query(`
          INSERT INTO projects (project_id, name, description, label_schema, upload_policy, revision, deleted_at, deleted_by, delete_reason, created_at, updated_at)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, NULLIF($7, '')::timestamptz, $8, $9, COALESCE(NULLIF($10, '')::timestamptz, now()), COALESCE(NULLIF($11, '')::timestamptz, now()))
          ON CONFLICT (project_id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            label_schema = EXCLUDED.label_schema,
            upload_policy = EXCLUDED.upload_policy,
            revision = EXCLUDED.revision,
            deleted_at = EXCLUDED.deleted_at,
            deleted_by = EXCLUDED.deleted_by,
            delete_reason = EXCLUDED.delete_reason,
            updated_at = EXCLUDED.updated_at
        `, [
          safeProjectId,
          manifest.name || safeProjectId,
          manifest.description || "",
          JSON.stringify(normalizeLabelSchema(manifest.label_schema || [])),
          JSON.stringify(normalizeUploadPolicy(manifest.upload_policy || {})),
          Number(manifest.revision || 1),
          manifest.deleted_at || "",
          manifest.deleted_by || manifest.deletedBy || "",
          manifest.delete_reason || manifest.deleteReason || "",
          manifest.created_at || now,
          manifest.updated_at || now,
        ]);
        await ensureDefaultTaskVersion(safeProjectId, manifest, pool);
        await pool.query("DELETE FROM annotations WHERE project_id = $1", [safeProjectId]);
        await pool.query("DELETE FROM images WHERE project_id = $1", [safeProjectId]);

        for (const image of manifest.images || []) {
          await upsertImage(safeProjectId, image, pool);
          for (const annotation of image.annotations || []) {
            await upsertAnnotation(safeProjectId, image, annotation, pool);
          }
        }
        await pool.query("COMMIT");
        return manifest;
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    },

    async archiveProject(projectId, input = {}) {
      return this.updateProjectArchiveState(projectId, {
        mode: "archive",
        actor: input.deletedBy || input.deleted_by || "",
        reason: input.reason || input.deleteReason || input.delete_reason || "",
        now: input.now,
      });
    },

    async restoreProject(projectId, input = {}) {
      return this.updateProjectArchiveState(projectId, {
        mode: "restore",
        now: input.now,
      });
    },

    async updateProjectArchiveState(projectId, operation = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const manifest = await this.readProjectManifest(safeProjectId);
      if (!manifest) throw new TypeError("Project manifest is required");
      const now = normalizeNow(operation.now);
      const updated = operation.mode === "archive"
        ? {
            ...manifest,
            deleted_at: manifest.deleted_at || now,
            deleted_by: String(operation.actor || ""),
            delete_reason: String(operation.reason || ""),
            updated_at: now,
            revision: incrementProjectRevision(manifest.revision),
          }
        : {
            ...manifest,
            deleted_at: "",
            deleted_by: "",
            delete_reason: "",
            updated_at: now,
            revision: incrementProjectRevision(manifest.revision),
          };
      await this.writeProjectManifest(safeProjectId, updated);
      return updated;
    },

    async purgeProject(projectId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const manifest = await this.readProjectManifest(safeProjectId);
      if (!manifest) throw new TypeError("Project manifest is required");
      if (!manifest.deleted_at) throw new TypeError("Only archived projects can be purged");

      const prefix = `projects/${safeProjectId}/`;
      const objectNames = await listObjectNames(objectClient, bucketName, prefix);
      if (objectNames.length > 0) {
        await objectClient.removeObjects(bucketName, objectNames);
      }

      await pool.query("BEGIN");
      try {
        await pool.query("DELETE FROM review_events WHERE project_id = $1", [safeProjectId]);
        await pool.query("DELETE FROM export_records WHERE project_id = $1", [safeProjectId]);
        await pool.query("DELETE FROM projects WHERE project_id = $1", [safeProjectId]);
        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }

      return {
        project_id: safeProjectId,
        purged: true,
        deleted_files: objectNames.length,
      };
    },

    async listProjectTasks(projectId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const result = await pool.query(`
        SELECT * FROM tasks
        WHERE project_id = $1
        ORDER BY task_id ASC
      `, [safeProjectId]);
      return result.rows.map(taskRowToRecord);
    },

    async readTaskMetadata(projectId, taskId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeTaskId = sanitizeSegment(taskId, "taskId");
      const result = await pool.query("SELECT * FROM tasks WHERE project_id = $1 AND task_id = $2", [safeProjectId, safeTaskId]);
      return result.rows[0] ? taskRowToRecord(result.rows[0]) : null;
    },

    async listTaskVersions(projectId, taskId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeTaskId = sanitizeSegment(taskId, "taskId");
      const result = await pool.query(`
        SELECT * FROM versions
        WHERE project_id = $1 AND task_id = $2
        ORDER BY version_id ASC
      `, [safeProjectId, safeTaskId]);
      return result.rows.map(versionRowToSummary);
    },

    async readVersionManifest(projectId, taskId, versionId) {
      const manifest = await this.readProjectManifest(projectId);
      if (!manifest) return null;
      const safeTaskId = sanitizeSegment(taskId, "taskId");
      const safeVersionId = sanitizeSegment(versionId, "versionId");
      const result = await pool.query("SELECT * FROM versions WHERE project_id = $1 AND task_id = $2 AND version_id = $3", [
        sanitizeSegment(projectId, "projectId"),
        safeTaskId,
        safeVersionId,
      ]);
      const version = result.rows[0];
      if (!version) return null;
      return {
        ...manifest,
        task_id: safeTaskId,
        version_id: safeVersionId,
        status: version.status || "in_progress",
        revision: Number(version.revision || 1),
        deleted_at: iso(version.deleted_at),
      };
    },

    async writeImageBuffer(projectId, imageId, fileName, buffer, options = {}) {
      const nextObjectKey = objectKey(projectId, DEFAULT_TASK_ID, DEFAULT_VERSION_ID, `images/${sanitizeSegment(fileName || `${imageId}.png`, "fileName")}`);
      await putObject(objectClient, bucketName, nextObjectKey, buffer, options.mimeType || "application/octet-stream");
      return {
        relativePath: `images/${nextObjectKey.split("/").at(-1)}`,
        object_key: nextObjectKey,
      };
    },

    async writeImageFromDataUrl(projectId, imageId, fileName, dataUrl) {
      const decoded = decodeDataUrl(dataUrl);
      return this.writeImageBuffer(projectId, imageId, fileName, decoded.buffer, { mimeType: decoded.mimeType });
    },

    async writeMaskBuffer(projectId, imageId, buffer, options = {}) {
      const fileName = sanitizeSegment(options.fileName || `${imageId}_mask.png`, "fileName");
      const nextObjectKey = objectKey(projectId, DEFAULT_TASK_ID, DEFAULT_VERSION_ID, `masks/${fileName}`);
      await putObject(objectClient, bucketName, nextObjectKey, buffer, options.mimeType || "image/png");
      return {
        relativePath: `masks/${fileName}`,
        object_key: nextObjectKey,
      };
    },

    async writeMaskFromDataUrl(projectId, imageId, dataUrl) {
      const decoded = decodeDataUrl(dataUrl);
      return this.writeMaskBuffer(projectId, imageId, decoded.buffer, { mimeType: decoded.mimeType });
    },

    decodeMaskDataUrl(dataUrl) {
      return decodeDataUrl(dataUrl);
    },

    async readProjectFile(projectId, relativePath) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeRelative = sanitizeRelativePath(relativePath);
      const objectKey = await resolveObjectKey(pool, safeProjectId, safeRelative);
      const stream = await objectClient.getObject(bucketName, objectKey);
      return streamToBuffer(stream);
    },

    async softDeleteProjectImage(projectId, imageId, input = {}) {
      return this.updateProjectImageDeletion(projectId, imageId, {
        mode: "delete",
        actor: input.deletedBy || input.deleted_by || "",
        reason: input.reason || input.deleteReason || input.delete_reason || "",
        now: input.now,
      });
    },

    async restoreProjectImage(projectId, imageId, input = {}) {
      return this.updateProjectImageDeletion(projectId, imageId, {
        mode: "restore",
        now: input.now,
      });
    },

    async updateProjectImageDeletion(projectId, imageId, operation = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeImageId = sanitizeSegment(imageId, "imageId");
      const manifest = await this.readProjectManifest(safeProjectId);
      if (!manifest) throw new TypeError("Project manifest is required");
      const images = Array.isArray(manifest.images) ? manifest.images : [];
      const index = images.findIndex((image) => sanitizeSegment(image.id || image.image_id, "imageId") === safeImageId);
      if (index < 0) throw new TypeError("Image record is required");

      const now = normalizeNow(operation.now);
      const current = images[index];
      images[index] = operation.mode === "delete"
        ? {
            ...current,
            deleted_at: current.deleted_at || now,
            deleted_by: String(operation.actor || ""),
            delete_reason: String(operation.reason || ""),
            updated_at: now,
          }
        : {
            ...current,
            deleted_at: "",
            deleted_by: "",
            delete_reason: "",
            updated_at: now,
          };

      await this.writeProjectManifest(safeProjectId, {
        ...manifest,
        images,
        updated_at: now,
        revision: incrementProjectRevision(manifest.revision),
      });
      return images[index];
    },
  };
}

function imageRowToManifestRecord(row, { annotations = [], reviewEvents = [] } = {}) {
  const relativeImagePath = stripVersionPrefix(row.object_key);
  const mappedAnnotations = annotations.map(annotationRowToRecord);
  const firstAnnotation = mappedAnnotations[0] || null;
  return {
    id: row.image_id,
    image_id: row.image_id,
    project_id: row.project_id,
    task_id: row.task_id || DEFAULT_TASK_ID,
    version_id: row.version_id || DEFAULT_VERSION_ID,
    original_file_name: row.original_file_name || row.image_id,
    file_name: row.original_file_name || row.image_id,
    image_path: relativeImagePath,
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    status: row.status || "not_started",
    worker_id: row.worker_id || "",
    reviewer_id: row.reviewer_id || "",
    deleted_at: iso(row.deleted_at),
    deleted_by: row.deleted_by || "",
    delete_reason: row.delete_reason || "",
    current_mask_path: firstAnnotation?.mask_path || "",
    maskPath: firstAnnotation?.mask_path || "",
    server_image_synced: true,
    server_mask_synced: mappedAnnotations.length > 0,
    review_server_synced: true,
    assignment_server_synced: true,
    annotations: mappedAnnotations,
    review_events: reviewEvents.map(reviewRowToRecord),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function annotationRowToRecord(row) {
  return {
    annotation_id: row.annotation_id,
    image_id: row.image_id,
    class_id: Number(row.class_id),
    class_name: row.class_name,
    mask_path: stripVersionPrefix(row.mask_object_key),
    mask_width: Number(row.mask_width || 0),
    mask_height: Number(row.mask_height || 0),
    mask_ratio: Number(row.mask_ratio || 0),
    source: row.source || "manual",
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function reviewRowToRecord(row) {
  return {
    event_id: row.event_id,
    image_id: row.image_id,
    reviewer_id: row.reviewer_id || "",
    action: row.action || "",
    reason_code: row.reason_code || "",
    reason: row.reason || "",
    created_at: iso(row.created_at),
  };
}

function taskRowToRecord(row) {
  return {
    project_id: row.project_id,
    task_id: row.task_id,
    name: row.name || row.task_id,
    description: row.description || "",
    current_version: row.current_version || DEFAULT_VERSION_ID,
    archived: Boolean(row.archived),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function versionRowToSummary(row) {
  return {
    project_id: row.project_id,
    task_id: row.task_id,
    version_id: row.version_id,
    status: row.status || "in_progress",
    revision: Number(row.revision || 1),
    deleted_at: iso(row.deleted_at),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

async function ensureDefaultTaskVersion(projectId, manifest, pool) {
  const now = new Date().toISOString();
  await pool.query(`
    INSERT INTO tasks (project_id, task_id, name, description, current_version, created_at, updated_at)
    VALUES ($1, $2, $3, '', $4, COALESCE(NULLIF($5, '')::timestamptz, now()), COALESCE(NULLIF($6, '')::timestamptz, now()))
    ON CONFLICT (project_id, task_id) DO UPDATE SET
      name = EXCLUDED.name,
      current_version = EXCLUDED.current_version,
      updated_at = EXCLUDED.updated_at
  `, [projectId, DEFAULT_TASK_ID, DEFAULT_TASK_ID, DEFAULT_VERSION_ID, manifest.created_at || now, manifest.updated_at || now]);
  await pool.query(`
    INSERT INTO versions (project_id, task_id, version_id, status, revision, deleted_at, created_at, updated_at)
    VALUES ($1, $2, $3, 'in_progress', 1, NULL, COALESCE(NULLIF($4, '')::timestamptz, now()), COALESCE(NULLIF($5, '')::timestamptz, now()))
    ON CONFLICT (project_id, task_id, version_id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at
  `, [projectId, DEFAULT_TASK_ID, DEFAULT_VERSION_ID, manifest.created_at || now, manifest.updated_at || now]);
}

async function upsertImage(projectId, image, pool) {
  const imageId = sanitizeSegment(image.id || image.image_id, "imageId");
  const imagePath = sanitizeRelativePath(image.image_path || image.imagePath || `images/${imageId}`);
  await pool.query(`
    INSERT INTO images (project_id, task_id, version_id, image_id, original_file_name, object_key, width, height, status, worker_id, reviewer_id, deleted_at, deleted_by, delete_reason, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULLIF($12, '')::timestamptz, $13, $14, COALESCE(NULLIF($15, '')::timestamptz, now()), COALESCE(NULLIF($16, '')::timestamptz, now()))
    ON CONFLICT (project_id, task_id, version_id, image_id) DO UPDATE SET
      original_file_name = EXCLUDED.original_file_name,
      object_key = EXCLUDED.object_key,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      status = EXCLUDED.status,
      worker_id = EXCLUDED.worker_id,
      reviewer_id = EXCLUDED.reviewer_id,
      deleted_at = EXCLUDED.deleted_at,
      deleted_by = EXCLUDED.deleted_by,
      delete_reason = EXCLUDED.delete_reason,
      updated_at = EXCLUDED.updated_at
  `, [
    projectId,
    DEFAULT_TASK_ID,
    DEFAULT_VERSION_ID,
    imageId,
    image.original_file_name || image.file_name || imageId,
    objectKey(projectId, DEFAULT_TASK_ID, DEFAULT_VERSION_ID, imagePath),
    Number(image.width || 0),
    Number(image.height || 0),
    image.status || "not_started",
    image.worker_id || image.workerId || "",
    image.reviewer_id || image.reviewerId || "",
    image.deleted_at || "",
    image.deleted_by || image.deletedBy || "",
    image.delete_reason || image.deleteReason || "",
    image.created_at || "",
    image.updated_at || new Date().toISOString(),
  ]);
}

async function upsertAnnotation(projectId, image, annotation, pool) {
  const imageId = sanitizeSegment(image.id || image.image_id, "imageId");
  const classId = Number(annotation.class_id || annotation.classId);
  const className = String(annotation.class_name || annotation.className || `class_${classId}`);
  const maskPath = sanitizeRelativePath(annotation.mask_path || annotation.maskPath);
  await pool.query(`
    INSERT INTO annotations (annotation_id, project_id, task_id, version_id, image_id, class_id, class_name, mask_object_key, mask_width, mask_height, mask_ratio, source, score, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE(NULLIF($14, '')::timestamptz, now()), COALESCE(NULLIF($15, '')::timestamptz, now()))
    ON CONFLICT (project_id, task_id, version_id, image_id, class_id) DO UPDATE SET
      class_name = EXCLUDED.class_name,
      mask_object_key = EXCLUDED.mask_object_key,
      mask_width = EXCLUDED.mask_width,
      mask_height = EXCLUDED.mask_height,
      mask_ratio = EXCLUDED.mask_ratio,
      source = EXCLUDED.source,
      score = EXCLUDED.score,
      updated_at = EXCLUDED.updated_at
  `, [
    annotation.annotation_id || `ann_${imageId}_class_${classId}`,
    projectId,
    DEFAULT_TASK_ID,
    DEFAULT_VERSION_ID,
    imageId,
    classId,
    className,
    objectKey(projectId, DEFAULT_TASK_ID, DEFAULT_VERSION_ID, maskPath),
    Number(annotation.mask_width || annotation.maskWidth || image.width || 0),
    Number(annotation.mask_height || annotation.maskHeight || image.height || 0),
    Number(annotation.mask_ratio || annotation.maskRatio || image.mask_ratio || 0),
    annotation.source || "manual",
    annotation.score === undefined ? null : annotation.score,
    annotation.created_at || image.created_at || "",
    annotation.updated_at || image.updated_at || new Date().toISOString(),
  ]);
}

async function resolveObjectKey(pool, projectId, relativePath) {
  if (relativePath.startsWith("images/")) {
    const result = await pool.query("SELECT object_key FROM images WHERE project_id = $1 AND object_key = $2 UNION ALL SELECT object_key FROM images WHERE project_id = $1 AND object_key = $3 LIMIT 1", [
      projectId,
      relativePath,
      objectKey(projectId, DEFAULT_TASK_ID, DEFAULT_VERSION_ID, relativePath),
    ]);
    if (result.rows[0]?.object_key) return result.rows[0].object_key;
  }
  if (relativePath.startsWith("masks/")) {
    const result = await pool.query("SELECT mask_object_key AS object_key FROM annotations WHERE project_id = $1 AND mask_object_key = $2 UNION ALL SELECT mask_object_key AS object_key FROM annotations WHERE project_id = $1 AND mask_object_key = $3 LIMIT 1", [
      projectId,
      relativePath,
      objectKey(projectId, DEFAULT_TASK_ID, DEFAULT_VERSION_ID, relativePath),
    ]);
    if (result.rows[0]?.object_key) return result.rows[0].object_key;
  }
  throw new Error(`Project file not found: ${relativePath}`);
}

function objectKey(projectId, taskId, versionId, relativePath) {
  return `projects/${sanitizeSegment(projectId, "projectId")}/tasks/${sanitizeSegment(taskId, "taskId")}/versions/${sanitizeSegment(versionId, "versionId")}/${sanitizeRelativePath(relativePath)}`;
}

function stripVersionPrefix(value) {
  const key = String(value || "");
  const marker = "/versions/";
  const index = key.indexOf(marker);
  if (index < 0) return key;
  const afterVersion = key.slice(index + marker.length);
  const parts = afterVersion.split("/");
  return parts.slice(1).join("/");
}

async function putObject(client, bucket, key, buffer, mimeType) {
  await client.putObject(bucket, key, buffer, buffer.length, { "content-type": mimeType });
}

async function listObjectNames(client, bucket, prefix) {
  const names = [];
  const stream = client.listObjectsV2(bucket, prefix, true);
  for await (const item of Readable.from(stream)) {
    if (item?.name) names.push(item.name);
  }
  return names;
}

async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  const chunks = [];
  for await (const chunk of Readable.from(stream)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!match) throw new TypeError("Invalid data URL");
  return {
    mimeType: match[1] || "application/octet-stream",
    buffer: Buffer.from(match[2], "base64"),
  };
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function iso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeNow(value) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function incrementProjectRevision(value) {
  const revision = Number(value || 1);
  return Number.isFinite(revision) ? revision + 1 : 2;
}
