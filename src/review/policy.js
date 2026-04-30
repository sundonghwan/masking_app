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

export const REJECTION_REASON_CODES = {
  EDGE_LEAK: "edge_leak",
  MISSING_REGION: "missing_region",
  ROUGH_BOUNDARY: "rough_boundary",
  WRONG_OBJECT: "wrong_object",
  EMPTY_MASK: "empty_mask",
  LOW_CONFIDENCE: "low_confidence",
  OTHER: "other",
};

const REJECTION_REASON_LABELS = {
  [REJECTION_REASON_CODES.EDGE_LEAK]: "마스크가 대상 밖으로 새어 나감",
  [REJECTION_REASON_CODES.MISSING_REGION]: "마스크 누락 영역 있음",
  [REJECTION_REASON_CODES.ROUGH_BOUNDARY]: "경계가 거칠거나 부정확함",
  [REJECTION_REASON_CODES.WRONG_OBJECT]: "잘못된 대상이 마스킹됨",
  [REJECTION_REASON_CODES.EMPTY_MASK]: "마스크가 비어 있음",
  [REJECTION_REASON_CODES.LOW_CONFIDENCE]: "품질 확인이 더 필요함",
  [REJECTION_REASON_CODES.OTHER]: "기타 품질 이슈",
};

const REJECTION_REASON_ALIASES = {
  edge_leak: REJECTION_REASON_CODES.EDGE_LEAK,
  leak: REJECTION_REASON_CODES.EDGE_LEAK,
  outside_mask: REJECTION_REASON_CODES.EDGE_LEAK,
  missing_region: REJECTION_REASON_CODES.MISSING_REGION,
  missing_area: REJECTION_REASON_CODES.MISSING_REGION,
  incomplete_mask: REJECTION_REASON_CODES.MISSING_REGION,
  rough_boundary: REJECTION_REASON_CODES.ROUGH_BOUNDARY,
  rough_edge: REJECTION_REASON_CODES.ROUGH_BOUNDARY,
  coarse_edge: REJECTION_REASON_CODES.ROUGH_BOUNDARY,
  poor_alignment: REJECTION_REASON_CODES.ROUGH_BOUNDARY,
  wrong_object: REJECTION_REASON_CODES.WRONG_OBJECT,
  wrong_target: REJECTION_REASON_CODES.WRONG_OBJECT,
  empty_mask: REJECTION_REASON_CODES.EMPTY_MASK,
  blank_mask: REJECTION_REASON_CODES.EMPTY_MASK,
  low_confidence: REJECTION_REASON_CODES.LOW_CONFIDENCE,
  needs_check: REJECTION_REASON_CODES.LOW_CONFIDENCE,
  other: REJECTION_REASON_CODES.OTHER,
};

export function validateReviewTransition(image = {}, input = {}) {
  const action = normalizeAction(input.action);
  const reasonCode = normalizeRejectReasonCode(input.reasonCode || input.reason_code, input.reason || input.reject_reason);
  const reasonLabel = rejectionReasonCodeLabel(reasonCode);
  const reason = normalizeRejectReasonText(input.reason || input.reject_reason, reasonLabel);
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
    reason_code: reasonCode,
    reason_label: reasonLabel,
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
  const reasonCode = validation.action === REVIEW_ACTIONS.REJECT ? validation.reason_code : "";
  const reasonLabel = validation.action === REVIEW_ACTIONS.REJECT ? validation.reason_label : "";
  const reason = validation.action === REVIEW_ACTIONS.REJECT
    ? normalizeRejectReasonText(input.reason || input.reject_reason, reasonLabel)
    : String(input.reason || input.reject_reason || "").trim();
  const reviewEvent = {
    action: validation.action,
    reviewer_id: reviewerId,
    reason,
    from_status: image.status || "",
    to_status: nextStatus(validation.action),
    created_at: now,
  };
  if (validation.action === REVIEW_ACTIONS.REJECT) {
    reviewEvent.reason_code = reasonCode;
    reviewEvent.reason_label = reasonLabel;
  }
  const updated = {
    ...image,
    reviewer_id: reviewerId,
    updated_at: now,
    review_events: [
      ...(Array.isArray(image.review_events) ? image.review_events : []),
      reviewEvent,
    ],
  };

  if (validation.action === REVIEW_ACTIONS.APPROVE) {
    updated.status = "approved";
    updated.approved_at = now;
    updated.rejected_at = "";
    updated.reject_reason = "";
    updated.reject_reason_code = "";
    updated.reject_reason_label = "";
  } else if (validation.action === REVIEW_ACTIONS.REJECT) {
    updated.status = "rejected";
    updated.rejected_at = now;
    updated.reject_reason = reason;
    updated.reject_reason_code = reasonCode;
    updated.reject_reason_label = reasonLabel;
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

export function rejectionReasonCodeLabel(reasonCode) {
  const normalized = normalizeRejectReasonCode(reasonCode);
  return normalized ? REJECTION_REASON_LABELS[normalized] : "";
}

export function normalizeRejectReasonCode(reasonCode, fallbackText = "") {
  const normalized = normalizeReasonToken(reasonCode);
  if (normalized) {
    return REJECTION_REASON_ALIASES[normalized] || REJECTION_REASON_CODES.OTHER;
  }

  const fallback = String(fallbackText || "").trim().toLowerCase();
  if (!fallback) return "";
  if (fallback.includes("leak") || fallback.includes("outside")) return REJECTION_REASON_CODES.EDGE_LEAK;
  if (fallback.includes("missing") || fallback.includes("incomplete")) return REJECTION_REASON_CODES.MISSING_REGION;
  if (fallback.includes("rough") || fallback.includes("edge") || fallback.includes("align")) {
    return REJECTION_REASON_CODES.ROUGH_BOUNDARY;
  }
  if (fallback.includes("wrong object") || fallback.includes("wrong target")) return REJECTION_REASON_CODES.WRONG_OBJECT;
  if (fallback.includes("empty") || fallback.includes("blank")) return REJECTION_REASON_CODES.EMPTY_MASK;
  if (fallback.includes("confidence") || fallback.includes("check")) return REJECTION_REASON_CODES.LOW_CONFIDENCE;
  return REJECTION_REASON_CODES.OTHER;
}

export function normalizeReviewerId(value) {
  return String(value || "").trim();
}

function normalizeAction(action) {
  const value = String(action || "").trim().toLowerCase();
  return Object.values(REVIEW_ACTIONS).includes(value) ? value : "";
}

function normalizeRejectReasonText(reason, fallbackLabel) {
  return String(reason || "").trim() || fallbackLabel || "";
}

function normalizeReasonToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
