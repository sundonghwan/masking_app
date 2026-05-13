import path from "node:path";
import { pathToFileURL } from "node:url";

import { checkLocalIdentitySecurity, findDefaultPasswordUsers } from "../../src/server/securityAudit.js";

export { findDefaultPasswordUsers };

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const strict = takeFlag(args, "--strict") || isEnabled(process.env.MASKING_APP_SECURITY_STRICT);
  const dataRoot = path.resolve(args[0] || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data");
  const result = await checkSecurity({ dataRoot, strict });

  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function checkSecurity(options = {}) {
  return checkLocalIdentitySecurity({
    dataRoot: path.resolve(options.dataRoot || "data"),
    strict: Boolean(options.strict),
  });
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
  console.log(`security-check: ${result.ok ? "passed" : "failed"} root=${result.data_root} strict=${result.strict}`);
  for (const warning of result.warnings) {
    console.warn(`security-check: warning ${warning.code}${warning.users ? ` users=${warning.users.join(",")}` : ""}`);
  }
  for (const error of result.errors) {
    console.error(`security-check: error ${error.code}${error.users ? ` users=${error.users.join(",")}` : ""}`);
  }
}
