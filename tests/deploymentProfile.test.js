import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeploymentProfile } from "../src/server/deploymentProfile.js";

test("resolves local deployment defaults with explicit env overrides", () => {
  const profile = resolveDeploymentProfile({
    PORT: "5010",
    MASKING_APP_HOST: "127.0.0.1",
    MASKING_APP_DATA_DIR: "/tmp/masking-data",
    MASKING_APP_LOG_LEVEL: "debug",
    MASKING_APP_PUBLIC_ROOT: "/tmp/public",
    MASKING_APP_SESSION_TTL_MS: "120000",
  }, { cwd: "/repo" });

  assert.equal(profile.mode, "local");
  assert.equal(profile.port, 5010);
  assert.equal(profile.host, "127.0.0.1");
  assert.equal(profile.dataRoot, "/tmp/masking-data");
  assert.equal(profile.publicRoot, "/tmp/public");
  assert.equal(profile.logLevel, "debug");
  assert.equal(profile.sessionTtlMs, 120000);
  assert.equal(profile.aiServing.enabled, false);
});

test("deployment profile enables generic AI serving without selecting a model", () => {
  const profile = resolveDeploymentProfile({
    MASKING_APP_MODE: "staging",
    MASKING_APP_AI_SERVING: "1",
    MASKING_APP_AI_MAX_IMAGE_BYTES: "1024",
  }, { cwd: "/repo" });

  assert.equal(profile.mode, "staging");
  assert.equal(profile.aiServing.enabled, true);
  assert.equal(profile.aiServing.provider, "stub");
  assert.equal(profile.aiServing.maxImageBytes, 1024);
  assert.deepEqual(profile.aiServing.tasks, ["detection", "segmentation", "classification"]);
});

test("deployment profile rejects invalid port and mode values", () => {
  assert.throws(
    () => resolveDeploymentProfile({ PORT: "70000" }, { cwd: "/repo" }),
    /PORT must be an integer between 1 and 65535/,
  );
  assert.throws(
    () => resolveDeploymentProfile({ MASKING_APP_MODE: "prod shell" }, { cwd: "/repo" }),
    /MASKING_APP_MODE contains unsupported characters/,
  );
  assert.throws(
    () => resolveDeploymentProfile({ MASKING_APP_SESSION_TTL_MS: "0" }, { cwd: "/repo" }),
    /MASKING_APP_SESSION_TTL_MS must be a positive integer/,
  );
});
