import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertProductionStartupSafety,
  checkProductionSafety,
} from "../src/server/productionSafety.js";

test("production safety is skipped outside production mode", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "masking-startup-safety-repo-"));
  const result = await checkProductionSafety({
    profile: {
      mode: "local",
      dataRoot: path.join(cwd, "data"),
    },
    cwd,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.deepEqual(result.errors, []);
});

test("production safety rejects unsafe startup settings", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "masking-startup-safety-repo-"));
  const result = await checkProductionSafety({
    profile: {
      mode: "production",
      dataRoot: path.join(cwd, "data"),
    },
    cwd,
    env: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "filesystem_production_acceptance_missing"), true);
  assert.equal(result.errors.some((error) => error.code === "data_root_inside_repo"), true);
  assert.equal(result.errors.some((error) => error.code === "users_file_missing"), true);
});

test("assertProductionStartupSafety throws before unsafe production startup", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "masking-startup-safety-repo-"));

  await assert.rejects(
    () => assertProductionStartupSafety({
      profile: {
        mode: "production",
        dataRoot: path.join(cwd, "data"),
      },
      cwd,
      env: {},
    }),
    /Production startup safety check failed/,
  );
});

test("production safety passes with hashed identity and accepted filesystem boundary", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "masking-startup-safety-repo-"));
  const dataRoot = await createHashedIdentityDataRoot();
  const result = await checkProductionSafety({
    profile: {
      mode: "production",
      dataRoot,
    },
    cwd,
    env: {
      MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION: "1",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.deepEqual(result.errors, []);
});

async function createHashedIdentityDataRoot() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "masking-startup-safety-data-"));
  const identityDir = path.join(dataRoot, "identity");
  await mkdir(identityDir, { recursive: true });
  await writeFile(path.join(identityDir, "users.json"), `${JSON.stringify({
    version: 1,
    users: [
      { user_id: "admin", role: "admin", password_hash: "hash", active: true },
    ],
  }, null, 2)}\n`);
  return dataRoot;
}
