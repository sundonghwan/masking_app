import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateIdentityPasswords } from "../scripts/harness/identity-migrate-passwords.mjs";
import { verifyPassword } from "../src/server/passwords.js";

test("identity password migration dry-runs without mutating users file", async () => {
  const rootDir = await createUsersFile({
    users: [{ user_id: "admin", role: "admin", password: "admin123", active: true }],
  });
  const before = await readUsers(rootDir);

  const result = await migrateIdentityPasswords({ dataRoot: rootDir, apply: false });
  const after = await readUsers(rootDir);

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.deepEqual(result.migrated_users, ["admin"]);
  assert.deepEqual(after, before);
});

test("identity password migration applies hashes and writes a backup", async () => {
  const rootDir = await createUsersFile({
    users: [
      { user_id: "admin", role: "admin", password: "admin123", active: true },
      { user_id: "reviewer", role: "reviewer", password_hash: "pbkdf2_sha256$64000$abcd$abcd", active: true },
    ],
  });

  const result = await migrateIdentityPasswords({ dataRoot: rootDir, apply: true });
  const migrated = await readUsers(rootDir);

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.deepEqual(result.migrated_users, ["admin"]);
  assert.equal(Object.hasOwn(migrated.users[0], "password"), false);
  assert.match(migrated.users[0].password_hash, /^pbkdf2_sha256\$/);
  assert.equal(verifyPassword("admin123", migrated.users[0]), true);
  assert.ok((await stat(result.backup_file)).isFile());
});

async function createUsersFile(document) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-identity-migrate-test-"));
  const identityDir = path.join(rootDir, "identity");
  await mkdir(identityDir, { recursive: true });
  await writeFile(path.join(identityDir, "users.json"), `${JSON.stringify(document, null, 2)}\n`);
  return rootDir;
}

async function readUsers(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, "identity", "users.json"), "utf8"));
}
