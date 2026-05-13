import { execFile } from "node:child_process";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);
const BACKUP_PREFIX = "masking-app-data-";
const BACKUP_SUFFIX = ".tgz";

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const dataRoot = path.resolve(args[0] || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data");
  const backupDir = path.resolve(args[0] && args[1] ? args[1] : process.env.MASKING_APP_BACKUP_DIR || "backups");
  const retentionCount = Number(process.env.MASKING_APP_BACKUP_RETENTION_COUNT || "0") || 0;
  const result = await backupDataRoot({ dataRoot, backupDir, retentionCount });

  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function backupDataRoot(options = {}) {
  const dataRoot = path.resolve(options.dataRoot || "data");
  const backupDir = path.resolve(options.backupDir || "backups");
  const timestamp = options.timestamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const retentionCount = Math.max(0, Number(options.retentionCount || 0));
  const result = {
    ok: true,
    checked_at: new Date().toISOString(),
    data_root: dataRoot,
    backup_dir: backupDir,
    archive_file: path.join(backupDir, `${BACKUP_PREFIX}${timestamp}${BACKUP_SUFFIX}`),
    manifest_file: path.join(backupDir, `${BACKUP_PREFIX}${timestamp}.json`),
    retention: {
      retention_count: retentionCount,
      deleted_archives: [],
      deleted_manifests: [],
    },
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
  if (isPathInsideOrEqual(backupDir, dataRoot)) {
    result.ok = false;
    result.errors.push({ code: "backup_dir_inside_data_root", path: backupDir, data_root: dataRoot });
    return result;
  }

  await mkdir(backupDir, { recursive: true });
  await createTarGzipArchive({
    archiveFile: result.archive_file,
    parentDir: path.dirname(dataRoot),
    dataRootName: path.basename(dataRoot),
  });
  await writeFile(result.manifest_file, `${JSON.stringify({
    created_at: result.checked_at,
    data_root: dataRoot,
    archive_file: result.archive_file,
    retention_count: retentionCount,
  }, null, 2)}\n`);

  if (retentionCount > 0) {
    await applyRetention(backupDir, retentionCount, result.retention);
  }

  return result;
}

async function createTarGzipArchive({ archiveFile, parentDir, dataRootName }) {
  await execFilePromise("tar", ["-czf", archiveFile, "-C", parentDir, dataRootName], {
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

async function applyRetention(backupDir, retentionCount, retention) {
  const entries = await readdir(backupDir);
  const archives = entries
    .filter((entry) => entry.startsWith(BACKUP_PREFIX) && entry.endsWith(BACKUP_SUFFIX))
    .sort();
  const deleteCount = Math.max(0, archives.length - retentionCount);
  const expiredArchives = archives.slice(0, deleteCount);
  for (const archiveName of expiredArchives) {
    const archivePath = path.join(backupDir, archiveName);
    const manifestPath = path.join(backupDir, `${archiveName.slice(0, -BACKUP_SUFFIX.length)}.json`);
    await unlinkIfExists(archivePath);
    retention.deleted_archives.push(archivePath);
    if (await unlinkIfExists(manifestPath)) {
      retention.deleted_manifests.push(manifestPath);
    }
  }
}

function isPathInsideOrEqual(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function unlinkIfExists(filePath) {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
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
  console.log(`backup-data-root: ${result.ok ? "passed" : "failed"} root=${result.data_root}`);
  if (result.ok) {
    console.log(`backup-data-root: archive=${result.archive_file}`);
    console.log(`backup-data-root: manifest=${result.manifest_file}`);
    console.log(`backup-data-root: deleted_archives=${result.retention.deleted_archives.length}`);
  }
  for (const error of result.errors) {
    console.error(`backup-data-root: error ${error.code}`);
  }
}
