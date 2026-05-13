import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_LIMITS = {
  manifestBytesWarn: 5 * 1024 * 1024,
  totalBytesWarn: 10 * 1024 * 1024 * 1024,
  imageCountWarn: 10_000,
};

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const strict = takeFlag(args, "--strict");
  const dataRoot = path.resolve(args[0] || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data");
  const result = await profileCapacity({ dataRoot, strict });

  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function profileCapacity(options = {}) {
  const dataRoot = path.resolve(options.dataRoot || "data");
  const limits = {
    ...DEFAULT_LIMITS,
    ...(options.limits || {}),
  };
  const result = {
    ok: true,
    strict: Boolean(options.strict),
    checked_at: new Date().toISOString(),
    data_root: dataRoot,
    limits,
    counts: {
      manifests: 0,
      images: 0,
      masks: 0,
      other_files: 0,
    },
    bytes: {
      manifests: 0,
      images: 0,
      masks: 0,
      other_files: 0,
      total: 0,
    },
    largest_manifest: null,
    warnings: [],
    errors: [],
  };

  const rootInfo = await safeStat(dataRoot);
  if (!rootInfo) {
    result.ok = false;
    result.errors.push({ code: "data_root_missing", path: dataRoot });
    return result;
  }
  if (!rootInfo.isDirectory()) {
    result.ok = false;
    result.errors.push({ code: "data_root_not_directory", path: dataRoot });
    return result;
  }

  await walkDataRoot(dataRoot, result);
  addCapacityWarnings(result);
  if (result.strict && result.warnings.length > 0) {
    result.errors.push(...result.warnings.map((warning) => ({ ...warning, strict: true })));
  }
  result.ok = result.errors.length === 0;
  return result;
}

async function walkDataRoot(root, result) {
  const entries = await readDirIfExists(root);
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkDataRoot(absolutePath, result);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await safeStat(absolutePath);
    if (!info) continue;
    recordFile(absolutePath, info.size, result);
  }
}

function recordFile(filePath, size, result) {
  const relativePath = path.relative(result.data_root, filePath);
  result.bytes.total += size;

  if (path.basename(filePath) === "manifest.json" || filePath.endsWith(`${path.sep}project.json`) || filePath.endsWith(`${path.sep}task.json`)) {
    result.counts.manifests += 1;
    result.bytes.manifests += size;
    if (!result.largest_manifest || size > result.largest_manifest.size_bytes) {
      result.largest_manifest = { path: relativePath, size_bytes: size };
    }
    return;
  }

  if (relativePath.includes(`${path.sep}images${path.sep}`)) {
    result.counts.images += 1;
    result.bytes.images += size;
    return;
  }

  if (relativePath.includes(`${path.sep}masks${path.sep}`)) {
    result.counts.masks += 1;
    result.bytes.masks += size;
    return;
  }

  result.counts.other_files += 1;
  result.bytes.other_files += size;
}

function addCapacityWarnings(result) {
  if (result.largest_manifest && result.largest_manifest.size_bytes > result.limits.manifestBytesWarn) {
    result.warnings.push({
      code: "manifest_large",
      path: result.largest_manifest.path,
      size_bytes: result.largest_manifest.size_bytes,
      limit_bytes: result.limits.manifestBytesWarn,
    });
  }
  if (result.bytes.total > result.limits.totalBytesWarn) {
    result.warnings.push({
      code: "data_root_large",
      size_bytes: result.bytes.total,
      limit_bytes: result.limits.totalBytesWarn,
    });
  }
  if (result.counts.images > result.limits.imageCountWarn) {
    result.warnings.push({
      code: "image_count_large",
      count: result.counts.images,
      limit: result.limits.imageCountWarn,
    });
  }
}

async function readDirIfExists(dirPath) {
  try {
    return await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function takeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function isCliEntry() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}

function printResult(result, options = {}) {
  if (options.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`capacity-profile: ${result.ok ? "passed" : "failed"} root=${result.data_root} strict=${result.strict}`);
  console.log(`capacity-profile: counts=${JSON.stringify(result.counts)}`);
  console.log(`capacity-profile: bytes=${JSON.stringify(result.bytes)}`);
  if (result.largest_manifest) {
    console.log(`capacity-profile: largest_manifest=${result.largest_manifest.path} size=${result.largest_manifest.size_bytes}`);
  }
  for (const warning of result.warnings) {
    console.warn(`capacity-profile: warning ${warning.code}`);
  }
  for (const error of result.errors) {
    console.error(`capacity-profile: error ${error.code}`);
  }
}
