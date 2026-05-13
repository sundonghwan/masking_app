import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { LOCAL_MVP_USER_ACCOUNTS } from "../../src/server/auth.js";

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
  const root = path.resolve(options.dataRoot || "data");
  const strictMode = Boolean(options.strict);
  const usersFile = path.join(root, "identity", "users.json");
  const result = {
    ok: true,
    strict: strictMode,
    data_root: root,
    checked_at: new Date().toISOString(),
    warnings: [],
    errors: [],
  };

  let usersDocument = null;
  try {
    usersDocument = JSON.parse(await readFile(usersFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      result.warnings.push({
        code: "users_file_missing",
        message: "identity/users.json does not exist yet; first login will seed local MVP users.",
      });
      result.ok = !strictMode;
      if (strictMode) {
        result.errors.push({ code: "users_file_missing" });
      }
      return result;
    }
    result.ok = false;
    result.errors.push({ code: "users_file_invalid", message: error.message });
    return result;
  }

  const users = Array.isArray(usersDocument.users) ? usersDocument.users : [];
  const defaultPasswordFindings = findDefaultPasswordUsers(users);
  const plaintextPasswordFindings = users
    .filter((user) => typeof user?.password === "string" && user.password.length > 0)
    .map((user) => String(user.user_id || user.userId || ""));

  if (defaultPasswordFindings.length > 0) {
    result.warnings.push({
      code: "default_seed_passwords",
      users: defaultPasswordFindings,
      message: "Default seed passwords are still valid in identity/users.json.",
    });
  }
  if (plaintextPasswordFindings.length > 0) {
    result.warnings.push({
      code: "plaintext_passwords",
      users: plaintextPasswordFindings,
      message: "Passwords are stored as plaintext in identity/users.json.",
    });
  }

  if (strictMode && defaultPasswordFindings.length > 0) {
    result.errors.push({ code: "default_seed_passwords", users: defaultPasswordFindings });
  }
  if (strictMode && plaintextPasswordFindings.length > 0) {
    result.errors.push({ code: "plaintext_passwords", users: plaintextPasswordFindings });
  }

  result.ok = result.errors.length === 0;
  return result;
}

export function findDefaultPasswordUsers(users = []) {
  return users
    .filter((user) => {
      const userId = String(user.user_id || user.userId || "");
      const defaultUser = LOCAL_MVP_USER_ACCOUNTS.find((account) => account.user_id === userId);
      return defaultUser && String(user.password || "") === String(defaultUser.password || "");
    })
    .map((user) => String(user.user_id || user.userId || ""));
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
