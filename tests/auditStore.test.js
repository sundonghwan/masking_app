import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAuditStore } from "../src/server/auditStore.js";

test("audit store appends monthly JSONL events and lists them", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-audit-test-"));
  const store = createAuditStore({ rootDir });

  const event = await store.appendEvent({
    action: "session.login",
    actor_id: "admin",
    actor_role: "admin",
    resource_type: "session",
    resource_id: "admin",
    outcome: "success",
    created_at: "2026-05-13T00:00:00.000Z",
    request_id: "req_1",
    metadata: { method: "password" },
  });

  assert.match(event.event_id, /^audit_/);
  assert.equal(event.action, "session.login");
  assert.equal(event.metadata.method, "password");

  const file = await readFile(path.join(rootDir, "audit", "events-2026-05.jsonl"), "utf8");
  assert.equal(file.trim().split("\n").length, 1);
  assert.deepEqual((await store.listEvents()).map((item) => item.event_id), [event.event_id]);
});

test("audit store rejects missing required event fields", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-audit-test-"));
  const store = createAuditStore({ rootDir });

  await assert.rejects(
    () => store.appendEvent({ action: "session.login", outcome: "success" }),
    (error) => error.code === "audit_event_invalid" && error.statusCode === 400,
  );
});

test("audit store redacts forbidden metadata fields recursively", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-audit-test-"));
  const store = createAuditStore({ rootDir });

  const event = await store.appendEvent({
    action: "user.update",
    actor_id: "admin",
    actor_role: "admin",
    resource_type: "user",
    resource_id: "worker",
    outcome: "success",
    created_at: "2026-05-13T00:00:00.000Z",
    metadata: {
      password: "secret",
      token: "sess_abc",
      nested: { Authorization: "Bearer sess_abc", authorization: "Bearer sess_abc", safe: "ok" },
    },
  });

  assert.equal(event.metadata.password, "[REDACTED]");
  assert.equal(event.metadata.token, "[REDACTED]");
  assert.equal(event.metadata.nested.Authorization, "[REDACTED]");
  assert.equal(event.metadata.nested.authorization, "[REDACTED]");
  assert.equal(event.metadata.nested.safe, "ok");
});
