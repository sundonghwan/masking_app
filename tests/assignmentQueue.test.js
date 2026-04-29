import assert from "node:assert/strict";
import test from "node:test";

import {
  QUEUE_MODES,
  filterImagesForQueue,
  summarizeAssignmentQueue,
} from "../src/assignment/queue.js";

const IMAGES = [
  { id: "draft-worker", status: "in_progress", worker_id: "worker", reviewer_id: "reviewer" },
  { id: "submitted-worker", status: "submitted", worker_id: "worker", reviewer_id: "reviewer" },
  { id: "approved-worker", status: "approved", worker_id: "worker", reviewer_id: "reviewer" },
  { id: "other-worker", status: "submitted", worker_id: "other", reviewer_id: "reviewer" },
  { id: "other-reviewer", status: "submitted", worker_id: "worker", reviewer_id: "other-reviewer" },
];

test("worker queue returns images assigned to the current worker", () => {
  const result = filterImagesForQueue(IMAGES, {
    queueMode: QUEUE_MODES.MY_WORK,
    sessionUserId: "worker",
  });

  assert.deepEqual(result.map((image) => image.id), [
    "draft-worker",
    "submitted-worker",
    "approved-worker",
    "other-reviewer",
  ]);
});

test("review queue returns submitted or rejected images assigned to the reviewer", () => {
  const result = filterImagesForQueue([
    ...IMAGES,
    { id: "rejected-review", status: "rejected", worker_id: "worker", reviewer_id: "reviewer" },
  ], {
    queueMode: QUEUE_MODES.MY_REVIEW,
    sessionUserId: "reviewer",
  });

  assert.deepEqual(result.map((image) => image.id), [
    "submitted-worker",
    "other-worker",
    "rejected-review",
  ]);
});

test("status filter applies after queue filter", () => {
  const result = filterImagesForQueue(IMAGES, {
    queueMode: QUEUE_MODES.MY_WORK,
    statusFilter: "submitted",
    sessionUserId: "worker",
  });

  assert.deepEqual(result.map((image) => image.id), [
    "submitted-worker",
    "other-reviewer",
  ]);
});

test("assignment summary exposes all queue counts for the current user", () => {
  const summary = summarizeAssignmentQueue(IMAGES, { sessionUserId: "worker" });

  assert.equal(summary.all, 5);
  assert.equal(summary.my_work, 4);
  assert.equal(summary.my_review, 0);
});
