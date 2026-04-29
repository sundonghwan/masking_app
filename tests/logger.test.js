import assert from "node:assert/strict";
import test from "node:test";

import { createLogger, createRequestId, sanitizeLogFields } from "../src/observability/logger.js";

test("createLogger emits stable structured entries", () => {
  const entries = [];
  const logger = createLogger({
    component: "server",
    now: () => "2026-04-29T00:00:00.000Z",
    sink: (entry) => entries.push(entry),
  });

  logger.info("api.request.completed", {
    request_id: "req_1",
    method: "GET",
    path: "/api/health",
    status: 200,
    duration_ms: 3,
  });

  assert.deepEqual(entries, [
    {
      ts: "2026-04-29T00:00:00.000Z",
      level: "info",
      event: "api.request.completed",
      component: "server",
      request_id: "req_1",
      method: "GET",
      path: "/api/health",
      status: 200,
      duration_ms: 3,
    },
  ]);
});

test("sanitizeLogFields redacts image and mask payload fields", () => {
  const output = sanitizeLogFields({
    project_id: "project-1",
    data_url: "data:image/png;base64,secret",
    nested: {
      maskDataUrl: "data:image/png;base64,mask",
      object_url: "blob:secret",
      reason: "network_error",
    },
  });

  assert.deepEqual(output, {
    project_id: "project-1",
    data_url: "[REDACTED]",
    nested: {
      maskDataUrl: "[REDACTED]",
      object_url: "[REDACTED]",
      reason: "network_error",
    },
  });
});

test("sanitizeLogFields serializes errors without stack traces", () => {
  const error = new Error("boom");
  error.status = 422;
  error.code = "mask_validation_failed";

  assert.deepEqual(sanitizeLogFields({ error }), {
    error: {
      name: "Error",
      message: "boom",
      status: 422,
      code: "mask_validation_failed",
    },
  });
});

test("createRequestId uses a stable prefix", () => {
  assert.match(createRequestId("api"), /^api_[a-z0-9]+_[a-z0-9]+$/);
});
