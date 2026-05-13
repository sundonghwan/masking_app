import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssignmentRoleValidation,
  buildAssignmentTargets,
  buildAssignmentUpdate,
} from "../src/server/assignment.js";

test("buildAssignmentTargets normalizes requested ids with image fallbacks", () => {
  const targets = buildAssignmentTargets({
    body: {
      worker_id: " worker ",
    },
    image: {
      worker_id: "old-worker",
      reviewer_id: " reviewer ",
    },
  });

  assert.deepEqual(targets, {
    workerId: "worker",
    reviewerId: "reviewer",
  });
});

test("buildAssignmentRoleValidation reports both role checks", () => {
  assert.deepEqual(buildAssignmentRoleValidation({ workerValid: true, reviewerValid: false }), {
    valid: false,
    payload: {
      worker_id: true,
      reviewer_id: false,
    },
  });
});

test("buildAssignmentUpdate preserves status and records assignment metadata", () => {
  const image = {
    id: "image-1",
    status: "submitted",
    worker_id: "old-worker",
    reviewer_id: "old-reviewer",
    updated_at: "2026-05-12T00:00:00.000Z",
  };

  const updated = buildAssignmentUpdate({
    image,
    workerId: "worker",
    reviewerId: "reviewer",
    actorId: "admin",
    now: "2026-05-13T00:00:00.000Z",
  });

  assert.equal(updated.status, "submitted");
  assert.equal(updated.worker_id, "worker");
  assert.equal(updated.reviewer_id, "reviewer");
  assert.equal(updated.assigned_by, "admin");
  assert.equal(updated.assigned_at, "2026-05-13T00:00:00.000Z");
  assert.equal(updated.updated_at, "2026-05-13T00:00:00.000Z");
});
