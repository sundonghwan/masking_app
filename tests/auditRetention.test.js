import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planAuditRetention } from "../scripts/harness/audit-retention.mjs";

test("audit retention dry run reports old whole-month files without deleting them", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-audit-retention-"));
  await mkdir(path.join(rootDir, "audit"), { recursive: true });
  await writeFile(path.join(rootDir, "audit", "events-2025-01.jsonl"), "{}\n");
  await writeFile(path.join(rootDir, "audit", "events-2026-05.jsonl"), "{}\n");

  const result = await planAuditRetention(rootDir, {
    now: new Date("2026-05-13T00:00:00.000Z"),
    retentionDays: 180,
    apply: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.apply, false);
  assert.deepEqual(result.candidates.map((item) => item.file), ["events-2025-01.jsonl"]);
  assert.equal((await readFile(path.join(rootDir, "audit", "events-2025-01.jsonl"), "utf8")).trim(), "{}");
});

test("audit retention apply deletes only files whose month ended before the cutoff", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-audit-retention-"));
  await mkdir(path.join(rootDir, "audit"), { recursive: true });
  await writeFile(path.join(rootDir, "audit", "events-2025-10.jsonl"), "old\n");
  await writeFile(path.join(rootDir, "audit", "events-2025-11.jsonl"), "mixed\n");
  await writeFile(path.join(rootDir, "audit", "events-2026-05.jsonl"), "new\n");

  const result = await planAuditRetention(rootDir, {
    now: new Date("2026-05-13T00:00:00.000Z"),
    retentionDays: 180,
    apply: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.apply, true);
  assert.deepEqual(result.deleted.map((item) => item.file), ["events-2025-10.jsonl"]);
  assert.equal((await readFile(path.join(rootDir, "audit", "events-2025-11.jsonl"), "utf8")).trim(), "mixed");
  assert.equal((await readFile(path.join(rootDir, "audit", "events-2026-05.jsonl"), "utf8")).trim(), "new");
});
