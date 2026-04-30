import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardSummary } from "../src/dashboard/summary.js";

test("creates dashboard totals, workload, readiness, and activity from manifest state", () => {
  const summary = createDashboardSummary({
    manifest: {
      project_id: "project-1",
      name: "Project 1",
      images: [
        {
          id: "image-1",
          project_id: "project-1",
          original_file_name: "submitted.png",
          image_path: "images/submitted.png",
          current_mask_path: "masks/submitted_mask.png",
          width: 10,
          height: 10,
          mask_width: 10,
          mask_height: 10,
          mask_values_valid: true,
          status: "submitted",
          worker_id: "worker-a",
          reviewer_id: "reviewer-a",
          review_events: [{ action: "submitted", worker_id: "worker-a", created_at: "2026-04-30T01:00:00.000Z" }],
        },
        {
          id: "image-2",
          project_id: "project-1",
          original_file_name: "approved.png",
          image_path: "images/approved.png",
          current_mask_path: "masks/approved_mask.png",
          width: 10,
          height: 10,
          mask_width: 10,
          mask_height: 10,
          mask_values_valid: true,
          status: "approved",
          worker_id: "worker-a",
          reviewer_id: "reviewer-a",
          review_events: [{ action: "approved", reviewer_id: "reviewer-a", created_at: "2026-04-30T02:00:00.000Z" }],
        },
        {
          id: "image-3",
          project_id: "project-1",
          original_file_name: "rejected.png",
          image_path: "images/rejected.png",
          width: 10,
          height: 10,
          status: "rejected",
          worker_id: "worker-b",
          reviewer_id: "reviewer-a",
        },
        {
          id: "deleted",
          project_id: "project-1",
          status: "approved",
          deleted_at: "2026-04-30T00:00:00.000Z",
        },
      ],
    },
  });

  assert.equal(summary.projectId, "project-1");
  assert.deepEqual(summary.totals, {
    total: 3,
    inProgress: 0,
    submitted: 1,
    approved: 1,
    rejected: 1,
    exportReady: 2,
    blocked: 2,
  });
  assert.deepEqual(summary.exportReadiness.defaultPolicy, { total: 3, included: 2, excluded: 1 });
  assert.deepEqual(summary.exportReadiness.approvedOnlyPolicy, { total: 3, included: 1, excluded: 2 });
  assert.equal(summary.exportReadiness.topExclusionReasons[0].reason, "missing_mask");
  assert.equal(summary.workload.find((row) => row.userId === "worker-a").assigned, 2);
  assert.equal(summary.workload.find((row) => row.userId === "reviewer-a").awaitingReview, 1);
  assert.deepEqual(summary.reviewQuality, {
    totalEvents: 2,
    approvals: 1,
    rejections: 0,
    reworks: 0,
    revisionsStarted: 0,
    currentRejected: 1,
    currentApproved: 1,
    approvalRate: 1,
    rejectionRate: 0,
    imagesWithMultipleRejections: 0,
    unstructuredRejectReasons: 0,
    topRejectReasons: [],
  });
  assert.equal(summary.recentActivity[0].action, "approved");
  assert.equal(summary.blockers.some((item) => item.type === "rejected_rework"), true);
});

test("reports submitted images without reviewer and server sync blockers", () => {
  const summary = createDashboardSummary({
    manifest: {
      project_id: "project-2",
      images: [
        {
          id: "image-1",
          project_id: "project-2",
          original_file_name: "local-only.png",
          object_url: "blob:local",
          mask_data_url: "data:image/png;base64,AAAA",
          width: 10,
          height: 10,
          status: "submitted",
          worker_id: "worker-a",
        },
      ],
    },
  });

  assert.equal(summary.totals.blocked, 2);
  assert.equal(summary.exportReadiness.syncBlockers.length, 1);
  assert.equal(summary.blockers.some((item) => item.type === "unassigned_reviewer"), true);
  assert.equal(summary.blockers.some((item) => item.type === "export_sync"), true);
});

test("summarizes review quality metrics from structured and legacy rejection events", () => {
  const summary = createDashboardSummary({
    manifest: {
      project_id: "project-quality",
      images: [
        {
          id: "image-1",
          project_id: "project-quality",
          original_file_name: "edge-leak.png",
          status: "rejected",
          reviewer_id: "reviewer-a",
          review_events: [
            {
              action: "reject",
              reviewer_id: "reviewer-a",
              reason_code: "edge-leak",
              reason: "Mask leaks outside the part",
              created_at: "2026-04-30T01:00:00.000Z",
            },
            {
              action: "rework",
              reviewer_id: "worker-a",
              created_at: "2026-04-30T02:00:00.000Z",
            },
            {
              action: "reject",
              reviewer_id: "reviewer-a",
              reason: "outside edge still leaking",
              created_at: "2026-04-30T03:00:00.000Z",
            },
          ],
        },
        {
          id: "image-2",
          project_id: "project-quality",
          original_file_name: "approved.png",
          status: "approved",
          reviewer_id: "reviewer-a",
          review_events: [
            {
              action: "approve",
              reviewer_id: "reviewer-a",
              created_at: "2026-04-30T04:00:00.000Z",
            },
            {
              action: "revision_start",
              worker_id: "worker-b",
              created_at: "2026-04-30T05:00:00.000Z",
            },
          ],
        },
        {
          id: "image-3",
          project_id: "project-quality",
          original_file_name: "unstructured.png",
          status: "submitted",
          reviewer_id: "reviewer-b",
          review_events: [
            {
              action: "reject",
              reviewer_id: "reviewer-b",
              reason: "domain specific issue",
              created_at: "2026-04-30T06:00:00.000Z",
            },
          ],
        },
      ],
    },
  });

  assert.equal(summary.reviewQuality.totalEvents, 6);
  assert.equal(summary.reviewQuality.approvals, 1);
  assert.equal(summary.reviewQuality.rejections, 3);
  assert.equal(summary.reviewQuality.reworks, 1);
  assert.equal(summary.reviewQuality.revisionsStarted, 1);
  assert.equal(summary.reviewQuality.currentRejected, 1);
  assert.equal(summary.reviewQuality.currentApproved, 1);
  assert.equal(summary.reviewQuality.approvalRate, 0.25);
  assert.equal(summary.reviewQuality.rejectionRate, 0.75);
  assert.equal(summary.reviewQuality.imagesWithMultipleRejections, 1);
  assert.equal(summary.reviewQuality.unstructuredRejectReasons, 1);
  assert.deepEqual(summary.reviewQuality.topRejectReasons, [
    {
      reasonCode: "edge_leak",
      reason_code: "edge_leak",
      reasonLabel: "마스크가 대상 밖으로 새어 나감",
      reason_label: "마스크가 대상 밖으로 새어 나감",
      count: 2,
    },
    {
      reasonCode: "other",
      reason_code: "other",
      reasonLabel: "기타 품질 이슈",
      reason_label: "기타 품질 이슈",
      count: 1,
    },
  ]);
  assert.equal(summary.recentActivity[0].reasonCode, "other");
  assert.equal(summary.recentActivity[0].reasonLabel, "기타 품질 이슈");
});
