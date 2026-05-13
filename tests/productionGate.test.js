import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkProductionGate } from "../scripts/harness/production-gate.mjs";

test("production gate rejects local defaults and unsafe filesystem acceptance", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "masking-production-gate-repo-"));
  const result = await checkProductionGate({
    env: {
      MASKING_APP_MODE: "local",
    },
    cwd,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "production_mode_required"), true);
  assert.equal(result.errors.some((error) => error.code === "filesystem_production_acceptance_missing"), true);
  assert.equal(result.errors.some((error) => error.code === "data_root_inside_repo"), true);
});

test("production gate passes with production mode strict identity and accepted filesystem boundary", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "masking-production-gate-repo-"));
  const dataRoot = await createHashedIdentityDataRoot();
  const result = await checkProductionGate({
    env: {
      MASKING_APP_MODE: "production",
      MASKING_APP_HOST: "0.0.0.0",
      MASKING_APP_DATA_DIR: dataRoot,
      MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION: "1",
    },
    cwd,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.security.ok, true);
});

async function createHashedIdentityDataRoot() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "masking-production-gate-data-"));
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
