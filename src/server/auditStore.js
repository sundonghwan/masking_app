import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ROOT_DIR = process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data";
const REDACTED = "[REDACTED]";
const FORBIDDEN_KEYS = new Set([
  "authorization",
  "body",
  "buffer",
  "data_url",
  "dataUrl",
  "mask_data_url",
  "maskDataUrl",
  "password",
  "payload",
  "sessionToken",
  "token",
]);

export function createAuditStore({ rootDir = DEFAULT_ROOT_DIR, now = () => new Date() } = {}) {
  const auditDir = path.join(path.resolve(rootDir), "audit");

  return {
    async appendEvent(input = {}) {
      const event = normalizeAuditEvent(input, now);
      await mkdir(auditDir, { recursive: true });
      await writeFile(auditFilePath(event.created_at), `${JSON.stringify(event)}\n`, { flag: "a" });
      return event;
    },
    async listEvents() {
      let entries = [];
      try {
        entries = await readdir(auditDir, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
      const files = entries
        .filter((entry) => entry.isFile() && /^events-\d{4}-\d{2}\.jsonl$/.test(entry.name))
        .map((entry) => entry.name)
        .sort();
      const events = [];
      for (const file of files) {
        const text = await readFile(path.join(auditDir, file), "utf8");
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          events.push(JSON.parse(line));
        }
      }
      return events;
    },
  };

  function auditFilePath(createdAt) {
    return path.join(auditDir, `events-${String(createdAt).slice(0, 7)}.jsonl`);
  }
}

function normalizeAuditEvent(input = {}, now) {
  const createdAt = normalizeIsoTimestamp(input.created_at || input.createdAt, now);
  const action = normalizeRequired(input.action, "action");
  const actorId = normalizeRequired(input.actor_id || input.actorId, "actor_id");
  const actorRole = normalizeRequired(input.actor_role || input.actorRole, "actor_role");
  const resourceType = normalizeRequired(input.resource_type || input.resourceType, "resource_type");
  const resourceId = normalizeRequired(input.resource_id || input.resourceId, "resource_id");
  const outcome = normalizeOutcome(input.outcome);
  return {
    event_id: normalizeEventId(input.event_id || input.eventId, createdAt),
    created_at: createdAt,
    action,
    actor_id: actorId,
    actor_role: actorRole,
    resource_type: resourceType,
    resource_id: resourceId,
    project_id: normalizeOptional(input.project_id || input.projectId),
    image_id: normalizeOptional(input.image_id || input.imageId),
    outcome,
    reason: normalizeOptional(input.reason),
    request_id: normalizeOptional(input.request_id || input.requestId),
    metadata: sanitizeAuditMetadata(input.metadata || {}),
  };
}

function normalizeIsoTimestamp(value, now) {
  const candidate = value ? new Date(value) : now();
  if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) {
    throw auditStoreError("audit_event_invalid", "Audit event created_at must be a valid timestamp", 400);
  }
  return candidate.toISOString();
}

function normalizeRequired(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw auditStoreError("audit_event_invalid", `Audit event ${field} is required`, 400);
  }
  return normalized;
}

function normalizeOptional(value) {
  return String(value || "").trim();
}

function normalizeOutcome(value) {
  const outcome = normalizeRequired(value, "outcome");
  if (outcome !== "success" && outcome !== "failure") {
    throw auditStoreError("audit_event_invalid", "Audit event outcome must be success or failure", 400);
  }
  return outcome;
}

function normalizeEventId(value, createdAt) {
  const normalized = normalizeOptional(value);
  if (normalized) return normalized;
  const random = Math.random().toString(36).slice(2, 10);
  return `audit_${createdAt.replace(/[^0-9]/g, "")}_${random}`;
}

function sanitizeAuditMetadata(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadata(item, seen));
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = isForbiddenMetadataKey(key) ? REDACTED : sanitizeAuditMetadata(item, seen);
  }
  seen.delete(value);
  return output;
}

function isForbiddenMetadataKey(key) {
  return FORBIDDEN_KEYS.has(String(key || "")) || FORBIDDEN_KEYS.has(String(key || "").toLowerCase());
}

function auditStoreError(code, message, statusCode) {
  return Object.assign(new Error(message), { code, statusCode });
}
