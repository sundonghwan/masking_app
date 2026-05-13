import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FORBIDDEN_KEYS = new Set([
  "authorization",
  "body",
  "buffer",
  "data_url",
  "dataurl",
  "mask_data_url",
  "maskdataurl",
  "password",
  "payload",
  "sessiontoken",
  "token",
]);
const REDACTED = "[REDACTED]";
const REQUIRED_FIELDS = [
  "event_id",
  "created_at",
  "action",
  "actor_id",
  "actor_role",
  "resource_type",
  "resource_id",
  "outcome",
];

const args = process.argv.slice(2);
const jsonOutput = takeFlag("--json");
const rootArg = args.find((arg) => !arg.startsWith("-"));
const dataRoot = path.resolve(rootArg || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data");

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const result = await verifyAuditRoot(dataRoot);
  printResult(result, { json: jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function verifyAuditRoot(rootDir = dataRoot) {
  const resolvedRoot = path.resolve(rootDir);
  const result = {
    ok: true,
    checked_at: new Date().toISOString(),
    data_root: resolvedRoot,
    audit_dir: path.join(resolvedRoot, "audit"),
    counts: {
      files: 0,
      events: 0,
    },
    actions: {},
    warnings: [],
    errors: [],
  };

  await verify(result);
  result.ok = result.errors.length === 0;
  return result;
}

function takeFlag(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

async function verify(result) {
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
  result.counts.files = files.length;

  for (const file of files) {
    await verifyAuditFile(result, file);
  }
}

async function verifyAuditFile(result, fileName) {
  const text = await readFile(path.join(result.audit_dir, fileName), "utf8");
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const location = `${fileName}:${index + 1}`;
    let event = null;
    try {
      event = JSON.parse(line);
    } catch (error) {
      addError(result, "audit_json_parse_failed", location, { message: error.message });
      continue;
    }
    result.counts.events += 1;
    verifyAuditEvent(result, event, location);
  }
}

function verifyAuditEvent(result, event, location) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    addError(result, "audit_event_not_object", location);
    return;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!String(event[field] || "").trim()) {
      addError(result, "audit_event_missing_field", location, { field });
    }
  }

  if (event.created_at && Number.isNaN(new Date(event.created_at).getTime())) {
    addError(result, "audit_event_invalid_timestamp", location, { field: "created_at" });
  }
  if (event.outcome && event.outcome !== "success" && event.outcome !== "failure") {
    addError(result, "audit_event_invalid_outcome", location, { outcome: event.outcome });
  }

  verifyForbiddenMetadata(result, event.metadata || {}, location, "metadata");
  countAction(result, event.action, event.outcome);
}

function verifyForbiddenMetadata(result, value, location, prefix, seen = new Set()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => verifyForbiddenMetadata(result, item, location, `${prefix}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const keyPath = `${prefix}.${key}`;
    if (isForbiddenKey(key) && item !== REDACTED) {
      addError(result, "audit_event_forbidden_metadata_key", location, { key: keyPath });
    }
    verifyForbiddenMetadata(result, item, location, keyPath, seen);
  }
  seen.delete(value);
}

function isForbiddenKey(key) {
  return FORBIDDEN_KEYS.has(String(key || "").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase());
}

function countAction(result, action, outcome) {
  const normalizedAction = String(action || "").trim();
  const normalizedOutcome = String(outcome || "").trim();
  if (!normalizedAction || (normalizedOutcome !== "success" && normalizedOutcome !== "failure")) return;
  result.actions[normalizedAction] = result.actions[normalizedAction] || { success: 0, failure: 0 };
  result.actions[normalizedAction][normalizedOutcome] += 1;
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
  if (result.ok) {
    console.log(`audit-verify: ok files=${result.counts.files} events=${result.counts.events}`);
  } else {
    console.error(`audit-verify: failed errors=${result.errors.length} files=${result.counts.files} events=${result.counts.events}`);
    for (const error of result.errors) {
      console.error(`audit-verify: ${error.code} ${error.location}`);
    }
  }
  for (const warning of result.warnings) {
    console.warn(`audit-verify: warning ${warning.code} ${warning.path || ""}`.trim());
  }
}
