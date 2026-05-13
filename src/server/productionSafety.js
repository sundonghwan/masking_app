import path from "node:path";

import { checkLocalIdentitySecurity } from "./securityAudit.js";

export async function assertProductionStartupSafety(options = {}) {
  const result = await checkProductionSafety(options);
  if (!result.ok) {
    const codes = result.errors.map((error) => error.code).join(", ");
    const error = new Error(`Production startup safety check failed: ${codes}`);
    error.code = "production_startup_safety_failed";
    error.result = result;
    throw error;
  }
  return result;
}

export async function checkProductionSafety(options = {}) {
  const profile = options.profile || {};
  const mode = String(profile.mode || "local").trim().toLowerCase();
  const dataRoot = path.resolve(profile.dataRoot || "data");
  const cwd = path.resolve(options.cwd || process.cwd());
  const env = options.env || process.env;
  const skipped = !options.force && !isProductionMode(mode);
  const result = {
    ok: true,
    skipped,
    checked_at: new Date().toISOString(),
    deployment: {
      mode,
      data_root: dataRoot,
    },
    identity: null,
    warnings: [],
    errors: [],
  };

  if (result.skipped) return result;

  if (!isEnabled(env.MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION)) {
    result.errors.push({
      code: "filesystem_production_acceptance_missing",
      message: "Set MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 only after accepting the documented filesystem storage boundary.",
    });
  }
  if (isSubpath(cwd, dataRoot)) {
    result.errors.push({
      code: "data_root_inside_repo",
      path: dataRoot,
      message: "Use a dedicated MASKING_APP_DATA_DIR outside the repository for production-like operation.",
    });
  }

  result.identity = await checkLocalIdentitySecurity({ dataRoot, strict: true });
  for (const warning of result.identity.warnings || []) {
    result.warnings.push({ source: "identity", ...warning });
  }
  for (const error of result.identity.errors || []) {
    result.errors.push({ source: "identity", ...error });
  }

  result.ok = result.errors.length === 0;
  return result;
}

export function isProductionMode(value) {
  return ["production", "prod"].includes(String(value || "").trim().toLowerCase());
}

export function isSubpath(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}
