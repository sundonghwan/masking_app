import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyAuditRoot } from "../scripts/harness/audit-verify.mjs";

test("audit verifier summarizes valid JSONL events by action and outcome", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-audit-verify-"));
  await mkdir(path.join(rootDir, "audit"), { recursive: true });
  await writeFile(path.join(rootDir, "audit", "events-2026-05.jsonl"), [
    JSON.stringify({
      event_id: "audit_1",
      created_at: "2026-05-13T00:00:00.000Z",
      action: "session.login",
      actor_id: "admin",
      actor_role: "admin",
      resource_type: "session",
      resource_id: "admin",
      outcome: "success",
      metadata: { method: "password" },
    }),
    JSON.stringify({
      event_id: "audit_2",
      created_at: "2026-05-13T00:01:00.000Z",
      action: "project.export",
      actor_id: "reviewer",
      actor_role: "reviewer",
      resource_type: "project",
      resource_id: "project-1",
      project_id: "project-1",
      outcome: "success",
      metadata: { exported_images: 1 },
    }),
  ].join("\n"));

  const result = await verifyAuditRoot(rootDir);

  assert.equal(result.ok, true);
  assert.equal(result.counts.files, 1);
  assert.equal(result.counts.events, 2);
  assert.deepEqual(result.actions, {
    "project.export": { success: 1, failure: 0 },
    "session.login": { success: 1, failure: 0 },
  });
});

test("audit verifier fails on malformed JSONL and forbidden metadata keys", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-audit-verify-"));
  await mkdir(path.join(rootDir, "audit"), { recursive: true });
  await writeFile(path.join(rootDir, "audit", "events-2026-05.jsonl"), [
    JSON.stringify({
      event_id: "audit_1",
      created_at: "not-a-date",
      action: "session.login",
      actor_id: "admin",
      actor_role: "admin",
      resource_type: "session",
      resource_id: "admin",
      outcome: "success",
      metadata: { token: "leaked" },
    }),
    "{broken json",
  ].join("\n"));

  const result = await verifyAuditRoot(rootDir);

  assert.equal(result.ok, false);
  assert.equal(result.counts.events, 1);
  assert.equal(result.errors.some((error) => error.code === "audit_event_invalid_timestamp"), true);
  assert.equal(result.errors.some((error) => error.code === "audit_event_forbidden_metadata_key"), true);
  assert.equal(result.errors.some((error) => error.code === "audit_json_parse_failed"), true);
});
