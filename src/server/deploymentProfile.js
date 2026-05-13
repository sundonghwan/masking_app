import path from "node:path";

const DEFAULT_PORT = 4173;
const DEFAULT_AI_TASKS = ["detection", "segmentation", "classification"];

export function resolveDeploymentProfile(env = process.env, options = {}) {
  const cwd = options.cwd || process.cwd();
  const mode = normalizeMode(env.MASKING_APP_MODE || "local");
  const port = normalizePort(env.PORT || env.MASKING_APP_PORT || DEFAULT_PORT);
  const host = String(env.MASKING_APP_HOST || "localhost").trim() || "localhost";
  const dataRoot = path.resolve(cwd, env.MASKING_APP_DATA_DIR || env.MASKING_APP_DATA_ROOT || "data");
  const publicRoot = path.resolve(cwd, env.MASKING_APP_PUBLIC_ROOT || cwd);
  const logLevel = normalizeLogLevel(env.MASKING_APP_LOG_LEVEL || "info");
  const sessionTtlMs = normalizePositiveInteger(env.MASKING_APP_SESSION_TTL_MS || 24 * 60 * 60 * 1000, "MASKING_APP_SESSION_TTL_MS");
  const aiEnabled = parseBoolean(env.MASKING_APP_AI_SERVING);

  return {
    mode,
    port,
    host,
    dataRoot,
    publicRoot,
    logLevel,
    sessionTtlMs,
    aiServing: {
      enabled: aiEnabled,
      provider: String(env.MASKING_APP_AI_PROVIDER || "stub").trim() || "stub",
      tasks: parseList(env.MASKING_APP_AI_TASKS, DEFAULT_AI_TASKS),
      maxImageBytes: normalizePositiveInteger(env.MASKING_APP_AI_MAX_IMAGE_BYTES || 5 * 1024 * 1024, "MASKING_APP_AI_MAX_IMAGE_BYTES"),
    },
  };
}

export function publicDeploymentProfile(profile = {}) {
  return {
    mode: profile.mode || "local",
    port: Number(profile.port || DEFAULT_PORT),
    data_root_configured: Boolean(profile.dataRoot),
    public_root_configured: Boolean(profile.publicRoot),
    session_ttl_ms: Number(profile.sessionTtlMs || 0),
  };
}

function normalizeMode(value) {
  const mode = String(value || "local").trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(mode)) {
    throw new TypeError("MASKING_APP_MODE contains unsupported characters");
  }
  return mode;
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function normalizeLogLevel(value) {
  const level = String(value || "info").trim().toLowerCase();
  return ["debug", "info", "warn", "error"].includes(level) ? level : "info";
}

function normalizePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return number;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseList(value, fallback) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}
