import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLogger } from "../src/observability/logger.js";
import { createJsonlFileSink } from "../src/observability/runtimeLogSink.js";

test("jsonl file sink requires a log file path", () => {
  assert.throws(() => createJsonlFileSink(), /logFile is required/);
  assert.throws(() => createJsonlFileSink({ logFile: "" }), /logFile is required/);
});

test("jsonl file sink appends one structured log entry per line", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "masking-log-sink-"));
  const logFile = path.join(dir, "runtime", "app.jsonl");
  const logger = createLogger({
    component: "server",
    now: () => "2026-05-13T00:00:00.000Z",
    sink: createJsonlFileSink({ logFile }),
  });

  logger.info("export.completed", {
    request_id: "req_1",
    project_id: "project-1",
    exported_images: 2,
  });
  logger.warn("sync.export.fallback", {
    reason: "server_unavailable",
  });

  const lines = (await readFile(logFile, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].event, "export.completed");
  assert.equal(lines[0].project_id, "project-1");
  assert.equal(lines[1].level, "warn");
});

test("jsonl file sink can mirror entries to another sink", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "masking-log-sink-"));
  const mirrored = [];
  const sink = createJsonlFileSink({
    logFile: path.join(dir, "app.jsonl"),
    mirrorSink: (entry) => mirrored.push(entry),
  });

  sink({ event: "api.request.completed", level: "info" });

  assert.deepEqual(mirrored, [{ event: "api.request.completed", level: "info" }]);
});
