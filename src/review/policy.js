export const REVIEW_ACTIONS = {
  APPROVE: "approve",
  REJECT: "reject",
  REWORK: "rework",
};

export const REVIEW_REASONS = {
  IMAGE_NOT_FOUND: "image_not_found",
  INVALID_ACTION: "invalid_action",
  NOT_SUBMITTED: "not_submitted",
  NOT_REJECTED: "not_rejected",
  MISSING_REJECTION_REASON: "missing_rejection_reason",
  MISSING_REVIEWER_ID: "missing_reviewer_id",
};

export function validateReviewTransition(image = {}, input = {}) {
  const action = normalizeAction(input.action);
  const reason = String(input.reason || input.reject_reason || "").trim();
  const reviewerId = normalizeReviewerId(input.reviewerId || input.reviewer_id);
  const reasons = [];

  if (!image || !image.id) reasons.push(REVIEW_REASONS.IMAGE_NOT_FOUND);
  if (!action) reasons.push(REVIEW_REASONS.INVALID_ACTION);
  if (!reviewerId) reasons.push(REVIEW_REASONS.MISSING_REVIEWER_ID);

  if (action === REVIEW_ACTIONS.APPROVE && image.status !== "submitted") {
    reasons.push(REVIEW_REASONS.NOT_SUBMITTED);
  }
  if (action === REVIEW_ACTIONS.REJECT) {
    if (image.status !== "submitted") reasons.push(REVIEW_REASONS.NOT_SUBMITTED);
    if (!reason) reasons.push(REVIEW_REASONS.MISSING_REJECTION_REASON);
  }
  if (action === REVIEW_ACTIONS.REWORK && image.status !== "rejected") {
    reasons.push(REVIEW_REASONS.NOT_REJECTED);
  }

  return {
    valid: reasons.length === 0,
    action,
    reasons,
    checks: {
      image: Boolean(image?.id),
      action: Boolean(action),
      submitted: action === REVIEW_ACTIONS.REWORK ? true : image?.status === "submitted",
      rejected: action === REVIEW_ACTIONS.REWORK ? image?.status === "rejected" : true,
      rejection_reason: action === REVIEW_ACTIONS.REJECT ? Boolean(reason) : true,
      reviewer_id: Boolean(reviewerId),
    },
  };
}

export function applyReviewTransition(image = {}, input = {}, options = {}) {
  const validation = validateReviewTransition(image, input);
  if (!validation.valid) {
    return { valid: false, validation, image };
  }

  const now = options.now || new Date().toISOString();
  const reviewerId = normalizeReviewerId(input.reviewerId || input.reviewer_id);
  const reason = String(input.reason || input.reject_reason || "").trim();
  const updated = {
    ...image,
    reviewer_id: reviewerId,
    updated_at: now,
    review_events: [
      ...(Array.isArray(image.review_events) ? image.review_events : []),
      {
        action: validation.action,
        reviewer_id: reviewerId,
        reason,
        from_status: image.status || "",
        to_status: nextStatus(validation.action),
        created_at: now,
      },
    ],
  };

  if (validation.action === REVIEW_ACTIONS.APPROVE) {
    updated.status = "approved";
    updated.approved_at = now;
    updated.rejected_at = "";
    updated.reject_reason = "";
  } else if (validation.action === REVIEW_ACTIONS.REJECT) {
    updated.status = "rejected";
    updated.rejected_at = now;
    updated.reject_reason = reason;
  } else if (validation.action === REVIEW_ACTIONS.REWORK) {
    updated.status = "in_progress";
    updated.rework_started_at = now;
  }

  return { valid: true, validation, image: updated };
}

function nextStatus(action) {
  return {
    [REVIEW_ACTIONS.APPROVE]: "approved",
    [REVIEW_ACTIONS.REJECT]: "rejected",
    [REVIEW_ACTIONS.REWORK]: "in_progress",
  }[action] || "";
}

export function reviewReasonLabel(reason) {
  return {
    [REVIEW_REASONS.IMAGE_NOT_FOUND]: "이미지를 찾을 수 없습니다",
    [REVIEW_REASONS.INVALID_ACTION]: "지원하지 않는 리뷰 작업입니다",
    [REVIEW_REASONS.NOT_SUBMITTED]: "제출 상태에서만 리뷰할 수 있습니다",
    [REVIEW_REASONS.NOT_REJECTED]: "반려 상태에서만 재작업을 시작할 수 있습니다",
    [REVIEW_REASONS.MISSING_REJECTION_REASON]: "반려 사유가 필요합니다",
    [REVIEW_REASONS.MISSING_REVIEWER_ID]: "리뷰어 ID가 필요합니다",
  }[reason] || reason;
}

export function normalizeReviewerId(value) {
  return String(value || "").trim();
}

function normalizeAction(action) {
  const value = String(action || "").trim().toLowerCase();
  return Object.values(REVIEW_ACTIONS).includes(value) ? value : "";
}
