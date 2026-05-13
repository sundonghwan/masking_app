import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkSecurity, findDefaultPasswordUsers } from "../scripts/harness/security-check.mjs";

test("security check reports default seed passwords and fails in strict mode", async () => {
  const rootDir = await createUsersFile({
    users: [
      { user_id: "admin", role: "admin", password: "admin123", active: true },
      { user_id: "worker2", role: "worker", password: "custom", active: true },
    ],
  });

  const relaxed = await checkSecurity({ dataRoot: rootDir, strict: false });
  const strict = await checkSecurity({ dataRoot: rootDir, strict: true });

  assert.equal(relaxed.ok, true);
  assert.equal(strict.ok, false);
  assert.deepEqual(findDefaultPasswordUsers([{ user_id: "admin", password: "admin123" }]), ["admin"]);
  assert.equal(strict.errors.some((error) => error.code === "default_seed_passwords"), true);
  assert.equal(strict.errors.some((error) => error.code === "plaintext_passwords"), true);
});

test("security check passes strict mode when passwords are not stored as plaintext", async () => {
  const rootDir = await createUsersFile({
    users: [
      { user_id: "admin", role: "admin", password_hash: "hash", active: true },
    ],
  });

  const result = await checkSecurity({ dataRoot: rootDir, strict: true });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

async function createUsersFile(document) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-security-check-test-"));
  const identityDir = path.join(rootDir, "identity");
  await mkdir(identityDir, { recursive: true });
  await writeFile(path.join(identityDir, "users.json"), `${JSON.stringify(document, null, 2)}\n`);
  return rootDir;
}
