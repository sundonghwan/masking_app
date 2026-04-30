import assert from "node:assert/strict";
import test from "node:test";

import {
  REJECTION_REASON_CODES,
  REVIEW_ACTIONS,
  REVIEW_REASONS,
  applyReviewTransition,
  normalizeRejectReasonCode,
  rejectionReasonCodeLabel,
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
    reviewer_id: "reviewer-1",
  });

  assert.equal(result.valid, true);
  assert.equal(result.image.status, "rejected");
  assert.equal(result.image.reject_reason, "Mask leaks outside the part");
  assert.ok(result.image.rejected_at);
});

test("rejects submitted images with normalized structured reason code", () => {
  const result = applyReviewTransition(baseImage({ status: "submitted" }), {
    action: REVIEW_ACTIONS.REJECT,
    reason_code: "Edge Leak",
    reviewer_id: "reviewer-1",
  }, { now: "2026-04-29T00:00:00.000Z" });

  assert.equal(result.valid, true);
  assert.equal(result.validation.reason_code, REJECTION_REASON_CODES.EDGE_LEAK);
  assert.equal(result.validation.reason_label, "마스크가 대상 밖으로 새어 나감");
  assert.equal(result.image.reject_reason_code, REJECTION_REASON_CODES.EDGE_LEAK);
  assert.equal(result.image.reject_reason, "마스크가 대상 밖으로 새어 나감");
  assert.deepEqual(result.image.review_events, [
    {
      action: "reject",
      reviewer_id: "reviewer-1",
      reason: "마스크가 대상 밖으로 새어 나감",
      reason_code: "edge_leak",
      reason_label: "마스크가 대상 밖으로 새어 나감",
      from_status: "submitted",
      to_status: "rejected",
      created_at: "2026-04-29T00:00:00.000Z",
    },
  ]);
});

test("normalizes rejection reason aliases and text fallbacks", () => {
  assert.equal(normalizeRejectReasonCode("missing-region"), REJECTION_REASON_CODES.MISSING_REGION);
  assert.equal(normalizeRejectReasonCode("", "Mask leaks outside the part"), REJECTION_REASON_CODES.EDGE_LEAK);
  assert.equal(normalizeRejectReasonCode("custom uncommon code"), REJECTION_REASON_CODES.OTHER);
  assert.equal(rejectionReasonCodeLabel(REJECTION_REASON_CODES.ROUGH_BOUNDARY), "경계가 거칠거나 부정확함");
});

test("reject action requires a rejection reason", () => {
  const result = validateReviewTransition(baseImage({ status: "submitted" }), {
    action: REVIEW_ACTIONS.REJECT,
    reviewer_id: "reviewer-1",
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, [REVIEW_REASONS.MISSING_REJECTION_REASON]);
});

test("rework starts only from rejected images", () => {
  const rejected = applyReviewTransition(baseImage({ status: "rejected", reject_reason: "Needs tighter edge" }), {
    action: REVIEW_ACTIONS.REWORK,
    reviewer_id: "reviewer-1",
  });
  const submitted = validateReviewTransition(baseImage({ status: "submitted" }), {
    action: REVIEW_ACTIONS.REWORK,
    reviewer_id: "reviewer-1",
  });

  assert.equal(rejected.valid, true);
  assert.equal(rejected.image.status, "in_progress");
  assert.equal(submitted.valid, false);
  assert.deepEqual(submitted.reasons, [REVIEW_REASONS.NOT_REJECTED]);
});

test("review reason labels are stable", () => {
  assert.equal(reviewReasonLabel(REVIEW_REASONS.NOT_SUBMITTED), "제출 상태에서만 리뷰할 수 있습니다");
});

test("review transition requires reviewer identity", () => {
  const result = validateReviewTransition(baseImage({ status: "submitted" }), {
    action: REVIEW_ACTIONS.APPROVE,
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, [REVIEW_REASONS.MISSING_REVIEWER_ID]);
  assert.equal(result.checks.reviewer_id, false);
});

function baseImage(overrides = {}) {
  return {
    id: "image-1",
    status: "submitted",
    ...overrides,
  };
}
