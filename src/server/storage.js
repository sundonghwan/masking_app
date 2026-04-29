import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
