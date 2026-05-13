import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ROLES } from "../src/config/runtimeDefaults.js";
import {
  cleanupExpiredSessions,
  createSession,
  createSessionStore,
  deleteSession,
  readSession,
} from "../src/server/sessionStore.js";

test("filesystem session store creates and reads public session records", async () => {
  const { store } = await createTempSessionStore();

  const session = await store.createSession({ user_id: "worker", role: ROLES.WORKER });
  const loaded = await store.readSession(session.token);

  assert.match(session.token, /^sess_[a-f0-9]{64}$/);
  assert.equal(loaded.user_id, "worker");
  assert.equal(loaded.userId, "worker");
  assert.equal(loaded.role, ROLES.WORKER);
  assert.ok(loaded.created_at);
  assert.ok(loaded.expires_at);
});

test("filesystem session store deletes sessions by token", async () => {
  const { store } = await createTempSessionStore();
  const session = await store.createSession({ user_id: "reviewer", role: ROLES.REVIEWER });

  assert.equal(await store.deleteSession(session.token), true);
  assert.equal(await store.readSession(session.token), null);
  assert.equal(await store.deleteSession(session.token), false);
});

test("filesystem session store creates unique cryptographic-looking tokens", async () => {
  const { store } = await createTempSessionStore();
  const first = await store.createSession({ user_id: "worker", role: ROLES.WORKER });
  const second = await store.createSession({ user_id: "worker", role: ROLES.WORKER });

  assert.notEqual(first.token, second.token);
  assert.match(first.token, /^sess_[a-f0-9]{64}$/);
  assert.match(second.token, /^sess_[a-f0-9]{64}$/);
});

test("filesystem session store cleanup removes expired sessions only", async () => {
  const { store } = await createTempSessionStore();
  const expired = await store.createSession({
    user_id: "worker",
    role: ROLES.WORKER,
    ttlMs: -1,
  });
  const active = await store.createSession({
    user_id: "admin",
    role: ROLES.ADMIN,
    ttlMs: 60_000,
  });

  const cleanup = await store.cleanupExpiredSessions({ now: new Date() });

  assert.equal(cleanup.deleted, 1);
  assert.equal(await store.readSession(expired.token), null);
  assert.equal((await store.readSession(active.token)).user_id, "admin");
});

test("filesystem session store exposes module-level integration helpers", () => {
  assert.equal(typeof createSession, "function");
  assert.equal(typeof readSession, "function");
  assert.equal(typeof deleteSession, "function");
  assert.equal(typeof cleanupExpiredSessions, "function");
});

async function createTempSessionStore() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-sessions-test-"));
  return {
    rootDir,
    store: createSessionStore({ rootDir }),
  };
}
