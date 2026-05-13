import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveDeploymentProfile } from "../../src/server/deploymentProfile.js";
import { checkProductionSafety } from "../../src/server/productionSafety.js";

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
  const result = await checkProductionSafety({ profile, cwd, env, force: true });
  result.deployment.host = profile.host;
  result.deployment.public_root = profile.publicRoot;
  result.security = result.identity;
  if (!isProductionMode(profile.mode)) {
    result.errors.unshift({
      code: "production_mode_required",
      message: "Set MASKING_APP_MODE=production before running the production gate.",
    });
    result.ok = false;
  }
  return result;
}

export function isProductionMode(value) {
  return ["production", "prod"].includes(String(value || "").trim().toLowerCase());
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
  console.log(`production-gate: ${result.ok ? "passed" : "failed"} mode=${result.deployment.mode} root=${result.deployment.data_root}`);
  for (const warning of result.warnings) {
    console.warn(`production-gate: warning ${warning.code}`);
  }
  for (const error of result.errors) {
    console.error(`production-gate: error ${error.code}`);
  }
}
