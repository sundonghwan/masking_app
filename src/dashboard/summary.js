import { createProjectRecord, createValidationSummary } from "../export/exporter.js";
import { ROLES } from "../config/runtimeDefaults.js";
import { normalizeRejectReasonCode, rejectionReasonCodeLabel } from "../review/policy.js";

const STATUS = {
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const BLOCKER_TYPES = {
  REJECTED_REWORK: "rejected_rework",
  UNASSIGNED_REVIEWER: "unassigned_reviewer",
  EXPORT_SYNC: "export_sync",
  EXPORT_VALIDATION: "export_validation",
};

export function createDashboardSummary(input = {}) {
  const project = normalizeProject(input.project || input.manifest || {});
  const images = Array.isArray(input.images)
    ? input.images
    : Array.isArray(input.manifest?.images)
      ? input.manifest.images
      : [];
  const activeImages = images.filter((image) => !image.deleted_at);
  const defaultExport = createValidationSummary(project, activeImages);
  const approvedOnlyExport = createValidationSummary(project, activeImages, { approvedOnly: true });
  const workload = createWorkload(activeImages);
  const blockers = createBlockers(activeImages, defaultExport);

  return {
    projectId: project.id,
    projectName: project.name,
    totals: {
      total: activeImages.length,
      inProgress: countStatus(activeImages, STATUS.IN_PROGRESS),
      submitted: countStatus(activeImages, STATUS.SUBMITTED),
      approved: countStatus(activeImages, STATUS.APPROVED),
      rejected: countStatus(activeImages, STATUS.REJECTED),
      exportReady: defaultExport.exportable_images,
      blocked: blockers.length,
    },
    workload,
    exportReadiness: {
      defaultPolicy: policySummary(defaultExport),
      approvedOnlyPolicy: policySummary(approvedOnlyExport),
      topExclusionReasons: topExclusionReasons(defaultExport),
      syncBlockers: activeImages
        .filter((image) => hasSyncBlocker(image))
        .map((image) => blockerTarget(image, BLOCKER_TYPES.EXPORT_SYNC, "Server export sync is incomplete")),
    },
    reviewQuality: createReviewQualityMetrics(activeImages),
    recentActivity: recentActivity(activeImages),
    blockers,
  };
}

function normalizeProject(input = {}) {
  return createProjectRecord({
    id: input.id || input.project_id,
    name: input.name || input.project_name || input.project_id,
    description: input.description,
  });
}

function countStatus(images, status) {
  return images.filter((image) => image.status === status).length;
}

function createWorkload(images) {
  const rows = new Map();
  for (const image of images) {
    addWorkloadImage(rows, image.worker_id || image.assigned_worker || image.assigned_to, ROLES.WORKER, image);
    addWorkloadImage(rows, image.reviewer_id || image.assigned_reviewer, ROLES.REVIEWER, image);
  }
  return [...rows.values()].sort((left, right) => {
    const roleOrder = roleRank(left.role) - roleRank(right.role);
    return roleOrder || left.userId.localeCompare(right.userId);
  });
}

function addWorkloadImage(rows, userId, role, image) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return;
  const key = `${role}:${normalizedUserId}`;
  if (!rows.has(key)) {
    rows.set(key, {
      userId: normalizedUserId,
      user_id: normalizedUserId,
      role,
      assigned: 0,
      inProgress: 0,
      awaitingReview: 0,
      rejectedOrRework: 0,
    });
  }
  const row = rows.get(key);
  row.assigned += 1;
  if (image.status === STATUS.IN_PROGRESS) row.inProgress += 1;
  if (image.status === STATUS.SUBMITTED) row.awaitingReview += 1;
  if (image.status === STATUS.REJECTED || image.revision_started_at) row.rejectedOrRework += 1;
}

function roleRank(role) {
  if (role === ROLES.WORKER) return 1;
  if (role === ROLES.REVIEWER) return 2;
  if (role === ROLES.ADMIN) return 3;
  return 9;
}

function policySummary(summary) {
  return {
    total: summary.total_images,
    included: summary.exportable_images,
    excluded: summary.excluded_images,
  };
}

function topExclusionReasons(summary) {
  const counts = new Map();
  for (const item of summary.items || []) {
    for (const reason of item.reasons || []) {
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function createBlockers(images, defaultExport) {
  const blockers = [];
  for (const image of images) {
    if (image.status === STATUS.REJECTED) {
      blockers.push(blockerTarget(image, BLOCKER_TYPES.REJECTED_REWORK, "Rejected image needs rework"));
    }
    if (image.status === STATUS.SUBMITTED && !String(image.reviewer_id || image.assigned_reviewer || "").trim()) {
      blockers.push(blockerTarget(image, BLOCKER_TYPES.UNASSIGNED_REVIEWER, "Submitted image has no reviewer"));
    }
    if (hasSyncBlocker(image)) {
      blockers.push(blockerTarget(image, BLOCKER_TYPES.EXPORT_SYNC, "Image or mask is not synced for server export"));
    }
  }
  for (const item of defaultExport.items || []) {
    if (!item.exportable && item.reasons?.length) {
      const image = images.find((candidate) => candidate.id === item.image_id) || { id: item.image_id };
      blockers.push(blockerTarget(image, BLOCKER_TYPES.EXPORT_VALIDATION, item.reasons.join(", ")));
    }
  }
  return blockers;
}

function hasSyncBlocker(image) {
  const sync = image.sync || {};
  if (sync.image === "failed" || sync.mask === "failed") return true;
  if (image.status === STATUS.SUBMITTED || image.status === STATUS.APPROVED) {
    return Boolean(image.object_url && !image.image_path) || Boolean(image.mask_data_url && !image.current_mask_path);
  }
  return false;
}

function blockerTarget(image, type, label) {
  return {
    imageId: image.id || "",
    image_id: image.id || "",
    imageName: image.original_file_name || image.file_name || image.id || "",
    image_name: image.original_file_name || image.file_name || image.id || "",
    type,
    label,
    targetView: type === BLOCKER_TYPES.UNASSIGNED_REVIEWER ? "assignment" : "workbench",
  };
}

function createReviewQualityMetrics(images) {
  const eventsByImage = images.map((image) => ({
    events: Array.isArray(image.review_events) ? image.review_events : [],
  }));
  const allEvents = eventsByImage.flatMap((entry) => entry.events);
  const counts = {
    approvals: 0,
    rejections: 0,
    reworks: 0,
    revisionsStarted: 0,
  };
  const rejectReasonCounts = new Map();
  let unstructuredRejectReasons = 0;
  let imagesWithMultipleRejections = 0;

  for (const { events } of eventsByImage) {
    let imageRejections = 0;
    for (const event of events) {
      const action = normalizeReviewAction(event.action || event.type || event.status);
      if (action === "approve") counts.approvals += 1;
      if (action === "reject") {
        counts.rejections += 1;
        imageRejections += 1;
        const hadStructuredCode = Boolean(String(event.reason_code || event.reasonCode || "").trim());
        const reasonCode = normalizeRejectReasonCode(event.reason_code || event.reasonCode, event.reason || event.reject_reason);
        if (reasonCode) {
          rejectReasonCounts.set(reasonCode, (rejectReasonCounts.get(reasonCode) || 0) + 1);
        }
        if (!hadStructuredCode && reasonCode === "other") unstructuredRejectReasons += 1;
      }
      if (action === "rework") counts.reworks += 1;
      if (action === "revision_start") counts.revisionsStarted += 1;
    }
    if (imageRejections > 1) imagesWithMultipleRejections += 1;
  }

  const decisions = counts.approvals + counts.rejections;
  return {
    totalEvents: allEvents.length,
    approvals: counts.approvals,
    rejections: counts.rejections,
    reworks: counts.reworks,
    revisionsStarted: counts.revisionsStarted,
    currentRejected: countStatus(images, STATUS.REJECTED),
    currentApproved: countStatus(images, STATUS.APPROVED),
    approvalRate: ratio(counts.approvals, decisions),
    rejectionRate: ratio(counts.rejections, decisions),
    imagesWithMultipleRejections,
    unstructuredRejectReasons,
    topRejectReasons: topRejectReasons(rejectReasonCounts),
  };
}

function normalizeReviewAction(action) {
  const value = String(action || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (value === "approved") return "approve";
  if (value === "rejected") return "reject";
  if (value === "rework_started") return "rework";
  if (value === "revision_started") return "revision_start";
  return value;
}

function ratio(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100) / 100;
}

function topRejectReasons(reasonCounts) {
  return [...reasonCounts.entries()]
    .map(([reasonCode, count]) => ({
      reasonCode,
      reason_code: reasonCode,
      reasonLabel: rejectionReasonCodeLabel(reasonCode),
      reason_label: rejectionReasonCodeLabel(reasonCode),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.reasonCode.localeCompare(right.reasonCode));
}

function recentActivity(images) {
  return images
    .flatMap((image) => {
      const events = Array.isArray(image.review_events) ? image.review_events : [];
      return events.map((event) => ({
        ...reviewReasonFields(event),
        imageId: image.id || "",
        image_id: image.id || "",
        imageName: image.original_file_name || image.file_name || image.id || "",
        image_name: image.original_file_name || image.file_name || image.id || "",
        action: event.action || event.type || event.status || "",
        actor: event.actor_id || event.reviewer_id || event.worker_id || event.created_by || "",
        reason: event.reason || event.reject_reason || "",
        createdAt: event.created_at || event.createdAt || "",
        created_at: event.created_at || event.createdAt || "",
      }));
    })
    .filter((event) => event.action)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, 12);
}

function reviewReasonFields(event) {
  const reasonCode = normalizeRejectReasonCode(event.reason_code || event.reasonCode, event.reason || event.reject_reason);
  const reasonLabel = rejectionReasonCodeLabel(reasonCode);
  return {
    reasonCode,
    reason_code: reasonCode,
    reasonLabel,
    reason_label: reasonLabel,
  };
}
