import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { createApiRouter } from "../src/server/api.js";
import { createMinimalPngHeader } from "../src/server/maskValidation.js";

const VALID_MASK_DATA_URL = toPngDataUrl(createGrayscalePng({ width: 2, height: 2, pixels: [0, 255, 0, 0] }));
const DIMENSION_MISMATCH_DATA_URL = toPngDataUrl(createGrayscalePng({ width: 3, height: 2, pixels: [0, 255, 0, 0, 0, 0] }));
const RGB_MASK_DATA_URL = toPngDataUrl(createMinimalPngHeader({ width: 2, height: 2, bitDepth: 8, colorType: 6 }));
const INVALID_PNG_DATA_URL = `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`;
const VALID_IMAGE_DATA_URL = toPngDataUrl(createMinimalPngHeader({ width: 2, height: 2, bitDepth: 8, colorType: 6 }));

test("valid image upload writes file and appends manifest image", async () => {
  const { route, storage } = createApiHarness();

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 2,
    height: 2,
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.id, "image-1");
  assert.equal(response.body.image_path, "images/image-1_frame.png");
  assert.equal(storage.imageWrites.length, 1);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images.length, 1);
  assert.equal(manifest.images[0].original_file_name, "frame.png");
});

test("image upload uses server-extracted dimensions and rejects mismatches", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 999,
    height: 2,
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "image_dimension_mismatch");
  assert.deepEqual(response.body.validation.server, { width: 2, height: 2 });
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
  assert.equal(storage.imageWrites.length, 0);
});

test("unsupported image upload returns 400 before mutating manifest", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "notes.txt",
    data_url: `data:text/plain;base64,${Buffer.from("not an image").toString("base64")}`,
    width: 2,
    height: 2,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "image_upload_validation_failed");
  assert.deepEqual(response.body.validation.reasons, ["unsupported_mime_type", "unsupported_extension"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
  assert.equal(storage.imageWrites.length, 0);
});

test("oversized image upload returns 413 before mutating manifest", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  const before = await storage.readProjectManifest("project-1");
  const oversizedDataUrl = `data:image/png;base64,${Buffer.alloc((15 * 1024 * 1024) + 1).toString("base64")}`;

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "large.png",
    data_url: oversizedDataUrl,
    width: 2,
    height: 2,
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.body.error, "image_upload_validation_failed");
  assert.deepEqual(response.body.validation.reasons, ["file_too_large"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
  assert.equal(storage.imageWrites.length, 0);
});

test("review approve updates only submitted images", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    status: "submitted",
    current_mask_path: "masks/image-1_mask.png",
  });

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "approve",
    reviewer_id: "reviewer-1",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.status, "approved");
  assert.equal(response.body.image.reviewer_id, "reviewer-1");
  assert.ok(response.body.image.approved_at);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].status, "approved");
  assert.equal(manifest.images[0].review_events.length, 1);
  assert.equal(manifest.images[0].review_events[0].action, "approve");
});

test("review reject requires reason and leaves manifest unchanged", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", { ...baseImage(), status: "submitted" });
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "reject",
    reviewer_id: "reviewer-1",
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "review_transition_failed");
  assert.deepEqual(response.body.validation.reasons, ["missing_rejection_reason"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
});

test("review action requires reviewer identity and leaves manifest unchanged", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", { ...baseImage(), status: "submitted" });
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "approve",
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "review_transition_failed");
  assert.deepEqual(response.body.validation.reasons, ["missing_reviewer_id"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
});

test("review rework moves rejected image back to in progress", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    status: "rejected",
    reject_reason: "Needs tighter edge",
  });

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "rework",
    reviewer_id: "reviewer-1",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.status, "in_progress");
  assert.ok(response.body.image.rework_started_at);
});

test("valid mask save updates current mask and submitted status without claiming pixel validation", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    id: "image-1",
    project_id: "project-1",
    original_file_name: "frame.png",
    image_path: "images/image-1.png",
    current_mask_path: "",
    width: 2,
    height: 2,
    status: "in_progress",
    mask_values_valid: null,
  });

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: VALID_MASK_DATA_URL,
    status: "submitted",
    mask_ratio: 0.5,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.current_mask_path, "masks/image-1_mask.png");
  assert.equal(response.body.image.status, "submitted");
  assert.equal(response.body.image.mask_values_valid, true);
  assert.equal(response.body.image.mask_pixel_validation, "passed");
  assert.equal(response.body.validation.status, "valid");

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].current_mask_path, "masks/image-1_mask.png");
  assert.equal(manifest.images[0].status, "submitted");
  assert.equal(manifest.images[0].mask_values_valid, true);
  assert.equal(storage.maskWrites.length, 1);
});

test("invalid mask validation does not write a rejected mask file", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: toPngDataUrl(createGrayscalePng({ width: 2, height: 2, pixels: [0, 128, 0, 0] })),
    status: "submitted",
  });

  assert.equal(response.statusCode, 422);
  assert.equal(storage.maskWrites.length, 0);
});

test("invalid PNG mask returns 400 and leaves manifest unchanged", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: INVALID_PNG_DATA_URL,
    status: "submitted",
    mask_ratio: 0.5,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "mask_validation_failed");
  assert.deepEqual(response.body.validation.reasons, ["invalid_png_signature"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
});

test("dimension mismatch returns 422 and does not submit the image", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: DIMENSION_MISMATCH_DATA_URL,
    status: "submitted",
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "mask_validation_failed");
  assert.deepEqual(response.body.validation.reasons, ["mask_dimension_mismatch"]);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].current_mask_path, "");
  assert.equal(manifest.images[0].status, "in_progress");
});

test("unsupported PNG mask format returns 422 and leaves previous mask intact", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    current_mask_path: "masks/existing_mask.png",
    status: "in_progress",
    mask_width: 2,
    mask_height: 2,
    mask_values_valid: null,
  });

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: RGB_MASK_DATA_URL,
    status: "submitted",
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.body.validation.reasons, ["mask_not_8bit_grayscale"]);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].current_mask_path, "masks/existing_mask.png");
  assert.equal(manifest.images[0].status, "in_progress");
});

test("project export writes files only for the same images included in annotations", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "submitted-1",
    original_file_name: "submitted.png",
    image_path: "images/submitted_source.png",
    current_mask_path: "masks/submitted_source_mask.png",
    status: "submitted",
  });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "draft-1",
    original_file_name: "draft.png",
    image_path: "images/draft_source.png",
    current_mask_path: "masks/draft_source_mask.png",
    status: "in_progress",
  });
  storage.files.set("project-1/images/submitted_source.png", "submitted-image");
  storage.files.set("project-1/masks/submitted_source_mask.png", "submitted-mask");
  storage.files.set("project-1/images/draft_source.png", "draft-image");
  storage.files.set("project-1/masks/draft_source_mask.png", "draft-mask");

  const response = await callRoute(route, "GET", "/api/projects/project-1/export");

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/zip");
  assert.match(response.text, /annotations\.json/);
  assert.match(response.text, /export_summary\.json/);
  assert.match(response.text, /images\/submitted\.png/);
  assert.match(response.text, /masks\/submitted_mask\.png/);
  assert.doesNotMatch(response.text, /images\/draft\.png/);
  assert.doesNotMatch(response.text, /masks\/draft_mask\.png/);
  assert.doesNotMatch(response.text, /draft-image/);
  assert.match(response.text, /status_not_exportable/);
});

test("project export approved-only query excludes submitted images", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "submitted-1",
    original_file_name: "submitted.png",
    image_path: "images/submitted_source.png",
    current_mask_path: "masks/submitted_source_mask.png",
    status: "submitted",
  });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "approved-1",
    original_file_name: "approved.png",
    image_path: "images/approved_source.png",
    current_mask_path: "masks/approved_source_mask.png",
    status: "approved",
    review_events: [{ action: "approve" }],
  });
  storage.files.set("project-1/images/submitted_source.png", "submitted-image");
  storage.files.set("project-1/masks/submitted_source_mask.png", "submitted-mask");
  storage.files.set("project-1/images/approved_source.png", "approved-image");
  storage.files.set("project-1/masks/approved_source_mask.png", "approved-mask");

  const response = await callRoute(route, "GET", "/api/projects/project-1/export?approved_only=1");

  assert.equal(response.statusCode, 200);
  assert.match(response.text, /images\/approved\.png/);
  assert.match(response.text, /masks\/approved_mask\.png/);
  assert.match(response.text, /not_approved/);
  assert.match(response.text, /review_events/);
  assert.doesNotMatch(response.text, /images\/submitted\.png/);
  assert.doesNotMatch(response.text, /submitted-image/);
});

test("lists project summaries ordered by update time", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-old", { name: "Old Project" });
  await storage.addImage("project-old", { ...baseImage(), id: "old-submitted", status: "submitted" });
  await storage.writeProjectManifest("project-old", {
    ...(await storage.readProjectManifest("project-old")),
    updated_at: "2026-04-29T00:00:00.000Z",
  });
  await storage.ensureProject("project-new", { name: "New Project" });
  await storage.addImage("project-new", { ...baseImage(), id: "new-approved", status: "approved" });
  await storage.writeProjectManifest("project-new", {
    ...(await storage.readProjectManifest("project-new")),
    updated_at: "2026-04-29T01:00:00.000Z",
  });

  const response = await callJson(route, "GET", "/api/projects");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.total_projects, 2);
  assert.deepEqual(response.body.projects.map((project) => project.project_id), ["project-new", "project-old"]);
  assert.equal(response.body.projects[0].approved_images, 1);
  assert.equal(response.body.projects[1].submitted_images, 1);
});

function createApiHarness() {
  const storage = createMemoryStorage();
  return {
    storage,
    route: createApiRouter({ storage }),
  };
}

function createMemoryStorage() {
  const manifests = new Map();
  const imageWrites = [];
  const maskWrites = [];
  const files = new Map();

  return {
    files,
    imageWrites,
    maskWrites,
    async ensureProject(projectId, input = {}) {
      if (!manifests.has(projectId)) {
        manifests.set(projectId, {
          project_id: projectId,
          name: input.name || projectId,
          images: [],
          created_at: "2026-04-29T00:00:00.000Z",
          updated_at: "2026-04-29T00:00:00.000Z",
        });
      }
      return clone(manifests.get(projectId));
    },
    async addImage(projectId, image) {
      const manifest = manifests.get(projectId);
      manifest.images = [...manifest.images.filter((item) => item.id !== image.id), clone(image)];
    },
    async readProjectManifest(projectId) {
      return manifests.has(projectId) ? clone(manifests.get(projectId)) : null;
    },
    async writeProjectManifest(projectId, manifest) {
      manifests.set(projectId, clone(manifest));
      return clone(manifest);
    },
    async listProjects() {
      return [...manifests.values()].map((manifest) => {
        const images = manifest.images || [];
        return {
          project_id: manifest.project_id,
          name: manifest.name,
          created_at: manifest.created_at,
          updated_at: manifest.updated_at,
          total_images: images.length,
          submitted_images: images.filter((image) => image.status === "submitted").length,
          approved_images: images.filter((image) => image.status === "approved").length,
          rejected_images: images.filter((image) => image.status === "rejected").length,
        };
      }).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    },
    async writeImageFromDataUrl(projectId, imageId, fileName, dataUrl) {
      const buffer = Buffer.from(String(dataUrl).split(",")[1] || "", "base64");
      const safeFileName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
      const relativePath = `images/${imageId}_${safeFileName}`;
      imageWrites.push({ projectId, imageId, fileName, relativePath, buffer });
      files.set(`${projectId}/${relativePath}`, buffer);
      return {
        buffer,
        relativePath,
        archivePath: relativePath,
        mimeType: String(dataUrl).slice(5, String(dataUrl).indexOf(";")),
        size: buffer.length,
      };
    },
    async writeMaskFromDataUrl(projectId, imageId, dataUrl) {
      const buffer = Buffer.from(String(dataUrl).split(",")[1] || "", "base64");
      return this.writeMaskBuffer(projectId, imageId, buffer);
    },
    decodeMaskDataUrl(dataUrl) {
      return {
        buffer: Buffer.from(String(dataUrl).split(",")[1] || "", "base64"),
        mimeType: "image/png",
      };
    },
    async writeMaskBuffer(projectId, imageId, buffer) {
      const relativePath = `masks/${imageId}_mask.png`;
      maskWrites.push({ projectId, imageId, relativePath, buffer });
      return {
        buffer,
        relativePath,
        archivePath: relativePath,
        mimeType: "image/png",
        size: buffer.length,
      };
    },
    async readProjectFile(projectId, relativePath) {
      const key = `${projectId}/${relativePath}`;
      if (!files.has(key)) {
        throw new Error(`Missing test file: ${key}`);
      }
      return Buffer.from(files.get(key));
    },
  };
}

async function callJson(route, method, pathname, body) {
  const response = await callRoute(route, method, pathname, body);
  return {
    ...response,
    body: response.text ? JSON.parse(response.text) : null,
  };
}

async function callRoute(route, method, pathname, body) {
  const request = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
  request.method = method;
  request.headers = { host: "localhost:4173" };
  request.url = pathname;

  const response = createMemoryResponse();
  await route(request, response, new URL(pathname, "http://localhost:4173"));
  return response.result();
}

function createMemoryResponse() {
  const chunks = [];
  let statusCode = 0;
  let headers = {};

  return {
    writeHead(nextStatusCode, nextHeaders = {}) {
      statusCode = nextStatusCode;
      headers = nextHeaders;
    },
    end(chunk = "") {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    },
    result() {
      const buffer = Buffer.concat(chunks);
      const text = buffer.toString("utf8");
      return {
        statusCode,
        headers,
        buffer,
        text,
      };
    },
  };
}

function baseImage() {
  return {
    id: "image-1",
    project_id: "project-1",
    original_file_name: "frame.png",
    image_path: "images/image-1.png",
    current_mask_path: "",
    width: 2,
    height: 2,
    status: "in_progress",
    mask_width: 2,
    mask_height: 2,
    mask_values_valid: null,
  };
}

function toPngDataUrl(buffer) {
  return `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
}

function createGrayscalePng({ width, height, pixels }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(0, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const rows = [];
  for (let row = 0; row < height; row += 1) {
    rows.push(Buffer.from([0, ...pixels.slice(row * width, (row + 1) * width)]));
  }

  return Buffer.concat([
    signature,
    createPngChunk("IHDR", ihdrData),
    createPngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createPngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(0, 8 + data.length);
  return chunk;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
