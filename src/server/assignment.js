import { DEFAULT_ACTORS, normalizeActorId } from "../config/runtimeDefaults.js";

export function buildAssignmentTargets({ body = {}, image = {} } = {}) {
  return {
    workerId: normalizeActorId(body.worker_id || body.workerId || image.worker_id || DEFAULT_ACTORS.worker),
    reviewerId: normalizeActorId(body.reviewer_id || body.reviewerId || image.reviewer_id || ""),
  };
}

export function buildAssignmentRoleValidation({ workerValid, reviewerValid } = {}) {
  return {
    valid: workerValid === true && reviewerValid === true,
    payload: {
      worker_id: workerValid === true,
      reviewer_id: reviewerValid === true,
    },
  };
}

export function buildAssignmentUpdate({ image, workerId, reviewerId, actorId, now = new Date().toISOString() } = {}) {
  return {
    ...image,
    worker_id: workerId,
    reviewer_id: reviewerId,
    assigned_by: actorId,
    assigned_at: now,
    updated_at: now,
  };
}
