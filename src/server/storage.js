import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
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
    async updateProjectManifest(projectId, input = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const manifest = await this.readProjectManifest(safeProjectId);
      if (!manifest) throw new TypeError("Project manifest is required");
      const now = normalizeNow(input.now);
      const updated = {
        ...manifest,
        ...(Object.hasOwn(input, "name") ? { name: String(input.name || safeProjectId).trim() || safeProjectId } : {}),
        ...(Object.hasOwn(input, "description") ? { description: String(input.description || "").trim() } : {}),
        updated_at: now,
        revision: incrementProjectRevision(manifest.revision),
      };
      return this.writeProjectManifest(safeProjectId, updated);
    },
    async archiveProject(projectId, input = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const manifest = await this.readProjectManifest(safeProjectId);
      if (!manifest) throw new TypeError("Project manifest is required");
      const now = normalizeNow(input.now);
      const updated = {
        ...manifest,
        deleted_at: manifest.deleted_at || now,
        deleted_by: String(input.deletedBy || input.deleted_by || ""),
        delete_reason: String(input.reason || input.deleteReason || input.delete_reason || ""),
        updated_at: now,
        revision: incrementProjectRevision(manifest.revision),
      };
      return this.writeProjectManifest(safeProjectId, updated);
    },
    async restoreProject(projectId, input = {}) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const manifest = await this.readProjectManifest(safeProjectId);
      if (!manifest) throw new TypeError("Project manifest is required");
      const now = normalizeNow(input.now);
      const updated = {
        ...manifest,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        updated_at: now,
        revision: incrementProjectRevision(manifest.revision),
      };
      return this.writeProjectManifest(safeProjectId, updated);
    },
    async purgeProject(projectId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const manifest = await this.readProjectManifest(safeProjectId);
      if (!manifest) throw new TypeError("Project manifest is required");
      if (!manifest.deleted_at) throw new TypeError("Only archived projects can be purged");
      await Promise.all([
        rm(projectPath(safeProjectId), { recursive: true, force: true }),
        rm(hierarchyProjectPath(safeProjectId), { recursive: true, force: true }),
      ]);
      return {
        project_id: safeProjectId,
        purged: true,
      };
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
    async listProjectTasks(projectId) {
      const paths = this.getHierarchyPaths(projectId);
      const tasksRoot = safeJoin(paths.projectRoot, "tasks");
      let entries = [];
      try {
        entries = await readdir(tasksRoot, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }

      const tasks = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metadata = await this.readTaskMetadata(paths.projectId, entry.name);
        if (metadata) tasks.push(createTaskSummary(metadata));
      }
      return tasks.sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
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
        revision: normalizeRevision(input.revision, 1),
        images: Array.isArray(input.images) ? input.images.map((image) => normalizeVersionImageRecord(image, paths, now)) : [],
      };
      await this.writeVersionManifest(paths.projectId, paths.taskId, paths.versionId, manifest);
      return manifest;
    },
    async readVersionManifest(projectId, taskId = DEFAULT_TASK_ID, versionId = DEFAULT_VERSION_ID) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      return readJsonFile(paths.versionManifestPath);
    },
    async listTaskVersions(projectId, taskId = DEFAULT_TASK_ID) {
      const paths = this.getHierarchyPaths(projectId, taskId);
      const versionsRoot = safeJoin(paths.taskRoot, "versions");
      let entries = [];
      try {
        entries = await readdir(versionsRoot, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }

      const versions = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifest = await this.readVersionManifest(paths.projectId, paths.taskId, entry.name);
        if (manifest) versions.push(createVersionSummary(manifest));
      }
      return versions.sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    },
    async writeVersionManifest(projectId, taskId = DEFAULT_TASK_ID, versionId = DEFAULT_VERSION_ID, manifest) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      const normalizedManifest = {
        ...manifest,
        project_id: paths.projectId,
        task_id: paths.taskId,
        version_id: paths.versionId,
        revision: normalizeRevision(manifest?.revision, 1),
      };
      assertJsonSerializable(normalizedManifest, "versionManifest");
      await ensureVersionDirs(paths.versionRoot);
      await writeJsonFile(paths.versionManifestPath, normalizedManifest);
      return normalizedManifest;
    },
    async cloneVersionManifest(projectId, taskId, sourceVersionId, targetVersionId, input = {}) {
      const sourcePaths = this.getHierarchyPaths(projectId, taskId, sourceVersionId);
      const targetPaths = this.getHierarchyPaths(projectId, taskId, targetVersionId);
      const source = await this.readVersionManifest(sourcePaths.projectId, sourcePaths.taskId, sourcePaths.versionId);
      if (!source) {
        throw new TypeError("Source version manifest is required");
      }

      const existing = await this.readVersionManifest(targetPaths.projectId, targetPaths.taskId, targetPaths.versionId);
      if (existing) {
        throw new TypeError("Target version manifest already exists");
      }

      await this.ensureTaskMetadata(targetPaths.projectId, targetPaths.taskId, {
        currentVersion: targetPaths.versionId,
        now: input.now,
      });
      const now = normalizeNow(input.now);
      const images = Array.isArray(source.images)
        ? source.images.map((image) => cloneVersionImageRecord(image, targetPaths, now))
        : [];
      for (const image of images) {
        await copyVersionRecordFiles(sourcePaths.versionRoot, targetPaths.versionRoot, image);
      }
      const manifest = {
        ...source,
        project_id: targetPaths.projectId,
        task_id: targetPaths.taskId,
        version_id: targetPaths.versionId,
        status: String(input.status || "in_progress"),
        created_by: String(input.createdBy || input.created_by || source.created_by || ""),
        created_at: now,
        updated_at: now,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        source_version_id: sourcePaths.versionId,
        revision: 1,
        images,
      };
      return this.writeVersionManifest(targetPaths.projectId, targetPaths.taskId, targetPaths.versionId, manifest);
    },
    async softDeleteVersionManifest(projectId, taskId, versionId, input = {}) {
      return this.updateVersionManifestDeletion(projectId, taskId, versionId, {
        mode: "delete",
        actor: input.deletedBy || input.deleted_by || "",
        reason: input.reason || input.deleteReason || input.delete_reason || "",
        now: input.now,
      });
    },
    async restoreVersionManifest(projectId, taskId, versionId, input = {}) {
      return this.updateVersionManifestDeletion(projectId, taskId, versionId, {
        mode: "restore",
        now: input.now,
      });
    },
    async updateVersionManifestDeletion(projectId, taskId, versionId, operation) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      const manifest = await this.readVersionManifest(paths.projectId, paths.taskId, paths.versionId);
      if (!manifest) {
        throw new TypeError("Version manifest is required");
      }

      const now = normalizeNow(operation.now);
      let updatedManifest;
      if (operation.mode === "delete") {
        updatedManifest = {
          ...manifest,
          deleted_at: manifest.deleted_at || now,
          deleted_by: String(operation.actor || ""),
          delete_reason: String(operation.reason || ""),
          updated_at: now,
          revision: incrementRevision(manifest.revision),
        };
      } else if (operation.mode === "restore") {
        updatedManifest = {
          ...manifest,
          deleted_at: "",
          deleted_by: "",
          delete_reason: "",
          updated_at: now,
          revision: incrementRevision(manifest.revision),
        };
      } else {
        throw new TypeError("Unsupported version manifest deletion operation");
      }

      return this.writeVersionManifest(paths.projectId, paths.taskId, paths.versionId, updatedManifest);
    },
    async purgeSoftDeletedVersionFiles(projectId, taskId, versionId) {
      const paths = this.getHierarchyPaths(projectId, taskId, versionId);
      const manifest = await this.readVersionManifest(paths.projectId, paths.taskId, paths.versionId);
      if (!manifest) {
        throw new TypeError("Version manifest is required");
      }

      const result = {
        deleted_count: 0,
        missing_count: 0,
        skipped_count: 0,
        deleted_paths: [],
        missing_paths: [],
        skipped_paths: [],
      };
      const seen = new Set();
      const images = Array.isArray(manifest.images) ? manifest.images : [];

      for (const image of images) {
        const references = [image.image_path, image.current_mask_path].filter(Boolean);
        if (!image.deleted_at) {
          result.skipped_count += references.length;
          result.skipped_paths.push(...references.map((relativePath) => sanitizeRelativePath(relativePath)));
          continue;
        }

        for (const relativePath of references) {
          const safeRelative = sanitizeRelativePath(relativePath);
          if (seen.has(safeRelative)) continue;
          seen.add(safeRelative);
          const deletedPaths = await purgeVersionRelativeFile(paths.versionRoot, safeRelative);
          if (deletedPaths.length === 0) {
            result.missing_count += 1;
            result.missing_paths.push(safeRelative);
          } else {
            result.deleted_count += deletedPaths.length;
            result.deleted_paths.push(...deletedPaths);
          }
        }
      }

      result.deleted_paths.sort();
      result.missing_paths.sort();
      result.skipped_paths.sort();
      return result;
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
        revision: incrementRevision(manifest.revision),
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
    async updateProjectImageDeletion(projectId, imageId, operation) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const safeImageId = sanitizeSegment(imageId, "imageId");
      const manifest = await this.readProjectManifest(safeProjectId);
      if (!manifest) {
        throw new TypeError("Project manifest is required");
      }

      const images = Array.isArray(manifest.images) ? manifest.images : [];
      const index = images.findIndex((image) => sanitizeSegment(image.id, "imageId") === safeImageId);
      if (index < 0) {
        throw new TypeError("Image record is required");
      }

      const now = normalizeNow(operation.now);
      const current = images[index];
      if (operation.mode === "delete") {
        images[index] = {
          ...current,
          deleted_at: current.deleted_at || now,
          deleted_by: String(operation.actor || ""),
          delete_reason: String(operation.reason || ""),
          updated_at: now,
        };
      } else if (operation.mode === "restore") {
        images[index] = {
          ...current,
          deleted_at: "",
          deleted_by: "",
          delete_reason: "",
          updated_at: now,
        };
      } else {
        throw new TypeError("Unsupported project image deletion operation");
      }

      await this.writeProjectManifest(safeProjectId, {
        ...manifest,
        images,
        updated_at: now,
      });
      return images[index];
    },
    async listProjectFiles(projectId) {
      const safeProjectId = sanitizeSegment(projectId, "projectId");
      const projectDir = projectPath(safeProjectId);
      const files = [];
      await collectFiles(projectDir, projectDir, files);
      return files.sort((left, right) => left.path.localeCompare(right.path));
    },
    async listProjects(options = {}) {
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
        if (manifest.deleted_at && !options.includeDeleted) continue;
        projects.push(createProjectSummary(manifest));
      }
      return projects.sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    },
    async writeTrainingSetManifest(trainingSetId, manifest) {
      const safeTrainingSetId = sanitizeSegment(trainingSetId, "trainingSetId");
      const root = trainingSetPath(safeTrainingSetId);
      const normalized = {
        ...manifest,
        training_set_id: safeTrainingSetId,
      };
      assertJsonSerializable(normalized, "trainingSetManifest");
      await mkdir(safeJoin(root, "exports"), { recursive: true });
      await writeJsonFile(safeJoin(root, "manifest.json"), normalized);
      await writeJsonFile(safeJoin(root, "training_set.json"), normalized.training_set || {});
      await writeJsonFile(safeJoin(root, "source_versions.json"), normalized.source_versions || {});
      return normalized;
    },
    async readTrainingSetManifest(trainingSetId) {
      const safeTrainingSetId = sanitizeSegment(trainingSetId, "trainingSetId");
      return readJsonFile(safeJoin(trainingSetPath(safeTrainingSetId), "manifest.json"));
    },
    async listTrainingSets(options = {}) {
      const root = safeJoin(absoluteRoot, "training_sets");
      let entries = [];
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
      const sets = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifest = await this.readTrainingSetManifest(entry.name);
        if (!manifest) continue;
        if (manifest.deleted_at && !options.includeDeleted) continue;
        sets.push(createTrainingSetSummary(manifest));
      }
      return sets.sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    },
    async archiveTrainingSet(trainingSetId, input = {}) {
      const safeTrainingSetId = sanitizeSegment(trainingSetId, "trainingSetId");
      const manifest = await this.readTrainingSetManifest(safeTrainingSetId);
      if (!manifest) throw new TypeError("Training set manifest is required");
      const now = normalizeNow(input.now);
      return this.writeTrainingSetManifest(safeTrainingSetId, {
        ...manifest,
        deleted_at: manifest.deleted_at || now,
        deleted_by: String(input.deletedBy || input.deleted_by || ""),
        delete_reason: String(input.reason || input.deleteReason || input.delete_reason || ""),
        updated_at: now,
        revision: incrementProjectRevision(manifest.revision),
      });
    },
    async restoreTrainingSet(trainingSetId, input = {}) {
      const safeTrainingSetId = sanitizeSegment(trainingSetId, "trainingSetId");
      const manifest = await this.readTrainingSetManifest(safeTrainingSetId);
      if (!manifest) throw new TypeError("Training set manifest is required");
      const now = normalizeNow(input.now);
      return this.writeTrainingSetManifest(safeTrainingSetId, {
        ...manifest,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        updated_at: now,
        revision: incrementProjectRevision(manifest.revision),
      });
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

  function trainingSetPath(trainingSetId) {
    return safeJoin(absoluteRoot, "training_sets", sanitizeSegment(trainingSetId, "trainingSetId"));
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

export function updateProjectManifest(projectId, input = {}) {
  return defaultStorage.updateProjectManifest(projectId, input);
}

export function archiveProject(projectId, input = {}) {
  return defaultStorage.archiveProject(projectId, input);
}

export function restoreProject(projectId, input = {}) {
  return defaultStorage.restoreProject(projectId, input);
}

export function purgeProject(projectId) {
  return defaultStorage.purgeProject(projectId);
}

export function softDeleteProjectImage(projectId, imageId, input = {}) {
  return defaultStorage.softDeleteProjectImage(projectId, imageId, input);
}

export function restoreProjectImage(projectId, imageId, input = {}) {
  return defaultStorage.restoreProjectImage(projectId, imageId, input);
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

export function listProjectTasks(projectId) {
  return defaultStorage.listProjectTasks(projectId);
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

export function listTaskVersions(projectId, taskId) {
  return defaultStorage.listTaskVersions(projectId, taskId);
}

export function writeVersionManifest(projectId, taskId, versionId, manifest) {
  return defaultStorage.writeVersionManifest(projectId, taskId, versionId, manifest);
}

export function cloneVersionManifest(projectId, taskId, sourceVersionId, targetVersionId, input = {}) {
  return defaultStorage.cloneVersionManifest(projectId, taskId, sourceVersionId, targetVersionId, input);
}

export function softDeleteVersionManifest(projectId, taskId, versionId, input = {}) {
  return defaultStorage.softDeleteVersionManifest(projectId, taskId, versionId, input);
}

export function restoreVersionManifest(projectId, taskId, versionId, input = {}) {
  return defaultStorage.restoreVersionManifest(projectId, taskId, versionId, input);
}

export function purgeSoftDeletedVersionFiles(projectId, taskId, versionId) {
  return defaultStorage.purgeSoftDeletedVersionFiles(projectId, taskId, versionId);
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

export function listProjects(options = {}) {
  return defaultStorage.listProjects(options);
}

export function writeTrainingSetManifest(trainingSetId, manifest) {
  return defaultStorage.writeTrainingSetManifest(trainingSetId, manifest);
}

export function readTrainingSetManifest(trainingSetId) {
  return defaultStorage.readTrainingSetManifest(trainingSetId);
}

export function listTrainingSets(options = {}) {
  return defaultStorage.listTrainingSets(options);
}

export function archiveTrainingSet(trainingSetId, input = {}) {
  return defaultStorage.archiveTrainingSet(trainingSetId, input);
}

export function restoreTrainingSet(trainingSetId, input = {}) {
  return defaultStorage.restoreTrainingSet(trainingSetId, input);
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
  const images = Array.isArray(manifest.images) ? manifest.images.filter((image) => !image.deleted_at) : [];
  return {
    project_id: manifest.project_id || manifest.id || "",
    name: manifest.name || manifest.project_id || manifest.id || "",
    created_at: manifest.created_at || "",
    updated_at: manifest.updated_at || "",
    revision: Number(manifest.revision || 0),
    deleted_at: manifest.deleted_at || "",
    deleted_by: manifest.deleted_by || "",
    delete_reason: manifest.delete_reason || "",
    total_images: images.length,
    submitted_images: images.filter((image) => image.status === "submitted").length,
    approved_images: images.filter((image) => image.status === "approved").length,
    rejected_images: images.filter((image) => image.status === "rejected").length,
  };
}

function createTrainingSetSummary(manifest = {}) {
  const trainingSet = manifest.training_set || {};
  const sourceVersions = manifest.source_versions || {};
  return {
    training_set_id: manifest.training_set_id || trainingSet.training_set_id || "",
    name: manifest.name || trainingSet.name || manifest.training_set_id || "",
    description: manifest.description || trainingSet.description || "",
    approved_only: Boolean(manifest.approved_only || trainingSet.approved_only),
    split: manifest.split || trainingSet.split || {},
    split_counts: trainingSet.split_counts || {},
    total_sources: trainingSet.total_sources || sourceVersions.sources?.length || 0,
    total_items: trainingSet.total_items || 0,
    created_by: manifest.created_by || "",
    created_at: manifest.created_at || "",
    updated_at: manifest.updated_at || "",
    revision: Number(manifest.revision || 0),
    deleted_at: manifest.deleted_at || "",
    deleted_by: manifest.deleted_by || "",
    delete_reason: manifest.delete_reason || "",
  };
}

function createTaskSummary(metadata = {}) {
  return {
    project_id: metadata.project_id || "",
    task_id: metadata.task_id || "",
    name: metadata.name || metadata.task_id || "",
    description: metadata.description || "",
    current_version: metadata.current_version || "",
    archived: Boolean(metadata.archived || false),
    created_at: metadata.created_at || "",
    updated_at: metadata.updated_at || "",
  };
}

function createVersionSummary(manifest = {}) {
  const images = Array.isArray(manifest.images) ? manifest.images : [];
  return {
    project_id: manifest.project_id || "",
    task_id: manifest.task_id || "",
    version_id: manifest.version_id || "",
    status: manifest.status || "",
    created_at: manifest.created_at || "",
    updated_at: manifest.updated_at || "",
    total_images: images.length,
    active_images: images.filter((image) => !image.deleted_at).length,
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

function normalizeRevision(value, fallback = 1) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : fallback;
}

function incrementRevision(value) {
  return normalizeRevision(value, 1) + 1;
}

function incrementProjectRevision(value) {
  const revision = Number(value || 0);
  return Number.isFinite(revision) && revision >= 0 ? revision + 1 : 1;
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

function cloneVersionImageRecord(record, paths, now) {
  const imageId = sanitizeSegment(record.id, "imageId");
  return {
    ...record,
    id: imageId,
    project_id: paths.projectId,
    task_id: paths.taskId,
    version_id: paths.versionId,
    image_path: record.image_path ? sanitizeRelativePath(record.image_path) : "",
    current_mask_path: record.current_mask_path ? sanitizeRelativePath(record.current_mask_path) : "",
    created_at: now,
    updated_at: now,
  };
}

async function moveVersionRecordFiles(versionRoot, record, mode) {
  const paths = [record.image_path, record.current_mask_path].filter(Boolean);
  for (const relativePath of paths) {
    await moveVersionRelativeFile(versionRoot, relativePath, mode);
  }
}

async function copyVersionRecordFiles(sourceVersionRoot, targetVersionRoot, record) {
  const paths = [record.image_path, record.current_mask_path].filter(Boolean);
  for (const relativePath of paths) {
    await copyVersionRelativeFile(sourceVersionRoot, targetVersionRoot, relativePath);
  }
}

async function copyVersionRelativeFile(sourceVersionRoot, targetVersionRoot, relativePath) {
  const safeRelative = sanitizeRelativePath(relativePath);
  const [kind, ...rest] = safeRelative.split("/");
  if (!["images", "masks"].includes(kind) || rest.length === 0) {
    throw new TypeError("Only version image and mask files can be cloned");
  }

  const sourcePath = safeJoin(sourceVersionRoot, safeRelative);
  const targetPath = safeJoin(targetVersionRoot, safeRelative);
  try {
    await mkdir(path.dirname(targetPath), { recursive: true });
    if (await fileExists(targetPath)) {
      throw new TypeError("Target clone file already exists");
    }
    await copyFile(sourcePath, targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
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

async function purgeVersionRelativeFile(versionRoot, relativePath) {
  const safeRelative = sanitizeRelativePath(relativePath);
  const [kind, ...rest] = safeRelative.split("/");
  if (!["images", "masks"].includes(kind) || rest.length === 0) {
    throw new TypeError("Only version image and mask files can be purged");
  }

  const candidates = [
    { file: safeJoin(versionRoot, safeRelative), relativePath: safeRelative },
    { file: safeJoin(versionRoot, "trash", kind, ...rest), relativePath: toArchivePath("trash", kind, ...rest) },
  ];
  const deletedPaths = [];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate.file);
      if (!info.isFile()) continue;
      await rm(candidate.file);
      deletedPaths.push(candidate.relativePath);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
  }
  return deletedPaths;
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
