import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const REQUIRED_STEPS = Object.freeze([
  "storage_verify",
  "audit_verify",
  "audit_retention",
  "capacity_profile",
  "backup_data_root",
  "restore_verify",
  "production_gate",
]);
const OPTIONAL_STEPS = Object.freeze(["deployment_check"]);

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const outputFile = takeOption(args, "--output");
  const baseUrl = takeOption(args, "--base-url") || process.env.MASKING_APP_BASE_URL || "";
  const dataRoot = path.resolve(args[0] || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data");
  const backupDir = path.resolve(args[1] || process.env.MASKING_APP_BACKUP_DIR || "backups");
  const result = await collectStagingEvidence({
    dataRoot,
    backupDir,
    baseUrl,
    env: process.env,
    cwd: process.cwd(),
  });

  await writeEvidenceOutput(result, outputFile);
  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function collectStagingEvidence(options = {}) {
  const cwd = path.resolve(options.cwd || ROOT);
  const dataRoot = path.resolve(options.dataRoot || "data");
  const backupDir = path.resolve(options.backupDir || "backups");
  const env = { ...process.env, ...(options.env || {}) };
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const runCommand = options.runCommand || runJsonCommand;
  const result = {
    ok: true,
    checked_at: now(),
    data_root: dataRoot,
    backup_dir: backupDir,
    required_steps: [...REQUIRED_STEPS],
    optional_steps: options.baseUrl ? [...OPTIONAL_STEPS] : [],
    steps: {},
    evidence: {},
    errors: [],
  };

  await runStep(result, runCommand, "storage_verify", nodeCommand(cwd, ["scripts/harness/storage-verify.mjs", "--json", dataRoot]), env);
  await runStep(result, runCommand, "audit_verify", nodeCommand(cwd, ["scripts/harness/audit-verify.mjs", "--json", dataRoot]), env);
  await runStep(result, runCommand, "audit_retention", nodeCommand(cwd, ["scripts/harness/audit-retention.mjs", "--json", dataRoot]), env);
  await runStep(result, runCommand, "capacity_profile", nodeCommand(cwd, ["scripts/harness/capacity-profile.mjs", "--json", dataRoot]), env);
  await runStep(result, runCommand, "backup_data_root", nodeCommand(cwd, ["scripts/harness/backup-data-root.mjs", "--json", dataRoot, backupDir]), env);

  const archiveFile = result.evidence.backup_data_root?.archive_file || "";
  if (result.steps.backup_data_root?.ok && archiveFile) {
    await runStep(result, runCommand, "restore_verify", nodeCommand(cwd, ["scripts/harness/restore-verify.mjs", "--json", archiveFile]), env);
  } else {
    result.steps.restore_verify = {
      ok: false,
      status: "skipped",
      reason: "backup_archive_unavailable",
    };
    result.errors.push({
      step: "restore_verify",
      code: "backup_archive_unavailable",
    });
  }

  await runStep(result, runCommand, "production_gate", nodeCommand(cwd, ["scripts/harness/production-gate.mjs", "--json", dataRoot]), env);

  if (options.baseUrl) {
    await runStep(result, runCommand, "deployment_check", nodeCommand(cwd, ["scripts/harness/deployment-check.mjs", "--json", options.baseUrl]), env, {
      required: false,
    });
  }

  result.ok = REQUIRED_STEPS.every((step) => result.steps[step]?.ok === true);
  return result;
}

export async function writeEvidenceOutput(result, outputFile) {
  if (!outputFile) return "";
  const target = path.resolve(outputFile);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(result, null, 2)}\n`);
  return target;
}

async function runStep(result, runCommand, step, command, env, options = {}) {
  const required = options.required !== false;
  const execution = await runCommand(step, { ...command, env });
  const parsed = parseJsonOutput(execution.stdout);
  const ok = execution.exitCode === 0 && parsed.ok === true;
  result.steps[step] = {
    ok,
    required,
    exit_code: execution.exitCode,
    command: [command.file, ...command.args].join(" "),
  };
  result.evidence[step] = parsed;

  const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  if (!ok) {
    for (const error of errors.length > 0 ? errors : [{ code: "command_failed" }]) {
      result.errors.push({ step, ...error });
    }
  }
}

function nodeCommand(cwd, args) {
  return {
    file: process.execPath,
    args,
    cwd,
  };
}

async function runJsonCommand(_step, command) {
  try {
    const { stdout, stderr } = await execFilePromise(command.file, command.args, {
      cwd: command.cwd,
      env: command.env,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 16,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    return {
      exitCode: Number(error.code || 1),
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || error.message || ""),
    };
  }
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(String(stdout || "{}"));
  } catch (error) {
    return {
      ok: false,
      errors: [{ code: "invalid_json_output", message: error.message }],
    };
  }
}

function takeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function takeOption(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return "";
  const value = args[index + 1] || "";
  args.splice(index, 2);
  return value;
}

function isCliEntry() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}

function printResult(result, options = {}) {
  if (options.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`staging-evidence: ${result.ok ? "passed" : "failed"} root=${result.data_root}`);
  for (const [step, summary] of Object.entries(result.steps)) {
    console.log(`staging-evidence: step=${step} status=${summary.ok ? "passed" : summary.status || "failed"}`);
  }
  for (const error of result.errors) {
    console.error(`staging-evidence: error step=${error.step} code=${error.code}`);
  }
}
