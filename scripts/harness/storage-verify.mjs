import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { parseImageMetadata } from "../../src/server/imageMetadata.js";
import { parsePngHeader } from "../../src/server/maskValidation.js";

const args = process.argv.slice(2);
const jsonOutput = takeFlag("--json");
const rootArg = args.find((arg) => !arg.startsWith("-"));
const dataRoot = path.resolve(rootArg || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data");

const result = {
  ok: true,
  checked_at: new Date().toISOString(),
  data_root: dataRoot,
  counts: {
    flat_projects: 0,
    hierarchy_projects: 0,
    task_versions: 0,
    training_sets: 0,
    identity_files: 0,
    images: 0,
    masks: 0,
    json_files: 0,
  },
  warnings: [],
  errors: [],
};

await verifyStorageRoot();
result.ok = result.errors.length === 0;
printResult();
process.exit(result.ok ? 0 : 1);

function takeFlag(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

async function verifyStorageRoot() {
  const rootInfo = await safeStat(dataRoot);
  if (!rootInfo) {
    addError("data_root_missing", dataRoot);
    return;
  }
  if (!rootInfo.isDirectory()) {
    addError("data_root_not_directory", dataRoot);
    return;
  }

  await verifyIdentity();
  await verifyFlatProjects();
  await verifyHierarchyProjects();
  await verifyTrainingSets();
}

async function verifyIdentity() {
  const identityRoot = path.join(dataRoot, "identity");
  const info = await safeStat(identityRoot);
  if (!info) {
    result.warnings.push({ code: "identity_missing", path: relative(identityRoot) });
    return;
  }
  if (!info.isDirectory()) {
    addError("identity_not_directory", identityRoot);
    return;
  }

  await readJsonIfExists(path.join(identityRoot, "users.json"), { required: false });
  const sessionsRoot = path.join(identityRoot, "sessions");
  const sessionEntries = await readDirIfExists(sessionsRoot);
  for (const entry of sessionEntries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      await readJsonIfExists(path.join(sessionsRoot, entry.name), { required: true });
    }
  }
}

async function verifyFlatProjects() {
  const entries = await readDirIfExists(dataRoot);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (["identity", "projects", "training_sets"].includes(entry.name)) continue;
    const projectRoot = path.join(dataRoot, entry.name);
    const manifestPath = path.join(projectRoot, "manifest.json");
    const manifest = await readJsonIfExists(manifestPath, { required: false });
    if (!manifest) continue;
    result.counts.flat_projects += 1;
    await verifyImageRecords(manifest.images || [], projectRoot, `flat project ${entry.name}`);
  }
}

async function verifyHierarchyProjects() {
  const projectsRoot = path.join(dataRoot, "projects");
  const projectEntries = await readDirIfExists(projectsRoot);
  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue;
    const projectRoot = path.join(projectsRoot, projectEntry.name);
    const projectJson = await readJsonIfExists(path.join(projectRoot, "project.json"), { required: false });
    if (projectJson) result.counts.hierarchy_projects += 1;

    const tasksRoot = path.join(projectRoot, "tasks");
    const taskEntries = await readDirIfExists(tasksRoot);
    for (const taskEntry of taskEntries) {
      if (!taskEntry.isDirectory()) continue;
      const taskRoot = path.join(tasksRoot, taskEntry.name);
      await readJsonIfExists(path.join(taskRoot, "task.json"), { required: false });
      const versionsRoot = path.join(taskRoot, "versions");
      const versionEntries = await readDirIfExists(versionsRoot);
      for (const versionEntry of versionEntries) {
        if (!versionEntry.isDirectory()) continue;
        const versionRoot = path.join(versionsRoot, versionEntry.name);
        const manifest = await readJsonIfExists(path.join(versionRoot, "manifest.json"), { required: true });
        if (!manifest) continue;
        result.counts.task_versions += 1;
        await verifyImageRecords(manifest.images || [], versionRoot, `version ${projectEntry.name}/${taskEntry.name}/${versionEntry.name}`);
      }
    }
  }
}

async function verifyTrainingSets() {
  const root = path.join(dataRoot, "training_sets");
  const entries = await readDirIfExists(root);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const trainingRoot = path.join(root, entry.name);
    const manifest = await readJsonIfExists(path.join(trainingRoot, "manifest.json"), { required: true });
    if (manifest) result.counts.training_sets += 1;
    await readJsonIfExists(path.join(trainingRoot, "training_set.json"), { required: false });
    await readJsonIfExists(path.join(trainingRoot, "source_versions.json"), { required: false });
  }
}

async function verifyImageRecords(images, root, label) {
  if (!Array.isArray(images)) {
    addError("images_not_array", root, { label });
    return;
  }
  for (const image of images) {
    const imageId = String(image?.id || image?.image_id || "unknown");
    for (const field of ["image_path"]) {
      if (image?.[field]) await verifyReferencedFile(root, image[field], { kind: "image", owner: `${label}:${imageId}`, field });
    }
    for (const field of ["current_mask_path", "mask_path"]) {
      if (image?.[field]) await verifyReferencedFile(root, image[field], { kind: "mask", owner: `${label}:${imageId}`, field });
    }
    const annotations = Array.isArray(image?.annotations) ? image.annotations : [];
    for (const annotation of annotations) {
      if (annotation?.mask_path) {
        await verifyReferencedFile(root, annotation.mask_path, {
          kind: "mask",
          owner: `${label}:${imageId}:class_${annotation.class_id || "unknown"}`,
          field: "annotations[].mask_path",
        });
      }
    }
  }
}

async function verifyReferencedFile(root, relativePath, context) {
  const resolved = resolveSafe(root, relativePath);
  if (!resolved) {
    addError("unsafe_relative_path", root, { ...context, relative_path: relativePath });
    return;
  }
  const info = await safeStat(resolved);
  if (!info || !info.isFile()) {
    addError("referenced_file_missing", resolved, { ...context, relative_path: relativePath });
    return;
  }

  if (context.kind === "image") {
    result.counts.images += 1;
    const buffer = await readFile(resolved);
    const metadata = parseImageMetadata(buffer, mimeFromPath(resolved));
    if (!metadata.valid) {
      addError("image_metadata_invalid", resolved, { ...context, reason: metadata.reason });
    }
    return;
  }

  if (context.kind === "mask") {
    result.counts.masks += 1;
    const buffer = await readFile(resolved);
    const metadata = parsePngHeader(buffer);
    if (!metadata.valid) {
      addError("mask_png_invalid", resolved, { ...context, reason: metadata.reason });
    }
  }
}

async function readJsonIfExists(filePath, options = {}) {
  const info = await safeStat(filePath);
  if (!info) {
    if (options.required) addError("json_missing", filePath);
    return null;
  }
  if (!info.isFile()) {
    addError("json_not_file", filePath);
    return null;
  }
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    result.counts.json_files += 1;
    if (filePath.includes(`${path.sep}identity${path.sep}`)) result.counts.identity_files += 1;
    return parsed;
  } catch (error) {
    addError("json_invalid", filePath, { message: error.message });
    return null;
  }
}

async function readDirIfExists(dirPath) {
  try {
    return await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    addError("directory_unreadable", dirPath, { message: error.message });
    return [];
  }
}

async function safeStat(targetPath) {
  try {
    await access(targetPath);
    return await stat(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    addError("path_unreadable", targetPath, { message: error.message });
    return null;
  }
}

function resolveSafe(root, relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(root, normalized);
  const fromRoot = path.relative(root, resolved);
  if (!normalized || fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    return null;
  }
  return resolved;
}

function addError(code, targetPath, extra = {}) {
  result.errors.push({
    code,
    path: relative(targetPath),
    ...extra,
  });
}

function relative(targetPath) {
  return path.relative(process.cwd(), targetPath) || ".";
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
  }[ext] || "";
}

function printResult() {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`storage-verify: ${result.ok ? "passed" : "failed"} root=${result.data_root}`);
  console.log(`storage-verify: counts=${JSON.stringify(result.counts)}`);
  for (const warning of result.warnings) {
    console.log(`storage-verify: warning ${warning.code} ${warning.path || ""}`.trim());
  }
  for (const error of result.errors) {
    console.error(`storage-verify: error ${error.code} ${error.path || ""}`.trim());
  }
}
