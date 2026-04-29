import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_ACTIONS,
  REVIEW_REASONS,
  applyReviewTransition,
  reviewReasonLabel,
  validateReviewTransition,
} from "../src/review/policy.js";

test("approves submitted images", () => {
  const result = applyReviewTransition(baseImage({ status: "submitted" }), {
    action: REVIEW_ACTIONS.APPROVE,
    reviewer_id: "reviewer-1",
  }, { now: "2026-04-29T00:00:00.000Z" });

  assert.equal(result.valid, true);
  assert.equal(result.image.status, "approved");
  assert.equal(result.image.reviewer_id, "reviewer-1");
  assert.equal(result.image.approved_at, "2026-04-29T00:00:00.000Z");
  assert.equal(result.image.reject_reason, "");
  assert.deepEqual(result.image.review_events, [
    {
      action: "approve",
      reviewer_id: "reviewer-1",
      reason: "",
      from_status: "submitted",
      to_status: "approved",
      created_at: "2026-04-29T00:00:00.000Z",
    },
  ]);
});

test("rejects submitted images with required reason", () => {
  const result = applyReviewTransition(baseImage({ status: "submitted" }), {
    action: REVIEW_ACTIONS.REJECT,
    reason: "Mask leaks outside the part",
  });

  assert.equal(result.valid, true);
  assert.equal(result.image.status, "rejected");
  assert.equal(result.image.reject_reason, "Mask leaks outside the part");
  assert.ok(result.image.rejected_at);
});

test("reject action requires a rejection reason", () => {
  const result = validateReviewTransition(baseImage({ status: "submitted" }), {
    action: REVIEW_ACTIONS.REJECT,
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, [REVIEW_REASONS.MISSING_REJECTION_REASON]);
});

test("rework starts only from rejected images", () => {
  const rejected = applyReviewTransition(baseImage({ status: "rejected", reject_reason: "Needs tighter edge" }), {
    action: REVIEW_ACTIONS.REWORK,
  });
  const submitted = validateReviewTransition(baseImage({ status: "submitted" }), {
    action: REVIEW_ACTIONS.REWORK,
  });

  assert.equal(rejected.valid, true);
  assert.equal(rejected.image.status, "in_progress");
  assert.equal(submitted.valid, false);
  assert.deepEqual(submitted.reasons, [REVIEW_REASONS.NOT_REJECTED]);
});

test("review reason labels are stable", () => {
  assert.equal(reviewReasonLabel(REVIEW_REASONS.NOT_SUBMITTED), "제출 상태에서만 리뷰할 수 있습니다");
});

function baseImage(overrides = {}) {
  return {
    id: "image-1",
    status: "submitted",
    ...overrides,
  };
}
