const DEFAULT_REDACTED_KEYS = new Set([
  "data_url",
  "dataUrl",
  "mask_data_url",
  "maskDataUrl",
  "object_url",
  "objectUrl",
  "body",
  "buffer",
  "authorization",
  "payload",
  "password",
  "sessionToken",
  "token",
]);

export function createLogger(options = {}) {
  const component = options.component || "app";
  const sink = options.sink || defaultSink;
  const now = options.now || (() => new Date().toISOString());

  return {
    debug(event, fields = {}) {
      emit("debug", event, fields);
    },
    info(event, fields = {}) {
      emit("info", event, fields);
    },
    warn(event, fields = {}) {
      emit("warn", event, fields);
    },
    error(event, fields = {}) {
      emit("error", event, fields);
    },
  };

  function emit(level, event, fields) {
    sink({
      ts: now(),
      level,
      event,
      component,
      ...sanitizeLogFields(fields),
    });
  }
}

export function sanitizeLogFields(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      status: value.status,
      code: value.code,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogFields(item, seen));
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = DEFAULT_REDACTED_KEYS.has(key) ? "[REDACTED]" : sanitizeLogFields(item, seen);
  }
  seen.delete(value);
  return output;
}

export function createRequestId(prefix = "req") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function defaultSink(entry) {
  const method = entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "log";
  console[method](JSON.stringify(entry));
}
