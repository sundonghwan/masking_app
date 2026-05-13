import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { hashPassword, isPasswordHash } from "../../src/server/passwords.js";

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const apply = takeFlag(args, "--apply");
  const dataRoot = path.resolve(args[0] || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data");
  const result = await migrateIdentityPasswords({ dataRoot, apply });

  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function migrateIdentityPasswords(options = {}) {
  const root = path.resolve(options.dataRoot || "data");
  const applyChanges = Boolean(options.apply);
  const usersFile = path.join(root, "identity", "users.json");
  const result = {
    ok: false,
    applied: false,
    data_root: root,
    users_file: usersFile,
    checked_at: new Date().toISOString(),
    migrated_users: [],
    skipped_users: [],
    backup_file: "",
    errors: [],
  };

  let document = null;
  try {
    document = JSON.parse(await readFile(usersFile, "utf8"));
  } catch (error) {
    result.errors.push({ code: error.code === "ENOENT" ? "users_file_missing" : "users_file_invalid", message: error.message });
    return result;
  }

  const users = Array.isArray(document.users) ? document.users : [];
  const migrated = users.map((user) => migrateUser(user, result));
  const nextDocument = {
    ...document,
    users: migrated,
  };

  result.ok = result.errors.length === 0;
  if (!result.ok || !applyChanges || result.migrated_users.length === 0) return result;

  result.backup_file = `${usersFile}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await copyFile(usersFile, result.backup_file);
  await writeFile(usersFile, `${JSON.stringify(nextDocument, null, 2)}\n`);
  result.applied = true;
  return result;
}

function migrateUser(user = {}, result) {
  const userId = String(user.user_id || user.userId || "");
  if (!user.password) {
    result.skipped_users.push({ user_id: userId, reason: user.password_hash ? "already_hashed" : "no_password" });
    return user;
  }
  if (isPasswordHash(user.password_hash)) {
    const { password, ...withoutPassword } = user;
    result.migrated_users.push(userId);
    return withoutPassword;
  }
  const { password, ...withoutPassword } = user;
  result.migrated_users.push(userId);
  return {
    ...withoutPassword,
    password_hash: hashPassword(password),
  };
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
  console.log(`identity-migrate-passwords: ${result.ok ? "passed" : "failed"} root=${result.data_root} applied=${result.applied}`);
  console.log(`identity-migrate-passwords: migrated=${result.migrated_users.length} skipped=${result.skipped_users.length}`);
  if (result.backup_file) console.log(`identity-migrate-passwords: backup=${result.backup_file}`);
  for (const error of result.errors) {
    console.error(`identity-migrate-passwords: error ${error.code}${error.message ? ` ${error.message}` : ""}`);
  }
}
