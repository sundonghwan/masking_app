import { execFile } from "node:child_process";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const archiveFile = path.resolve(args[0] || "");
  const result = await verifyBackupRestore({ archiveFile });

  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function verifyBackupRestore(options = {}) {
  const archiveFile = path.resolve(options.archiveFile || "");
  const restoreParent = options.restoreParent
    ? path.resolve(options.restoreParent)
    : await mkdtemp(path.join(os.tmpdir(), "masking-app-restore-verify-"));
  const result = {
    ok: true,
    checked_at: new Date().toISOString(),
    archive_file: archiveFile,
    restore_parent: restoreParent,
    restored_data_root: "",
    storage_verify: null,
    errors: [],
  };

  const archiveInfo = await safeStat(archiveFile);
  if (!archiveInfo) {
    result.ok = false;
    result.errors.push({ code: "archive_missing", path: archiveFile });
    return result;
  }
  if (!archiveInfo.isFile()) {
    result.ok = false;
    result.errors.push({ code: "archive_not_file", path: archiveFile });
    return result;
  }

  await execFilePromise("tar", ["-xzf", archiveFile, "-C", restoreParent], {
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 4,
  });
  result.restored_data_root = await findRestoredDataRoot(restoreParent);
  if (!result.restored_data_root) {
    result.ok = false;
    result.errors.push({ code: "restored_data_root_missing", path: restoreParent });
    return result;
  }

  const verifyResult = await runStorageVerify(result.restored_data_root);
  result.storage_verify = verifyResult;
  if (!verifyResult.ok) {
    result.ok = false;
    result.errors.push({ code: "storage_verify_failed", path: result.restored_data_root });
  }
  return result;
}

async function findRestoredDataRoot(restoreParent) {
  const entries = await readdir(restoreParent, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length === 1) return path.join(restoreParent, directories[0].name);
  const dataDir = directories.find((entry) => entry.name === "data");
  return dataDir ? path.join(restoreParent, dataDir.name) : "";
}

async function runStorageVerify(dataRoot) {
  try {
    const { stdout } = await execFilePromise("node", ["scripts/harness/storage-verify.mjs", "--json", dataRoot], {
      cwd: ROOT,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 8,
    });
    return JSON.parse(stdout);
  } catch (error) {
    const stdout = String(error.stdout || "");
    try {
      return JSON.parse(stdout);
    } catch {
      return {
        ok: false,
        errors: [{ code: "storage_verify_command_failed", message: error.message }],
      };
    }
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
  console.log(`restore-verify: ${result.ok ? "passed" : "failed"} archive=${result.archive_file}`);
  if (result.restored_data_root) {
    console.log(`restore-verify: restored_data_root=${result.restored_data_root}`);
  }
  for (const error of result.errors) {
    console.error(`restore-verify: error ${error.code}`);
  }
}
