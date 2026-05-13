import assert from "node:assert/strict";
import test from "node:test";

import {
  EXCLUSION_REASONS,
  MASK_CONTRACT,
  buildAnnotations,
  createAnnotationsJson,
  createExportImageFileName,
  createExportMaskFileName,
  createExportSummaryJson,
  createImageRecord,
  createJsonBlob,
  createProjectRecord,
  createValidationSummary,
  downloadBlobFile,
  serializeJson,
  validateImageForExport,
} from "../src/export/exporter.js";

const NOW = "2026-04-29T00:00:00.000Z";

test("creates normalized project and image records", () => {
  const project = createProjectRecord({ id: " project-1 ", name: " Rail Masks " }, { now: NOW });
  const image = createImageRecord(
    {
      id: " image-1 ",
      projectId: "project-1",
      originalFileName: "raw image.png",
      imagePath: "/storage/project-1/images/image-1.png",
      maskPath: "/storage/project-1/masks/current/image-1_mask.png",
      width: "640",
      height: 480,
      maskWidth: 640,
      maskHeight: "480",
      status: "submitted",
    },
    { now: NOW },
  );

  assert.deepEqual(project, {
    id: "project-1",
    name: "Rail Masks",
    description: "",
    created_at: NOW,
    updated_at: NOW,
  });
  assert.equal(image.id, "image-1");
  assert.equal(image.project_id, "project-1");
  assert.equal(image.original_file_name, "raw image.png");
  assert.equal(image.current_mask_path, "/storage/project-1/masks/current/image-1_mask.png");
  assert.equal(image.width, 640);
  assert.equal(image.height, 480);
  assert.equal(image.mask_width, 640);
  assert.equal(image.mask_height, 480);
});

test("summarizes valid exports and exclusion reasons", () => {
  const project = createProjectRecord({ id: "project-1", name: "Rail Masks" }, { now: NOW });
  const valid = createImageRecord(
    {
      id: "image-1",
      projectId: "project-1",
      originalFileName: "image 0001.png",
      imagePath: "/absolute/storage/images/image-1.png",
      maskPath: "/absolute/storage/masks/image-1_mask.png",
      width: 640,
      height: 480,
      maskWidth: 640,
      maskHeight: 480,
      maskValuesValid: true,
      status: "submitted",
    },
    { now: NOW },
  );
  const missingMask = createImageRecord(
    {
      id: "image-2",
      projectId: "project-1",
      originalFileName: "image-2.png",
      imagePath: "/absolute/storage/images/image-2.png",
      width: 320,
      height: 240,
      status: "submitted",
    },
    { now: NOW },
  );
  const draft = createImageRecord(
    {
      id: "image-3",
      projectId: "project-1",
      originalFileName: "image-3.png",
      imagePath: "/absolute/storage/images/image-3.png",
      maskPath: "/absolute/storage/masks/image-3_mask.png",
      width: 320,
      height: 240,
      status: "not_started",
    },
    { now: NOW },
  );
  const mismatched = createImageRecord(
    {
      id: "image-4",
      projectId: "project-1",
      originalFileName: "image-4.png",
      imagePath: "/absolute/storage/images/image-4.png",
      maskPath: "/absolute/storage/masks/image-4_mask.png",
      width: 320,
      height: 240,
      maskWidth: 300,
      maskHeight: 240,
      maskValuesValid: false,
      status: "submitted",
    },
    { now: NOW },
  );

  const summary = createValidationSummary(project, [valid, missingMask, draft, mismatched], { now: NOW });

  assert.equal(summary.total_images, 4);
  assert.equal(summary.exportable_images, 1);
  assert.equal(summary.excluded_images, 3);
  assert.equal(summary.items[0].image_path, "images/image_0001.png");
  assert.equal(summary.items[0].mask_path, "masks/image_0001_mask.png");
  assert.deepEqual(summary.items[1].reasons, [EXCLUSION_REASONS.MISSING_MASK]);
  assert.deepEqual(summary.items[2].reasons, [EXCLUSION_REASONS.STATUS_NOT_EXPORTABLE]);
  assert.deepEqual(summary.items[3].reasons, [
    EXCLUSION_REASONS.MASK_DIMENSION_MISMATCH,
    EXCLUSION_REASONS.INVALID_MASK_VALUES,
  ]);
});

test("deleted images are excluded from export validation and metadata by default", () => {
  const project = createProjectRecord({ id: "project-1", name: "Rail Masks" }, { now: NOW });
  const active = createImageRecord(
    {
      id: "image-1",
      projectId: "project-1",
      originalFileName: "active.png",
      imagePath: "/server/active.png",
      maskPath: "/server/active_mask.png",
      width: 10,
      height: 10,
      status: "submitted",
    },
    { now: NOW },
  );
  const deleted = createImageRecord(
    {
      id: "image-2",
      projectId: "project-1",
      originalFileName: "deleted.png",
      imagePath: "/server/deleted.png",
      maskPath: "/server/deleted_mask.png",
      width: 10,
      height: 10,
      status: "submitted",
      deletedAt: "2026-04-30T00:00:00.000Z",
      deletedBy: "worker",
      deleteReason: "wrong frame",
    },
    { now: NOW },
  );

  const validation = createValidationSummary(project, [active, deleted], { now: NOW });
  const annotations = createAnnotationsJson(project, [active, deleted], { now: NOW });
  const exportSummary = createExportSummaryJson(project, [active, deleted], { now: NOW, validationSummary: validation });

  assert.equal(deleted.deleted_at, "2026-04-30T00:00:00.000Z");
  assert.equal(validation.total_images, 1);
  assert.equal(validation.exportable_images, 1);
  assert.deepEqual(validation.items.map((item) => item.image_id), ["image-1"]);
  assert.deepEqual(annotations.annotations.map((item) => item.image_id), ["image-1"]);
  assert.equal(exportSummary.total_images, 1);
  assert.equal(exportSummary.exported_images, 1);
  assert.deepEqual(exportSummary.validation_errors, []);
});

test("creates annotations.json with archive-relative paths only", () => {
  const project = createProjectRecord({ id: "project-1", name: "Rail Masks" }, { now: NOW });
  const images = [
    createImageRecord(
      {
        id: "image-1",
        originalFileName: "nested/source/image 0001.png",
        imagePath: "/server/storage/projects/project-1/images/image-1.png",
        maskPath: "/server/storage/projects/project-1/masks/current/image-1_mask.png",
        width: 640,
        height: 480,
        maskWidth: 640,
        maskHeight: 480,
        status: "submitted",
        submittedAt: NOW,
      },
      { now: NOW },
    ),
  ];

  const annotations = createAnnotationsJson(project, images, { now: NOW });

  assert.equal(annotations.version, 1);
  assert.equal(annotations.generated_at, NOW);
  assert.deepEqual(annotations.mask_contract, MASK_CONTRACT);
  assert.deepEqual(annotations.annotations, [
    {
      image_id: "image-1",
      original_file_name: "nested/source/image 0001.png",
      image_path: "images/image_0001.png",
      mask_path: "masks/image_0001_mask.png",
      width: 640,
      height: 480,
      status: "submitted",
      submitted_at: NOW,
    },
  ]);
});

test("creates class-aware annotations metadata from image annotation records", () => {
  const project = createProjectRecord({ id: "project-1", name: "Rail Masks" }, { now: NOW });
  const image = createImageRecord(
    {
      id: "image-1",
      originalFileName: "frame.png",
      imagePath: "images/image-1.png",
      maskPath: "masks/image-1_class_2_scratch_mask.png",
      width: 640,
      height: 480,
      maskWidth: 640,
      maskHeight: 480,
      status: "submitted",
      submittedAt: NOW,
      annotations: [
        {
          annotation_id: "ann_image-1_class_1",
          class_id: 1,
          class_name: "crack",
          mask_path: "masks/image-1_class_1_crack_mask.png",
          mask_width: 640,
          mask_height: 480,
          mask_ratio: 0.2,
        },
        {
          annotation_id: "ann_image-1_class_2",
          class_id: 2,
          class_name: "scratch",
          mask_path: "masks/image-1_class_2_scratch_mask.png",
          mask_width: 640,
          mask_height: 480,
          mask_ratio: 0.1,
        },
      ],
    },
    { now: NOW },
  );

  const annotations = createAnnotationsJson(project, [image], { now: NOW });

  assert.deepEqual(annotations.annotations.map((item) => `${item.image_id}:${item.class_id}:${item.class_name}`), [
    "image-1:1:crack",
    "image-1:2:scratch",
  ]);
  assert.equal(annotations.annotations[0].mask_path, "masks/image-1_class_1_crack_mask.png");
  assert.equal(annotations.annotations[0].source_mask_path, "masks/image-1_class_1_crack_mask.png");
  assert.equal(annotations.annotations[1].mask_ratio, 0.1);
});

test("browser export annotations preserve class-aware image annotations", () => {
  const annotations = buildAnnotations({
    projectId: "project-1",
    images: [{
      id: "image-1",
      project_id: "project-1",
      original_file_name: "frame.png",
      image_path: "images/frame.png",
      width: 640,
      height: 480,
      status: "submitted",
      annotations: [{
        annotation_id: "ann_image-1_class_2",
        class_id: 2,
        class_name: "scratch",
        mask_path: "masks/image-1_class_2_scratch_mask.png",
        mask_ratio: 0.1,
      }],
    }],
  });

  assert.equal(annotations.annotations.length, 1);
  assert.equal(annotations.annotations[0].class_id, 2);
  assert.equal(annotations.annotations[0].mask_path, "masks/image-1_class_2_scratch_mask.png");
});

test("treats class annotation mask paths as exportable mask sources", () => {
  const image = createImageRecord(
    {
      id: "image-1",
      projectId: "project-1",
      originalFileName: "frame.png",
      imagePath: "images/image-1.png",
      width: 640,
      height: 480,
      status: "submitted",
      annotations: [{
        annotation_id: "ann_image-1_class_1",
        class_id: 1,
        class_name: "crack",
        mask_path: "masks/image-1_class_1_crack_mask.png",
      }],
    },
    { now: NOW },
  );

  const validation = validateImageForExport(image, { requireProjectId: true });

  assert.equal(validation.valid, true);
  assert.equal(validation.checks.mask, true);
});

test("creates export_summary.json from the same validation decisions", () => {
  const project = createProjectRecord({ id: "project-1", name: "Rail Masks" }, { now: NOW });
  const images = [
    createImageRecord(
      {
        id: "image-1",
        originalFileName: "image-1.png",
        imagePath: "/server/image-1.png",
        maskPath: "/server/image-1_mask.png",
        width: 10,
        height: 10,
        status: "submitted",
      },
      { now: NOW },
    ),
    createImageRecord(
      {
        id: "image-2",
        originalFileName: "image-2.png",
        imagePath: "/server/image-2.png",
        width: 10,
        height: 10,
        status: "not_started",
      },
      { now: NOW },
    ),
  ];
  const validationSummary = createValidationSummary(project, images, { now: NOW });

  const exportSummary = createExportSummaryJson(project, images, { now: NOW, validationSummary });

  assert.equal(exportSummary.total_images, 2);
  assert.equal(exportSummary.exported_images, 1);
  assert.equal(exportSummary.excluded_images, 1);
  assert.deepEqual(exportSummary.export_policy.archive_files, {
    annotations: "annotations.json",
    summary: "export_summary.json",
  });
  assert.deepEqual(exportSummary.validation_errors, [
    {
      image_id: "image-2",
      reasons: [EXCLUSION_REASONS.STATUS_NOT_EXPORTABLE, EXCLUSION_REASONS.MISSING_MASK],
    },
  ]);
});

test("approved-only export policy excludes submitted images and reports review event count", () => {
  const project = createProjectRecord({ id: "project-1", name: "Rail Masks" }, { now: NOW });
  const submitted = createImageRecord(
    {
      id: "image-1",
      originalFileName: "submitted.png",
      imagePath: "/server/submitted.png",
      maskPath: "/server/submitted_mask.png",
      width: 10,
      height: 10,
      maskWidth: 10,
      maskHeight: 10,
      status: "submitted",
      reviewEvents: [{ action: "submit" }],
    },
    { now: NOW },
  );
  const approved = createImageRecord(
    {
      id: "image-2",
      originalFileName: "approved.png",
      imagePath: "/server/approved.png",
      maskPath: "/server/approved_mask.png",
      width: 10,
      height: 10,
      maskWidth: 10,
      maskHeight: 10,
      status: "approved",
      reviewEvents: [{ action: "approve" }],
    },
    { now: NOW },
  );

  const summary = createValidationSummary(project, [submitted, approved], { now: NOW, approvedOnly: true });
  const exportSummary = createExportSummaryJson(project, [submitted, approved], {
    now: NOW,
    approvedOnly: true,
    validationSummary: summary,
  });
  const annotations = createAnnotationsJson(project, [submitted, approved], { now: NOW, approvedOnly: true });

  assert.equal(summary.exportable_images, 1);
  assert.deepEqual(summary.items[0].reasons, [EXCLUSION_REASONS.NOT_APPROVED]);
  assert.equal(exportSummary.export_policy.approved_only, true);
  assert.deepEqual(exportSummary.export_policy.statuses, ["approved"]);
  assert.equal(exportSummary.review_events, 2);
  assert.deepEqual(annotations.annotations.map((item) => item.image_id), ["image-2"]);
});

test("serializes JSON files with stable pretty formatting", () => {
  assert.equal(serializeJson({ a: 1 }), "{\n  \"a\": 1\n}\n");
});

test("creates sanitized export image and mask file names", () => {
  assert.equal(createExportImageFileName({ original_file_name: "../raw/image 1.jpeg" }), "image_1.jpeg");
  assert.equal(createExportMaskFileName({ export_mask_file_name: "custom mask.png" }), "custom_mask.png");
  assert.equal(createExportMaskFileName({}, "image_1.jpeg"), "image_1_mask.png");
});

test("creates JSON blobs and per-file downloads with URL cleanup", async () => {
  const blob = createJsonBlob({ ok: true });
  assert.equal(blob.type, "application/json;charset=utf-8");
  assert.equal(await blob.text(), "{\n  \"ok\": true\n}\n");

  const calls = [];
  const link = {
    parentNode: null,
    click() {
      calls.push("click");
    },
  };
  const document = {
    body: {
      appendChild(node) {
        node.parentNode = this;
        calls.push("append");
      },
      removeChild(node) {
        node.parentNode = null;
        calls.push("remove");
      },
    },
    createElement(tagName) {
      assert.equal(tagName, "a");
      return link;
    },
  };
  const URL = {
    createObjectURL(value) {
      assert.equal(value, blob);
      calls.push("create-url");
      return "blob:export";
    },
    revokeObjectURL(value) {
      assert.equal(value, "blob:export");
      calls.push("revoke-url");
    },
  };

  const result = downloadBlobFile("../export summary.json", blob, { document, URL });

  assert.deepEqual(result, {
    file_name: "export_summary.json",
    object_url: "blob:export",
  });
  assert.equal(link.href, "blob:export");
  assert.equal(link.download, "export_summary.json");
  assert.deepEqual(calls, ["create-url", "append", "click", "remove", "revoke-url"]);
});
