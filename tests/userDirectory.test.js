import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ROLES } from "../src/config/runtimeDefaults.js";
import { LOCAL_MVP_USER_ACCOUNTS, validateDirectoryCredentials, validateMvpCredentials } from "../src/server/auth.js";
import {
  createUserDirectory,
  directoryUserHasRole,
  ensureUserDirectorySeeded,
  listUsers,
  listUsersByRole,
  validateUserCredentials,
} from "../src/server/userDirectory.js";

test("filesystem user directory seeds the local MVP accounts", async () => {
  const { directory, rootDir } = await createTempUserDirectory();

  const users = await directory.listUsers();

  assert.deepEqual(users.map((user) => user.user_id), ["admin", "reviewer", "worker"]);
  assert.deepEqual(users.map((user) => user.role).sort(), [ROLES.ADMIN, ROLES.REVIEWER, ROLES.WORKER].sort());
  assert.equal(users.some((user) => Object.hasOwn(user, "password")), false);

  const stored = JSON.parse(await readFile(path.join(rootDir, "identity", "users.json"), "utf8"));
  assert.equal(stored.users.length, LOCAL_MVP_USER_ACCOUNTS.length);
  assert.equal(stored.users.some((user) => Object.hasOwn(user, "password")), false);
  assert.equal(stored.users.every((user) => Object.hasOwn(user, "password_hash")), true);
});

test("user directory validates credentials without trusting caller-provided role", async () => {
  const { directory } = await createTempUserDirectory();

  const rejected = await directory.validateCredentials({
    user_id: "admin",
    password: "wrong",
    role: ROLES.WORKER,
  });
  const accepted = await directory.validateCredentials({
    user_id: "admin",
    password: "admin123",
    role: ROLES.WORKER,
  });

  assert.equal(rejected, null);
  assert.equal(accepted.user_id, "admin");
  assert.equal(accepted.userId, "admin");
  assert.equal(accepted.role, ROLES.ADMIN);
  assert.equal(Object.hasOwn(accepted, "password"), false);
});

test("auth compatibility keeps validateMvpCredentials available", async () => {
  const { directory } = await createTempUserDirectory();

  assert.equal(validateMvpCredentials({ user_id: "worker", password: "worker123" }).role, ROLES.WORKER);
  assert.equal(validateMvpCredentials({ user_id: "worker", password: "wrong" }), null);
  assert.equal(
    (await validateDirectoryCredentials(directory, { user_id: "reviewer", password: "reviewer123" })).role,
    ROLES.REVIEWER,
  );
});

test("user directory role filter returns active assignment candidates only", async () => {
  const { directory } = await createTempUserDirectory();
  await directory.writeUsers([
    ...LOCAL_MVP_USER_ACCOUNTS,
    { user_id: "worker-2", role: ROLES.WORKER, display_name: "Worker 2", password: "worker456", active: true },
    { user_id: "disabled-worker", role: ROLES.WORKER, display_name: "Disabled", password: "worker789", active: false },
  ]);

  const workers = await directory.listUsersByRole(ROLES.WORKER);
  const reviewers = await directory.listUsers({ role: ROLES.REVIEWER });

  assert.deepEqual(workers.map((user) => user.user_id), ["worker", "worker-2"]);
  assert.deepEqual(reviewers.map((user) => user.user_id), ["reviewer"]);
  assert.equal(await directory.userHasRole("worker-2", ROLES.WORKER), true);
  assert.equal(await directory.userHasRole("disabled-worker", ROLES.WORKER), false);
});

test("user directory creates users without returning stored passwords", async () => {
  const { directory, rootDir } = await createTempUserDirectory();

  const created = await directory.createUser({
    user_id: "worker-2",
    role: ROLES.WORKER,
    display_name: "Worker Two",
    password: "initial-pass",
  });

  assert.equal(created.user_id, "worker-2");
  assert.equal(created.role, ROLES.WORKER);
  assert.equal(created.display_name, "Worker Two");
  assert.equal(Object.hasOwn(created, "password"), false);
  assert.equal((await directory.validateCredentials({ user_id: "worker-2", password: "initial-pass" })).role, ROLES.WORKER);

  const stored = JSON.parse(await readFile(path.join(rootDir, "identity", "users.json"), "utf8"));
  const storedUser = stored.users.find((user) => user.user_id === "worker-2");
  assert.equal(Object.hasOwn(storedUser, "password"), false);
  assert.match(storedUser.password_hash, /^pbkdf2_sha256\$/);
});

test("user directory updates profile fields and rotates passwords", async () => {
  const { directory } = await createTempUserDirectory();
  await directory.createUser({
    user_id: "reviewer-2",
    role: ROLES.REVIEWER,
    display_name: "Reviewer Two",
    password: "old-pass",
  });

  const updated = await directory.updateUser("reviewer-2", {
    role: ROLES.WORKER,
    display_name: "Worker Former Reviewer",
    password: "new-pass",
  });

  assert.equal(updated.user_id, "reviewer-2");
  assert.equal(updated.role, ROLES.WORKER);
  assert.equal(updated.display_name, "Worker Former Reviewer");
  assert.equal(Object.hasOwn(updated, "password"), false);
  assert.equal(await directory.validateCredentials({ user_id: "reviewer-2", password: "old-pass" }), null);
  assert.equal((await directory.validateCredentials({ user_id: "reviewer-2", password: "new-pass" })).role, ROLES.WORKER);
});

test("user directory deactivates and reactivates stored users", async () => {
  const { directory } = await createTempUserDirectory();
  await directory.createUser({
    user_id: "worker-3",
    role: ROLES.WORKER,
    display_name: "Worker Three",
    password: "worker-pass",
  });

  const deactivated = await directory.deactivateUser("worker-3");
  assert.equal(deactivated.active, false);
  assert.equal(Object.hasOwn(deactivated, "password"), false);
  assert.equal(await directory.validateCredentials({ user_id: "worker-3", password: "worker-pass" }), null);
  assert.deepEqual((await directory.listUsersByRole(ROLES.WORKER)).map((user) => user.user_id), ["worker"]);

  const reactivated = await directory.reactivateUser("worker-3");
  assert.equal(reactivated.active, true);
  assert.equal((await directory.validateCredentials({ user_id: "worker-3", password: "worker-pass" })).role, ROLES.WORKER);
  assert.deepEqual((await directory.listUsersByRole(ROLES.WORKER)).map((user) => user.user_id), ["worker", "worker-3"]);
});

test("user directory exposes module-level integration helpers", () => {
  assert.equal(typeof ensureUserDirectorySeeded, "function");
  assert.equal(typeof listUsers, "function");
  assert.equal(typeof listUsersByRole, "function");
  assert.equal(typeof validateUserCredentials, "function");
  assert.equal(typeof directoryUserHasRole, "function");
});

async function createTempUserDirectory() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-users-test-"));
  return {
    rootDir,
    directory: createUserDirectory({ rootDir }),
  };
}
