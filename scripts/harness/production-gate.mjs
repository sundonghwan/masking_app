import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveDeploymentProfile } from "../../src/server/deploymentProfile.js";
import { checkSecurity } from "./security-check.mjs";

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const dataRoot = args[0] || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "";
  const result = await checkProductionGate({
    env: process.env,
    cwd: process.cwd(),
    dataRoot,
  });

  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function checkProductionGate(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const env = options.env || process.env;
  const profile = resolveDeploymentProfile({
    ...env,
    ...(options.dataRoot ? { MASKING_APP_DATA_DIR: options.dataRoot } : {}),
  }, { cwd });
  const result = {
    ok: true,
    checked_at: new Date().toISOString(),
    deployment: {
      mode: profile.mode,
      host: profile.host,
      data_root: profile.dataRoot,
      public_root: profile.publicRoot,
    },
    security: null,
    warnings: [],
    errors: [],
  };

  if (!isProductionMode(profile.mode)) {
    result.errors.push({
      code: "production_mode_required",
      message: "Set MASKING_APP_MODE=production before running the production gate.",
    });
  }
  if (!isEnabled(env.MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION)) {
    result.errors.push({
      code: "filesystem_production_acceptance_missing",
      message: "Set MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 only after accepting the documented filesystem storage boundary.",
    });
  }
  if (isSubpath(cwd, profile.dataRoot)) {
    result.errors.push({
      code: "data_root_inside_repo",
      path: profile.dataRoot,
      message: "Use a dedicated MASKING_APP_DATA_DIR outside the repository for production-like operation.",
    });
  }

  result.security = await checkSecurity({ dataRoot: profile.dataRoot, strict: true });
  for (const warning of result.security.warnings || []) {
    result.warnings.push({ source: "security-check", ...warning });
  }
  for (const error of result.security.errors || []) {
    result.errors.push({ source: "security-check", ...error });
  }

  result.ok = result.errors.length === 0;
  return result;
}

function isProductionMode(value) {
  return ["production", "prod"].includes(String(value || "").trim().toLowerCase());
}

function isSubpath(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function takeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function isCliEntry() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}

function printResult(result, options = {}) {
  if (options.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`production-gate: ${result.ok ? "passed" : "failed"} mode=${result.deployment.mode} root=${result.deployment.data_root}`);
  for (const warning of result.warnings) {
    console.warn(`production-gate: warning ${warning.code}`);
  }
  for (const error of result.errors) {
    console.error(`production-gate: error ${error.code}`);
  }
}
