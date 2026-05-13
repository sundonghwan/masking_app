import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_RETENTION_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const jsonOutput = takeFlag("--json");
const apply = takeFlag("--apply");
const retentionDays = takeNumberOption("--retention-days", Number(process.env.MASKING_APP_AUDIT_RETENTION_DAYS || DEFAULT_RETENTION_DAYS));
const rootArg = args.find((arg) => !arg.startsWith("-"));
const dataRoot = path.resolve(rootArg || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data");

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const result = await planAuditRetention(dataRoot, { retentionDays, apply });
  printResult(result, { json: jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function planAuditRetention(rootDir = dataRoot, options = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const days = normalizeRetentionDays(options.retentionDays ?? DEFAULT_RETENTION_DAYS);
  const now = normalizeNow(options.now);
  const cutoff = new Date(now.getTime() - (days * MS_PER_DAY));
  const result = {
    ok: true,
    checked_at: new Date().toISOString(),
    data_root: resolvedRoot,
    audit_dir: path.join(resolvedRoot, "audit"),
    retention_days: days,
    cutoff_at: cutoff.toISOString(),
    apply: options.apply === true,
    candidates: [],
    deleted: [],
    warnings: [],
    errors: [],
  };

  await plan(result, cutoff);
  result.ok = result.errors.length === 0;
  return result;
}

function takeFlag(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function takeNumberOption(name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    args.splice(args.indexOf(inline), 1);
    return normalizeRetentionDays(inline.slice(prefix.length));
  }
  const index = args.indexOf(name);
  if (index >= 0) {
    const value = args[index + 1];
    args.splice(index, 2);
    return normalizeRetentionDays(value);
  }
  return normalizeRetentionDays(fallback);
}

async function plan(result, cutoff) {
  const rootInfo = await safeStat(result.data_root);
  if (!rootInfo) {
    addError(result, "data_root_missing", result.data_root);
    return;
  }
  if (!rootInfo.isDirectory()) {
    addError(result, "data_root_not_directory", result.data_root);
    return;
  }

  const auditInfo = await safeStat(result.audit_dir);
  if (!auditInfo) {
    result.warnings.push({ code: "audit_dir_missing", path: "audit" });
    return;
  }
  if (!auditInfo.isDirectory()) {
    addError(result, "audit_dir_not_directory", "audit");
    return;
  }

  const entries = await readdir(result.audit_dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^events-\d{4}-\d{2}\.jsonl$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const file of files) {
    const monthEnd = auditFileMonthEnd(file);
    if (!monthEnd) {
      addError(result, "audit_file_month_parse_failed", path.join(result.audit_dir, file));
      continue;
    }
    if (monthEnd >= cutoff) continue;
    const candidate = {
      file,
      path: relative(result.data_root, path.join(result.audit_dir, file)),
      month_ended_at: monthEnd.toISOString(),
    };
    result.candidates.push(candidate);
    if (result.apply) {
      await unlink(path.join(result.audit_dir, file));
      result.deleted.push(candidate);
    }
  }
}

function auditFileMonthEnd(fileName) {
  const match = String(fileName || "").match(/^events-(\d{4})-(\d{2})\.jsonl$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function normalizeRetentionDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("Audit retention days must be a positive integer");
  }
  return days;
}

function normalizeNow(value) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("Audit retention now must be a valid timestamp");
  return now;
}

async function safeStat(target) {
  try {
    return await stat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function addError(result, code, location, extra = {}) {
  result.errors.push({ code, location: relative(result.data_root, location), ...extra });
}

function relative(root, target) {
  const value = String(target || "");
  if (!path.isAbsolute(value)) return value;
  return path.relative(root, value) || ".";
}

function printResult(result, { json = false } = {}) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const mode = result.apply ? "apply" : "dry-run";
  if (result.ok) {
    console.log(`audit-retention: ok mode=${mode} candidates=${result.candidates.length} deleted=${result.deleted.length} retention_days=${result.retention_days}`);
  } else {
    console.error(`audit-retention: failed errors=${result.errors.length} mode=${mode}`);
    for (const error of result.errors) {
      console.error(`audit-retention: ${error.code} ${error.location}`);
    }
  }
  for (const warning of result.warnings) {
    console.warn(`audit-retention: warning ${warning.code} ${warning.path || ""}`.trim());
  }
}
