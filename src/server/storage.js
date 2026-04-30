import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MANIFEST = {
  project_id: "",
  name: "",
  images: [],
  created_at: "",
  updated_at: "",
};

const DEFAULT_ROOT_DIR = process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data";
const DATA_URL_PATTERN = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i;
const PROJECT_DIRS = ["images", "masks", "exports"];
const VERSION_DIRS = ["images", "masks", "exports", "trash/images", "trash/masks"];
const DEFAULT_TASK_ID = "default_task";
const DEFAULT_VERSION_ID = "v1";

const defaultStorage = createFileStorage({ rootDir: DEFAULT_ROOT_DIR });

export function createFileStorage({ rootDir = "data" } = {}) {
  const absoluteRoot = path.resolve(rootDir);

  return {
    rootDir: absoluteRoot,
    async ensureProject(projectId, input = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const projectDir = projectPath(safeProjectId);
      await Promise.all(PROJECT_DIRS.map((dir) => mkdir(safeJoin(projectDir, dir), { recursive: true })));

      const existing = await this.readProjectManifest(safeProjectId);
      if (existing) return existing;

      const now = new Date().toISOString();
      const manifest = {
        ...DEFAULT_MANIFEST,
        project_id: safeProjectId,
        name: String(input.name || safeProjectId),
        created_at: now,
        updated_at: now,
      };
      await this.writeProjectManifest(safeProjectId, manifest);
      return manifest;
    },
    async readProjectManifest(projectId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const file = safeJoin(projectPath(safeProjectId), "manifest.json");
      try {
        return JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async writeProjectManifest(projectId, manifest) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      assertJsonSerializable(manifest, "manifest");
      await Promise.all([
        mkdir(projectPath(safeProjectId), { recursive: true }),
        ...PROJECT_DIRS.map((dir) => mkdir(safeJoin(projectPath(safeProjectId), dir), { recursive: true })),
      ]);
      await writeFile(
        safeJoin(projectPath(safeProjectId), "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      return manifest;
    },
    getHierarchyPaths(projectId, taskId = DEFAULT_TASK_ID, versionId = DEFAULT_VERSION_ID) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeTaskId = sanitizeSegment(taskId, "taskId");
      const safeVersionId = sanitizeSegment(versionId, "versionId");
      const projectRoot = hierarchyProjectPath(safeProjectId);
      const taskRoot = safeJoin(projectRoot, "tasks", safeTaskId);
      const versionRoot = safeJoin(taskRoot, "versions", safeVersionId);

      return {
        projectId: safeProjectId,
        taskId: safeTaskId,
        versionId: safeVersionId,
        projectRoot,
        taskRoot,
        versionRoot,
        projectMetadataPath: safeJoin(projectRoot, "project.json"),
        taskMetadataPath: safeJoin(taskRoot, "task.json"),
        versionManifestPath: safeJoin(versionRoot, "manifest.json"),
      };
    },
    async ensureProjectMetadata(projectId, input = {}) {
      const paths = this.getHierarchyPaths(projectId);
      const existing = await readJsonFile(paths.projectMetadataPath);
      if (existing) return existing;

      const now = normalizeNow(input.now);
      const metadata = {
        project_id: paths.projectId,
        name: String(input.name || paths.projectId),
        description: String(input.description || ""),
        created_by: String(input.createdBy || input.created_by || ""),
        created_at: now,
        updated_at: now,
        archived: Boolean(input.archived || false),
      };
      await this.writeProjectMetadata(paths.projectId, metadata);
      return metadata;
    },
    async readProjectMetadata(projectId) {
      const paths = this.getHierarchyPaths(projectId);
      return readJsonFile(paths.projectMetadataPath);
    },
    async writeProjectMetadata(projectId, metadata) {
      const paths = this.getHierarchyPaths(projectId);
      assertJsonSerializable(metadata, "projectMetadata");
      await mkdir(paths.projectRoot, { recursive: true });
      await writeJsonFile(paths.projectMetadataPath, metadata);
      return metadata;
    },
    async ensureTaskMetadata(projectId, taskId = DEFAULT_TASK_ID, input = {}) {
      await this.ensureProjectMetadata(projectId, input.project || {});
      const paths = this.getHierarchyPaths(projectId, taskId);
      const existing = await readJsonFile(paths.taskMetadataPath);
      if (existing) return existing;

      const now = normalizeNow(input.now);
      const metadata = {
        project_id: paths.projectId,
        task_id: paths.taskId,
        name: String(input.name || paths.taskId),
        description: String(input.description || ""),
        created_by: String(input.createdBy || input.created_by || ""),
        created_at: now,
        updated_at: now,
        current_version: sanitizeSegment(input.currentVersion || input.current_version || DEFAULT_VERSION_ID, "versionId"),
        archived: Boolean(input.archived || false),
      };
      await this.writeTaskMetadata(paths.projectId, paths.taskId, metadata);
      return metadata;
    },
    async readTaskMetadata(projectId, taskId = DEFAULT_TASK_ID) {
      const paths = this.getHierarchyPaths(projectId, taskId);
      return readJsonFile(paths.taskMetadataPath);
    },
    async writeTaskMetadata(projectId, taskId = DEFAULT_TASK_ID, metadata) {
      const paths = this.getHierarchyPaths(projectId, taskId);
      assertJsonSerializable(metadata, "taskMetadata");
      await mkdir(paths.taskRoot, { recursive: true });
      await writeJsonFile(paths.taskMetadataPath, metadata);
      return metadata;
    },
    async ensureVersionManifest(projectId, taskId = DEFAULT_TASK_ID, versionId = DEFAULT_VERSION_ID, input = {}) {
      await this.ensureTaskMetadata(projectId, taskId, {
        currentVersion: versionId,
        project: input.project || {},
        now: input.now,
      });
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      await ensureVersionDirs(paths.versionRoot);

      const existing = await readJsonFile(paths.versionManifestPath);
      if (existing) return existing;

      const now = normalizeNow(input.now);
      const manifest = {
        project_id: paths.projectId,
        task_id: paths.taskId,
        version_id: paths.versionId,
        status: String(input.status || "in_progress"),
        created_by: String(input.createdBy || input.created_by || ""),
        created_at: now,
        updated_at: now,
        images: Array.isArray(input.images) ? input.images.map((image) => normalizeVersionImageRecord(image, paths, now)) : [],
      };
      await this.writeVersionManifest(paths.projectId, paths.taskId, paths.versionId, manifest);
      return manifest;
    },
    async readVersionManifest(projectId, taskId = DEFAULT_TASK_ID, versionId = DEFAULT_VERSION_ID) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      return readJsonFile(paths.versionManifestPath);
    },
    async writeVersionManifest(projectId, taskId = DEFAULT_TASK_ID, versionId = DEFAULT_VERSION_ID, manifest) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      assertJsonSerializable(manifest, "versionManifest");
      await ensureVersionDirs(paths.versionRoot);
      await writeJsonFile(paths.versionManifestPath, manifest);
      return manifest;
    },
    async writeVersionImageFromDataUrl(projectId, taskId, versionId, imageId, fileName, dataUrl) {
      const { buffer, mimeType } = decodeDataUrl(dataUrl, {
        label: "image data URL",
        expectedPrefix: "image/",
      });
      return this.writeVersionImageBuffer(projectId, taskId, versionId, imageId, fileName, buffer, { mimeType });
    },
    async writeVersionImageBuffer(projectId, taskId, versionId, imageId, fileName, buffer, options = {}) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      const safeImageId = sanitizeSegment(imageId, "imageId");
      const storedFileName = createStoredImageFileName(safeImageId, fileName);
      const relativePath = toArchivePath("images", storedFileName);
      const safeBuffer = Buffer.from(buffer || []);
      const mimeType = options.mimeType || "application/octet-stream";
      const absolutePath = safeJoin(paths.versionRoot, relativePath);

      await ensureVersionDirs(paths.versionRoot);
      await writeFile(absolutePath, safeBuffer);
      return createStoredFileResult(safeBuffer, absolutePath, relativePath, mimeType);
    },
    async writeVersionMaskFromDataUrl(projectId, taskId, versionId, imageId, dataUrl) {
      const { buffer, mimeType } = this.decodeMaskDataUrl(dataUrl);
      return this.writeVersionMaskBuffer(projectId, taskId, versionId, imageId, buffer, { mimeType });
    },
    async writeVersionMaskBuffer(projectId, taskId, versionId, imageId, buffer, options = {}) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      const safeImageId = sanitizeSegment(imageId, "imageId");
      const relativePath = toArchivePath("masks", `${safeImageId}_mask.png`);
      const safeBuffer = Buffer.from(buffer || []);
      const mimeType = options.mimeType || "image/png";
      const absolutePath = safeJoin(paths.versionRoot, relativePath);

      await ensureVersionDirs(paths.versionRoot);
      await writeFile(absolutePath, safeBuffer);
      return createStoredFileResult(safeBuffer, absolutePath, relativePath, mimeType);
    },
    async readVersionFile(projectId, taskId, versionId, relativePath) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      return readFile(safeJoin(paths.versionRoot, sanitizeRelativePath(relativePath)));
    },
    async softDeleteVersionImage(projectId, taskId, versionId, imageId, input = {}) {
      return this.updateVersionImageDeletion(projectId, taskId, versionId, imageId, {
        mode: "delete",
        actor: input.deletedBy || input.deleted_by || "",
        reason: input.reason || input.deleteReason || input.delete_reason || "",
        now: input.now,
      });
    },
    async restoreVersionImage(projectId, taskId, versionId, imageId, input = {}) {
      return this.updateVersionImageDeletion(projectId, taskId, versionId, imageId, {
        mode: "restore",
        now: input.now,
      });
    },
    async updateVersionImageDeletion(projectId, taskId, versionId, imageId, operation) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      const safeImageId = sanitizeSegment(imageId, "imageId");
      const manifest = await this.readVersionManifest(paths.projectId, paths.taskId, paths.versionId);
      if (!manifest) {
        throw new TypeError("Version manifest is required");
      }

      const images = Array.isArray(manifest.images) ? manifest.images : [];
      const index = images.findIndex((image) => sanitizeSegment(image.id, "imageId") === safeImageId);
      if (index < 0) {
        throw new TypeError("Image record is required");
      }

      const now = normalizeNow(operation.now);
      const current = images[index];
      if (operation.mode === "delete") {
        await moveVersionRecordFiles(paths.versionRoot, current, "delete");
        images[index] = {
          ...current,
          deleted_at: current.deleted_at || now,
          deleted_by: String(operation.actor || ""),
          delete_reason: String(operation.reason || ""),
          updated_at: now,
        };
      } else if (operation.mode === "restore") {
        await moveVersionRecordFiles(paths.versionRoot, current, "restore");
        images[index] = {
          ...current,
          deleted_at: "",
          deleted_by: "",
          delete_reason: "",
          updated_at: now,
        };
      } else {
        throw new TypeError("Unsupported version image deletion operation");
      }

      const updatedManifest = {
        ...manifest,
        images,
        updated_at: now,
      };
      await this.writeVersionManifest(paths.projectId, paths.taskId, paths.versionId, updatedManifest);
      return images[index];
    },
    async writeImageFromDataUrl(projectId, imageId, fileName, dataUrl) {
      const { buffer, mimeType } = decodeDataUrl(dataUrl, {
        label: "image data URL",
        expectedPrefix: "image/",
      });
      return this.writeImageBuffer(projectId, imageId, fileName, buffer, { mimeType });
    },
    async writeImageBuffer(projectId, imageId, fileName, buffer, options = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeImageId = sanitizeSegment(imageId, "imageId");
      const storedFileName = createStoredImageFileName(safeImageId, fileName);
      const relativePath = toArchivePath("images", storedFileName);
      const safeBuffer = Buffer.from(buffer || []);
      const mimeType = options.mimeType || "application/octet-stream";
      const absolutePath = safeJoin(projectPath(safeProjectId), relativePath);

      await mkdir(safeJoin(projectPath(safeProjectId), "images"), { recursive: true });
      await writeFile(absolutePath, safeBuffer);
      return {
        buffer: safeBuffer,
        path: absolutePath,
        archivePath: relativePath,
        mimeType,
        relativePath,
        size: safeBuffer.length,
      };
    },
    async writeMaskFromDataUrl(projectId, imageId, dataUrl) {
      const { buffer, mimeType } = this.decodeMaskDataUrl(dataUrl);
      return this.writeMaskBuffer(projectId, imageId, buffer, { mimeType });
    },
    decodeMaskDataUrl(dataUrl) {
      return decodeDataUrl(dataUrl, {
        label: "mask data URL",
        expectedMimeType: "image/png",
      });
    },
    async writeMaskBuffer(projectId, imageId, buffer, options = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeImageId = sanitizeSegment(imageId, "imageId");
      const relativePath = toArchivePath("masks", `${safeImageId}_mask.png`);
      const safeBuffer = Buffer.from(buffer || []);
      const mimeType = options.mimeType || "image/png";
      const absolutePath = safeJoin(projectPath(safeProjectId), relativePath);

      await mkdir(safeJoin(projectPath(safeProjectId), "masks"), { recursive: true });
      await writeFile(absolutePath, safeBuffer);
      return {
        buffer: safeBuffer,
        path: absolutePath,
        archivePath: relativePath,
        mimeType,
        relativePath,
        size: safeBuffer.length,
      };
    },
    async readProjectFile(projectId, relativePath) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeRelative = sanitizeRelativePath(relativePath);
      return readFile(safeJoin(projectPath(safeProjectId), safeRelative));
    },
    async listProjectFiles(projectId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const projectDir = projectPath(safeProjectId);
      const files = [];
      await collectFiles(projectDir, projectDir, files);
      return files.sort((left, right) => left.path.localeCompare(right.path));
    },
    async listProjects() {
      let entries = [];
      try {
        entries = await readdir(absoluteRoot, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }

      const projects = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifest = await this.readProjectManifest(entry.name);
        if (!manifest) continue;
        projects.push(createProjectSummary(manifest));
      }
      return projects.sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    },
    async clearStorageForTests() {
      await rm(absoluteRoot, { recursive: true, force: true });
    },
  };

  function projectPath(projectId) {
    return safeJoin(absoluteRoot, sanitizeSegment(projectId, "projectId"));
  }

  function hierarchyProjectPath(projectId) {
    return safeJoin(absoluteRoot, "projects", sanitizeSegment(projectId, "projectId"));
  }
}

export function ensureProject(projectId) {
  return defaultStorage.ensureProject(projectId);
}

export function writeImageFromDataUrl(projectId, imageId, fileName, dataUrl) {
  return defaultStorage.writeImageFromDataUrl(projectId, imageId, fileName, dataUrl);
}

export function writeImageBuffer(projectId, imageId, fileName, buffer, options = {}) {
  return defaultStorage.writeImageBuffer(projectId, imageId, fileName, buffer, options);
}

export function writeMaskFromDataUrl(projectId, imageId, dataUrl) {
  return defaultStorage.writeMaskFromDataUrl(projectId, imageId, dataUrl);
}

export function decodeMaskDataUrl(dataUrl) {
  return defaultStorage.decodeMaskDataUrl(dataUrl);
}

export function writeMaskBuffer(projectId, imageId, buffer, options = {}) {
  return defaultStorage.writeMaskBuffer(projectId, imageId, buffer, options);
}

export function readProjectManifest(projectId) {
  return defaultStorage.readProjectManifest(projectId);
}

export function writeProjectManifest(projectId, manifest) {
  return defaultStorage.writeProjectManifest(projectId, manifest);
}

export function ensureProjectMetadata(projectId, input = {}) {
  return defaultStorage.ensureProjectMetadata(projectId, input);
}

export function readProjectMetadata(projectId) {
  return defaultStorage.readProjectMetadata(projectId);
}

export function writeProjectMetadata(projectId, metadata) {
  return defaultStorage.writeProjectMetadata(projectId, metadata);
}

export function ensureTaskMetadata(projectId, taskId, input = {}) {
  return defaultStorage.ensureTaskMetadata(projectId, taskId, input);
}

export function readTaskMetadata(projectId, taskId) {
  return defaultStorage.readTaskMetadata(projectId, taskId);
}

export function writeTaskMetadata(projectId, taskId, metadata) {
  return defaultStorage.writeTaskMetadata(projectId, taskId, metadata);
}

export function ensureVersionManifest(projectId, taskId, versionId, input = {}) {
  return defaultStorage.ensureVersionManifest(projectId, taskId, versionId, input);
}

export function readVersionManifest(projectId, taskId, versionId) {
  return defaultStorage.readVersionManifest(projectId, taskId, versionId);
}

export function writeVersionManifest(projectId, taskId, versionId, manifest) {
  return defaultStorage.writeVersionManifest(projectId, taskId, versionId, manifest);
}

export function writeVersionImageFromDataUrl(projectId, taskId, versionId, imageId, fileName, dataUrl) {
  return defaultStorage.writeVersionImageFromDataUrl(projectId, taskId, versionId, imageId, fileName, dataUrl);
}

export function writeVersionImageBuffer(projectId, taskId, versionId, imageId, fileName, buffer, options = {}) {
  return defaultStorage.writeVersionImageBuffer(projectId, taskId, versionId, imageId, fileName, buffer, options);
}

export function writeVersionMaskFromDataUrl(projectId, taskId, versionId, imageId, dataUrl) {
  return defaultStorage.writeVersionMaskFromDataUrl(projectId, taskId, versionId, imageId, dataUrl);
}

export function writeVersionMaskBuffer(projectId, taskId, versionId, imageId, buffer, options = {}) {
  return defaultStorage.writeVersionMaskBuffer(projectId, taskId, versionId, imageId, buffer, options);
}

export function softDeleteVersionImage(projectId, taskId, versionId, imageId, input = {}) {
  return defaultStorage.softDeleteVersionImage(projectId, taskId, versionId, imageId, input);
}

export function restoreVersionImage(projectId, taskId, versionId, imageId, input = {}) {
  return defaultStorage.restoreVersionImage(projectId, taskId, versionId, imageId, input);
}

export function listProjectFiles(projectId) {
  return defaultStorage.listProjectFiles(projectId);
}

export function listProjects() {
  return defaultStorage.listProjects();
}

export function clearStorageForTests() {
  return defaultStorage.clearStorageForTests();
}

export function sanitizeSegment(value, label = "Path segment") {
  const safe = String(value || "")
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+$/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 160);
  if (!safe) {
    throw new TypeError(`${label} is required`);
  }
  return safe;
}

export function sanitizeRelativePath(value) {
  const parts = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => sanitizeSegment(part, "Relative path segment"));
  if (parts.length === 0) {
    throw new TypeError("Relative path is required");
  }
  return parts.join("/");
}

export function bufferFromDataUrl(dataUrl) {
  return decodeDataUrl(dataUrl).buffer;
}

function decodeDataUrl(dataUrl, { label = "data URL", expectedPrefix, expectedMimeType } = {}) {
  const match = DATA_URL_PATTERN.exec(String(dataUrl || ""));
  if (!match) {
    throw new TypeError(`${label} is invalid`);
  }

  const mimeType = (match[1] || "text/plain").toLowerCase();
  if (expectedPrefix && !mimeType.startsWith(expectedPrefix)) {
    throw new TypeError(`${label} must use a ${expectedPrefix} MIME type`);
  }
  if (expectedMimeType && mimeType !== expectedMimeType) {
    throw new TypeError(`${label} must use ${expectedMimeType}`);
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) {
    throw new TypeError(`${label} payload is empty`);
  }
  return { buffer, mimeType };
}

function createStoredImageFileName(imageId, fileName) {
  const safeFileName = sanitizeFileName(fileName || `${imageId}.png`);
  return safeFileName.startsWith(`${imageId}.`) || safeFileName.startsWith(`${imageId}_`)
    ? safeFileName
    : `${imageId}_${safeFileName}`;
}

function sanitizeFileName(value) {
  const baseName = path.basename(String(value || "file").trim()).replace(/\.+$/g, "");
  return sanitizeSegment(baseName || "file", "fileName");
}

function safeJoin(root, ...segments) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new TypeError("Resolved storage path escapes the configured root");
  }

  return resolvedPath;
}

function toArchivePath(...segments) {
  return segments.join("/").replace(/\\/g, "/").replace(/^\/+/, "");
}

function createStoredFileResult(buffer, absolutePath, relativePath, mimeType) {
  return {
    buffer,
    path: absolutePath,
    archivePath: relativePath,
    mimeType,
    relativePath,
    size: buffer.length,
  };
}

function createProjectSummary(manifest = {}) {
  const images = Array.isArray(manifest.images) ? manifest.images : [];
  return {
    project_id: manifest.project_id || manifest.id || "",
    name: manifest.name || manifest.project_id || manifest.id || "",
    created_at: manifest.created_at || "",
    updated_at: manifest.updated_at || "",
    total_images: images.length,
    submitted_images: images.filter((image) => image.status === "submitted").length,
    approved_images: images.filter((image) => image.status === "approved").length,
    rejected_images: images.filter((image) => image.status === "rejected").length,
  };
}

function assertJsonSerializable(value, pathLabel, seen = new Set()) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new TypeError(`${pathLabel} must be JSON serializable`);
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) {
    throw new TypeError(`${pathLabel} must be JSON serializable`);
  }

  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSerializable(item, `${pathLabel}[${index}]`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) {
      assertJsonSerializable(item, `${pathLabel}.${key}`, seen);
    }
  }
  seen.delete(value);
}

async function readJsonFile(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonFile(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function ensureVersionDirs(versionRoot) {
  await Promise.all(VERSION_DIRS.map((dir) => mkdir(safeJoin(versionRoot, dir), { recursive: true })));
}

function normalizeNow(value) {
  return value ? String(value) : new Date().toISOString();
}

function normalizeVersionImageRecord(record, paths, now) {
  const imageId = sanitizeSegment(record.id, "imageId");
  return {
    id: imageId,
    project_id: paths.projectId,
    task_id: paths.taskId,
    version_id: paths.versionId,
    original_file_name: String(record.original_file_name || record.file_name || ""),
    image_path: record.image_path ? sanitizeRelativePath(record.image_path) : "",
    current_mask_path: record.current_mask_path ? sanitizeRelativePath(record.current_mask_path) : "",
    uploaded_by: String(record.uploaded_by || ""),
    worker_id: String(record.worker_id || ""),
    reviewer_id: String(record.reviewer_id || ""),
    status: String(record.status || "not_started"),
    deleted_at: String(record.deleted_at || ""),
    deleted_by: String(record.deleted_by || ""),
    delete_reason: String(record.delete_reason || ""),
    created_at: String(record.created_at || now),
    updated_at: String(record.updated_at || now),
  };
}

async function moveVersionRecordFiles(versionRoot, record, mode) {
  const paths = [record.image_path, record.current_mask_path].filter(Boolean);
  for (const relativePath of paths) {
    await moveVersionRelativeFile(versionRoot, relativePath, mode);
  }
}

async function moveVersionRelativeFile(versionRoot, relativePath, mode) {
  const safeRelative = sanitizeRelativePath(relativePath);
  const [kind, ...rest] = safeRelative.split("/");
  if (!["images", "masks"].includes(kind) || rest.length === 0) {
    throw new TypeError("Only version image and mask files can be moved to trash");
  }

  const activePath = safeJoin(versionRoot, safeRelative);
  const trashPath = safeJoin(versionRoot, "trash", kind, ...rest);
  const from = mode === "delete" ? activePath : trashPath;
  const to = mode === "delete" ? trashPath : activePath;

  try {
    await mkdir(path.dirname(to), { recursive: true });
    if (await fileExists(to)) {
      throw new TypeError("Destination file already exists");
    }
    await rename(from, to);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
}

async function fileExists(file) {
  try {
    const info = await stat(file);
    return info.isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function collectFiles(root, current, files) {
  let entries = [];
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, fullPath, files);
    } else if (entry.isFile()) {
      const info = await stat(fullPath);
      files.push({
        path: path.relative(root, fullPath).replace(/\\/g, "/"),
        size: info.size,
      });
    }
  }
}
