# Audit Store Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the filesystem audit-store foundation from the operational audit retention design.

**Architecture:** Add a focused `src/server/auditStore.js` module that normalizes audit events, sanitizes metadata, appends monthly JSONL files under `<data_root>/audit/`, and lists stored events for verification. This slice does not connect route handlers yet.

**Tech Stack:** Node ES modules, `node:fs/promises`, `node:path`, Node built-in test runner, existing syntax harness.

---

### Task 1: Audit Store Test Contract

**Files:**
- Create: `tests/auditStore.test.js`
- Create later: `src/server/auditStore.js`

- [ ] **Step 1: Write the failing test**

Create `tests/auditStore.test.js` with tests for append/list, validation, and sanitization:

```js
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
  assert.equal(file.trim().split("\\n").length, 1);
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
      nested: { authorization: "Bearer sess_abc", safe: "ok" },
    },
  });

  assert.equal(event.metadata.password, "[REDACTED]");
  assert.equal(event.metadata.token, "[REDACTED]");
  assert.equal(event.metadata.nested.authorization, "[REDACTED]");
  assert.equal(event.metadata.nested.safe, "ok");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/auditStore.test.js
```

Expected: fails with `ERR_MODULE_NOT_FOUND` for `src/server/auditStore.js`.

### Task 2: Audit Store Module

**Files:**
- Create: `src/server/auditStore.js`
- Modify: `scripts/harness/check-syntax.mjs`
- Test: `tests/auditStore.test.js`

- [ ] **Step 1: Implement `createAuditStore`**

Create `src/server/auditStore.js` with:

```js
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ROOT_DIR = process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data";
const REDACTED = "[REDACTED]";
const FORBIDDEN_KEYS = new Set([
  "authorization",
  "body",
  "buffer",
  "data_url",
  "dataUrl",
  "mask_data_url",
  "maskDataUrl",
  "password",
  "payload",
  "sessionToken",
  "token",
]);

export function createAuditStore({ rootDir = DEFAULT_ROOT_DIR, now = () => new Date() } = {}) {
  const auditDir = path.join(path.resolve(rootDir), "audit");

  return {
    async appendEvent(input = {}) {
      const event = normalizeAuditEvent(input, now);
      await mkdir(auditDir, { recursive: true });
      await writeFile(auditFilePath(event.created_at), `${JSON.stringify(event)}\n`, { flag: "a" });
      return event;
    },
    async listEvents() {
      let entries = [];
      try {
        entries = await readdir(auditDir, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
      const files = entries
        .filter((entry) => entry.isFile() && /^events-\d{4}-\d{2}\.jsonl$/.test(entry.name))
        .map((entry) => entry.name)
        .sort();
      const events = [];
      for (const file of files) {
        const text = await readFile(path.join(auditDir, file), "utf8");
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          events.push(JSON.parse(line));
        }
      }
      return events;
    },
  };

  function auditFilePath(createdAt) {
    return path.join(auditDir, `events-${String(createdAt).slice(0, 7)}.jsonl`);
  }
}
```

- [ ] **Step 2: Implement validation and sanitization helpers**

Add helper functions in the same file:

```js
function normalizeAuditEvent(input = {}, now) {
  const createdAt = normalizeIsoTimestamp(input.created_at || input.createdAt, now);
  const action = normalizeRequired(input.action, "action");
  const actorId = normalizeRequired(input.actor_id || input.actorId, "actor_id");
  const actorRole = normalizeRequired(input.actor_role || input.actorRole, "actor_role");
  const resourceType = normalizeRequired(input.resource_type || input.resourceType, "resource_type");
  const resourceId = normalizeRequired(input.resource_id || input.resourceId, "resource_id");
  const outcome = normalizeOutcome(input.outcome);
  return {
    event_id: normalizeEventId(input.event_id || input.eventId, createdAt),
    created_at: createdAt,
    action,
    actor_id: actorId,
    actor_role: actorRole,
    resource_type: resourceType,
    resource_id: resourceId,
    project_id: normalizeOptional(input.project_id || input.projectId),
    image_id: normalizeOptional(input.image_id || input.imageId),
    outcome,
    reason: normalizeOptional(input.reason),
    request_id: normalizeOptional(input.request_id || input.requestId),
    metadata: sanitizeAuditMetadata(input.metadata || {}),
  };
}
```

Use `auditStoreError("audit_event_invalid", "...", 400)` when validation fails.

- [ ] **Step 3: Add syntax harness coverage**

Add `"src/server/auditStore.js"` to `SYNTAX_CHECK_FILES` in `scripts/harness/check-syntax.mjs`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/auditStore.test.js
```

Expected: 3 tests pass.

### Task 3: Harness Task, Review, And Commit

**Files:**
- Create: `harness/tasks/2026-05-13-audit-store-foundation.md`
- Modify: `harness/run_log.md`
- Modify: `docs/PRODUCTION_READINESS_AUDIT.md`
- Modify: `docs/SECURITY_HARDENING_PLAN.md`

- [ ] **Step 1: Create the harness task file**

Record goal, scope, non-goals, risks, impact chains, validation plan, and closeout in `harness/tasks/2026-05-13-audit-store-foundation.md`.

- [ ] **Step 2: Run full validation**

Run:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Review and commit**

Run:

```bash
git diff -- src/server/auditStore.js tests/auditStore.test.js scripts/harness/check-syntax.mjs
git add docs/PRODUCTION_READINESS_AUDIT.md docs/SECURITY_HARDENING_PLAN.md docs/superpowers/plans/2026-05-13-audit-store-foundation-plan.md harness/run_log.md harness/tasks/2026-05-13-audit-store-foundation.md scripts/harness/check-syntax.mjs src/server/auditStore.js tests/auditStore.test.js
git diff --cached --check
git commit -m "Add audit store foundation"
git push
```

Expected: commit and push succeed.
