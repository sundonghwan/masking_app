export const QUEUE_MODES = {
  ALL: "all",
  MY_WORK: "my_work",
  MY_REVIEW: "my_review",
};

const REVIEW_READY_STATUSES = new Set(["submitted", "rejected"]);

export function filterImagesForQueue(images = [], options = {}) {
  const queueMode = normalizeQueueMode(options.queueMode);
  const sessionUserId = normalizeId(options.sessionUserId);
  const statusFilter = String(options.statusFilter || "all");

  return images
    .filter((image) => matchesQueue(image, queueMode, sessionUserId))
    .filter((image) => statusFilter === "all" || image.status === statusFilter);
}

export function summarizeAssignmentQueue(images = [], options = {}) {
  const sessionUserId = normalizeId(options.sessionUserId);
  return {
    all: images.length,
    my_work: images.filter((image) => matchesQueue(image, QUEUE_MODES.MY_WORK, sessionUserId)).length,
    my_review: images.filter((image) => matchesQueue(image, QUEUE_MODES.MY_REVIEW, sessionUserId)).length,
  };
}

export function normalizeQueueMode(value) {
  return Object.values(QUEUE_MODES).includes(value) ? value : QUEUE_MODES.ALL;
}

function matchesQueue(image = {}, queueMode, sessionUserId) {
  if (queueMode === QUEUE_MODES.ALL) return true;
  if (!sessionUserId) return false;
  if (queueMode === QUEUE_MODES.MY_WORK) {
    return normalizeId(image.worker_id || image.workerId) === sessionUserId;
  }
  if (queueMode === QUEUE_MODES.MY_REVIEW) {
    return normalizeId(image.reviewer_id || image.reviewerId) === sessionUserId
      && REVIEW_READY_STATUSES.has(image.status);
  }
  return true;
}

function normalizeId(value) {
  return String(value || "").trim();
}
