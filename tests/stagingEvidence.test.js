import assert from "node:assert/strict";
import test from "node:test";

import { collectStagingEvidence } from "../scripts/harness/staging-evidence.mjs";

test("collectStagingEvidence runs core checks and restores the created backup archive", async () => {
  const calls = [];
  const result = await collectStagingEvidence({
    dataRoot: "/tmp/data-root",
    backupDir: "/tmp/backups",
    baseUrl: "http://127.0.0.1:4173",
    now: () => "2026-05-13T00:00:00.000Z",
    runCommand: async (step, command) => {
      calls.push({ step, command });
      return {
        exitCode: 0,
        stdout: JSON.stringify(fakePayload(step)),
        stderr: "",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.required_steps, [
    "storage_verify",
    "capacity_profile",
    "backup_data_root",
    "restore_verify",
    "production_gate",
  ]);
  assert.equal(result.optional_steps[0], "deployment_check");
  assert.equal(result.evidence.backup_data_root.archive_file, "/tmp/backups/masking-app-data-test.tgz");
  assert.equal(calls.find((call) => call.step === "restore_verify").command.args.at(-1), "/tmp/backups/masking-app-data-test.tgz");
  assert.equal(calls.find((call) => call.step === "deployment_check").command.args.at(-1), "http://127.0.0.1:4173");
});

test("collectStagingEvidence records failed sub-checks without hiding them", async () => {
  const result = await collectStagingEvidence({
    dataRoot: "/tmp/data-root",
    backupDir: "/tmp/backups",
    runCommand: async (step) => ({
      exitCode: step === "production_gate" ? 1 : 0,
      stdout: JSON.stringify({ ok: step !== "production_gate", errors: step === "production_gate" ? [{ code: "production_mode_required" }] : [] }),
      stderr: "",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.steps.production_gate.ok, false);
  assert.equal(result.errors.some((error) => error.step === "production_gate" && error.code === "production_mode_required"), true);
});

test("collectStagingEvidence skips restore when backup does not produce an archive", async () => {
  const calls = [];
  const result = await collectStagingEvidence({
    dataRoot: "/tmp/data-root",
    backupDir: "/tmp/backups",
    runCommand: async (step) => {
      calls.push(step);
      return {
        exitCode: step === "backup_data_root" ? 1 : 0,
        stdout: JSON.stringify({ ok: step !== "backup_data_root", errors: [{ code: "backup_failed" }] }),
        stderr: "",
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.steps.restore_verify.status, "skipped");
  assert.equal(calls.includes("restore_verify"), false);
  assert.equal(result.errors.some((error) => error.step === "restore_verify" && error.code === "backup_archive_unavailable"), true);
});

function fakePayload(step) {
  if (step === "backup_data_root") {
    return { ok: true, archive_file: "/tmp/backups/masking-app-data-test.tgz", errors: [] };
  }
  return { ok: true, errors: [] };
}
