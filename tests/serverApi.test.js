import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { createApiRouter } from "../src/server/api.js";
import { createMinimalPngHeader } from "../src/server/maskValidation.js";
import { createUserDirectory } from "../src/server/userDirectory.js";

const VALID_MASK_DATA_URL = toPngDataUrl(createGrayscalePng({ width: 2, height: 2, pixels: [0, 255, 0, 0] }));
const DIMENSION_MISMATCH_DATA_URL = toPngDataUrl(createGrayscalePng({ width: 3, height: 2, pixels: [0, 255, 0, 0, 0, 0] }));
const RGB_MASK_DATA_URL = toPngDataUrl(createMinimalPngHeader({ width: 2, height: 2, bitDepth: 8, colorType: 6 }));
const INVALID_PNG_DATA_URL = `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`;
const VALID_IMAGE_DATA_URL = toPngDataUrl(createMinimalPngHeader({ width: 2, height: 2, bitDepth: 8, colorType: 6 }));

test("session login returns a bearer token that authorizes protected actions", async () => {
  const { route, storage } = createApiHarness();
  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: "worker",
    password: "worker123",
  }, {});

  assert.equal(login.statusCode, 201);
  assert.match(login.body.session.token, /^sess_/);
  await storage.ensureProject("project-1", { name: "Project 1" });

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 2,
    height: 2,
  }, { authorization: `Bearer ${login.body.session.token}` });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.worker_id, "worker");
  assert.equal(storage.imageWrites.length, 1);
});

test("session login validates password and uses server-owned role", async () => {
  const { route } = createApiHarness();

  const rejected = await callJson(route, "POST", "/api/session/login", {
    user_id: "admin",
    password: "wrong",
    role: "worker",
  }, {});
  assert.equal(rejected.statusCode, 401);
  assert.equal(rejected.body.error, "unauthorized");

  const accepted = await callJson(route, "POST", "/api/session/login", {
    user_id: "admin",
    password: "admin123",
    role: "worker",
  }, {});
  assert.equal(accepted.statusCode, 201);
  assert.equal(accepted.body.session.user_id, "admin");
  assert.equal(accepted.body.session.role, "admin");
  assert.match(accepted.body.session.token, /^sess_/);
});

test("protected actions reject requests without session or role headers", async () => {
  const { route } = createApiHarness();

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 2,
    height: 2,
  }, {});

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, "forbidden");
});

test("protected actions reject forged legacy role headers without bearer session", async () => {
  const { route } = createApiHarness();

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 2,
    height: 2,
  }, authHeaders("admin", "attacker"));

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, "forbidden");
});

test("project list and manifest endpoints require an authorized session", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });

  const rejectedList = await callJson(route, "GET", "/api/projects", null, {});
  assert.equal(rejectedList.statusCode, 403);

  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: "reviewer",
    password: "reviewer123",
  }, {});
  const headers = { authorization: `Bearer ${login.body.session.token}` };

  const list = await callJson(route, "GET", "/api/projects", null, headers);
  const manifest = await callJson(route, "GET", "/api/projects/project-1", null, headers);

  assert.equal(list.statusCode, 200);
  assert.equal(list.body.total_projects, 1);
  assert.equal(manifest.statusCode, 200);
  assert.equal(manifest.body.project_id, "project-1");
});

test("health exposes deployment profile and generic AI capabilities", async () => {
  const { route } = createApiHarness({
    deploymentProfile: {
      mode: "test",
      port: 4173,
      dataRoot: "/tmp/masking-test",
      publicRoot: "/repo",
      aiServing: {
        enabled: true,
        provider: "stub",
        tasks: ["detection", "segmentation"],
        maxImageBytes: 2048,
      },
    },
  });

  const health = await callJson(route, "GET", "/api/health");
  assert.equal(health.statusCode, 200);
  assert.equal(health.body.deployment.mode, "test");
  assert.equal(health.body.ai_serving.enabled, true);
  assert.deepEqual(health.body.ai_serving.tasks, ["detection", "segmentation"]);
});

test("admin previews and applies legacy manifest repair", async () => {
  const { route, storage } = createApiHarness();
  await storage.writeProjectManifest("legacy-project", {
    id: "legacy-project",
    images: [{ id: "image 1", fileName: "frame.png", maskRatio: 0.5 }],
  });
  const adminHeaders = await loginHeaders(route, "admin");
  const workerHeaders = await loginHeaders(route, "worker");

  const rejected = await callJson(route, "POST", "/api/projects/legacy-project/repair", {
    apply: true,
  }, workerHeaders);
  assert.equal(rejected.statusCode, 403);

  const preview = await callJson(route, "POST", "/api/projects/legacy-project/repair", {
    apply: false,
  }, adminHeaders);
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.body.repair.applied, false);
  assert.equal(preview.body.repair.manifest.images[0].id, "image_1");
  assert.equal((await storage.readProjectManifest("legacy-project")).images[0].id, "image 1");

  const applied = await callJson(route, "POST", "/api/projects/legacy-project/repair", {
    apply: true,
  }, adminHeaders);
  assert.equal(applied.statusCode, 200);
  assert.equal(applied.body.repair.applied, true);
  assert.equal((await storage.readProjectManifest("legacy-project")).images[0].id, "image_1");
});

test("generic AI serving contract is role protected and model agnostic", async () => {
  const { route } = createApiHarness({
    deploymentProfile: {
      mode: "test",
      aiServing: {
        enabled: true,
        provider: "stub",
        tasks: ["detection", "segmentation", "classification"],
        maxImageBytes: 1024,
      },
    },
  });
  const reviewerHeaders = await loginHeaders(route, "reviewer");

  const capabilities = await callJson(route, "GET", "/api/ai/capabilities", null, reviewerHeaders);
  assert.equal(capabilities.statusCode, 200);
  assert.deepEqual(capabilities.body.capabilities.tasks, ["detection", "segmentation", "classification"]);
  assert.equal(capabilities.body.capabilities.provider, "stub");
  assert.match(capabilities.body.capabilities.output_contracts.segmentation, /class_id/);
  assert.match(capabilities.body.capabilities.output_contracts.segmentation, /mask_data_url/);

  const response = await callJson(route, "POST", "/api/ai/infer", {
    task: "segmentation",
    image: {
      data_url: VALID_IMAGE_DATA_URL,
      width: 2,
      height: 2,
    },
  }, reviewerHeaders);
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.status, "accepted");
  assert.equal(response.body.task, "segmentation");
  assert.equal(response.body.provider, "stub");
  assert.deepEqual(response.body.predictions, []);
  assert.equal(response.body.model, null);
  assert.deepEqual(response.body.accepted_options.allowed_class_ids, []);
});

test("admin lists assignment users and role filters", async () => {
  const { route } = createApiHarness();
  const adminHeaders = await loginHeaders(route, "admin");
  const reviewerHeaders = await loginHeaders(route, "reviewer");

  const rejected = await callJson(route, "GET", "/api/users?role=worker", null, reviewerHeaders);
  assert.equal(rejected.statusCode, 403);

  const response = await callJson(route, "GET", "/api/users?role=worker", null, adminHeaders);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.users.map((user) => user.user_id), ["worker"]);
  assert.equal(response.body.users.some((user) => Object.hasOwn(user, "password")), false);
});

test("admin creates users through the API without exposing passwords", async () => {
  const directory = await createTempUserDirectory();
  const { route } = createApiHarness({ userDirectory: directory });
  const adminHeaders = await loginHeaders(route, "admin");
  const workerHeaders = await loginHeaders(route, "worker");

  const rejected = await callJson(route, "POST", "/api/users", {
    user_id: "worker-2",
    role: "worker",
    display_name: "Worker Two",
    password: "worker2-pass",
  }, workerHeaders);
  assert.equal(rejected.statusCode, 403);

  const created = await callJson(route, "POST", "/api/users", {
    user_id: "worker-2",
    role: "worker",
    display_name: "Worker Two",
    password: "worker2-pass",
  }, adminHeaders);

  assert.equal(created.statusCode, 201);
  assert.equal(created.body.user.user_id, "worker-2");
  assert.equal(created.body.user.role, "worker");
  assert.equal(created.body.user.active, true);
  assert.equal(Object.hasOwn(created.body.user, "password"), false);

  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: "worker-2",
    password: "worker2-pass",
  }, {});
  assert.equal(login.statusCode, 201);
  assert.equal(login.body.session.role, "worker");
});

test("admin updates, resets password, deactivates, and reactivates API users", async () => {
  const directory = await createTempUserDirectory();
  const { route } = createApiHarness({ userDirectory: directory });
  const adminHeaders = await loginHeaders(route, "admin");
  await callJson(route, "POST", "/api/users", {
    user_id: "reviewer-2",
    role: "reviewer",
    display_name: "Reviewer Two",
    password: "old-pass",
  }, adminHeaders);

  const updated = await callJson(route, "PUT", "/api/users/reviewer-2", {
    role: "worker",
    display_name: "Worker Two",
    password: "new-pass",
  }, adminHeaders);
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.user.role, "worker");
  assert.equal(updated.body.user.display_name, "Worker Two");
  assert.equal(Object.hasOwn(updated.body.user, "password"), false);
  assert.equal((await callJson(route, "POST", "/api/session/login", {
    user_id: "reviewer-2",
    password: "old-pass",
  }, {})).statusCode, 401);
  assert.equal((await callJson(route, "POST", "/api/session/login", {
    user_id: "reviewer-2",
    password: "new-pass",
  }, {})).statusCode, 201);

  const deactivated = await callJson(route, "PUT", "/api/users/reviewer-2", {
    active: false,
  }, adminHeaders);
  assert.equal(deactivated.statusCode, 200);
  assert.equal(deactivated.body.user.active, false);
  assert.equal((await callJson(route, "POST", "/api/session/login", {
    user_id: "reviewer-2",
    password: "new-pass",
  }, {})).statusCode, 401);
  assert.deepEqual((await callJson(route, "GET", "/api/users?role=worker", null, adminHeaders)).body.users.map((user) => user.user_id), ["worker"]);

  const reactivated = await callJson(route, "PUT", "/api/users/reviewer-2", {
    active: true,
  }, adminHeaders);
  assert.equal(reactivated.statusCode, 200);
  assert.equal(reactivated.body.user.active, true);
  assert.equal((await callJson(route, "POST", "/api/session/login", {
    user_id: "reviewer-2",
    password: "new-pass",
  }, {})).statusCode, 201);
});

test("persistent session store can authorize later requests", async () => {
  const sessionRecords = new Map();
  const sessionStore = {
    async createSession(input) {
      const session = {
        token: `sess_${input.user_id}`,
        user_id: input.user_id,
        userId: input.user_id,
        role: input.role,
        created_at: "2026-04-30T00:00:00.000Z",
        expires_at: "2026-05-01T00:00:00.000Z",
      };
      sessionRecords.set(session.token, session);
      return session;
    },
    async readSession(token) {
      return sessionRecords.get(token) || null;
    },
    async deleteSession(token) {
      return sessionRecords.delete(token);
    },
  };
  const { route, storage } = createApiHarness({ sessionStore });
  await storage.ensureProject("project-1", { name: "Project 1" });

  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: "admin",
    password: "admin123",
  }, {});
  const headers = { authorization: `Bearer ${login.body.session.token}` };
  const manifest = await callJson(route, "GET", "/api/projects/project-1", null, headers);
  await callJson(route, "POST", "/api/session/logout", null, headers);
  const afterLogout = await callJson(route, "GET", "/api/projects/project-1", null, headers);

  assert.equal(login.body.session.token, "sess_admin");
  assert.equal(manifest.statusCode, 200);
  assert.equal(afterLogout.statusCode, 403);
});

test("admin creates projects and non-admin users cannot create them", async () => {
  const { route, storage } = createApiHarness();
  const workerHeaders = await loginHeaders(route, "worker");

  const rejected = await callJson(route, "POST", "/api/projects", {
    id: "worker-project",
    name: "Worker Project",
  }, workerHeaders);
  assert.equal(rejected.statusCode, 403);

  const adminHeaders = await loginHeaders(route, "admin");
  const created = await callJson(route, "POST", "/api/projects", {
    id: "project-created",
    name: "Created Project",
    upload_policy: { maxFileBytes: 4 },
    label_schema: [
      { class_id: 1, name: "crack", color: "#EF4444" },
      { class_id: 2, name: "corrosion", color: "#F59E0B" },
    ],
  }, adminHeaders);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.project_id, "project-created");
  assert.equal(created.body.name, "Created Project");
  assert.equal(created.body.upload_policy.maxFileBytes, 4);
  assert.equal(created.body.label_schema[1].name, "corrosion");

  const manifest = await storage.readProjectManifest("project-created");
  assert.equal(manifest.name, "Created Project");
  assert.equal(manifest.upload_policy.maxFileBytes, 4);
  assert.equal(manifest.label_schema[0].class_id, 1);
  assert.equal(manifest.label_schema[1].color, "#F59E0B");
});

test("project creation requires explicit project id", async () => {
  const { route } = createApiHarness();
  const adminHeaders = await loginHeaders(route, "admin");

  const response = await callJson(route, "POST", "/api/projects", {
    name: "Missing ID",
  }, adminHeaders);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "project_id_required");
});

test("project upload policy is used during image upload validation", async () => {
  const { route, storage } = createApiHarness();
  const adminHeaders = await loginHeaders(route, "admin");
  const workerHeaders = await loginHeaders(route, "worker");
  await callJson(route, "POST", "/api/projects", {
    id: "tiny-project",
    name: "Tiny Project",
    upload_policy: { maxFileBytes: 4 },
  }, adminHeaders);

  const response = await callJson(route, "POST", "/api/projects/tiny-project/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 2,
    height: 2,
  }, workerHeaders);

  assert.equal(response.statusCode, 413);
  assert.equal(storage.imageWrites.length, 0);
});

test("admin updates project settings and revision guard rejects stale writes", async () => {
  const { route, storage } = createApiHarness();
  const adminHeaders = await loginHeaders(route, "admin");
  const workerHeaders = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.writeProjectManifest("project-1", {
    ...(await storage.readProjectManifest("project-1")),
    revision: 2,
  });

  const rejectedRole = await callJson(route, "PATCH", "/api/projects/project-1/settings", {
    upload_policy: { maxFileBytes: 1024 },
  }, workerHeaders);
  assert.equal(rejectedRole.statusCode, 403);

  const stale = await callJson(route, "PATCH", "/api/projects/project-1/settings", {
    if_match_revision: 1,
    upload_policy: { maxFileBytes: 1024 },
  }, adminHeaders);
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.body.error, "revision_conflict");

  const updated = await callJson(route, "PATCH", "/api/projects/project-1/settings", {
    if_match_revision: 2,
    name: "Renamed Project",
    description: "night batch",
    upload_policy: {
      maxFileBytes: 1024,
      allowedMimeTypes: ["image/png"],
      allowedExtensions: ["png"],
    },
    magic_tool_preset: {
      colorTolerance: 24,
      edgeThreshold: 72,
      maxPixels: 50000,
      smoothIterations: 1,
    },
    label_schema: [
      { class_id: 1, name: "crack", color: "#EF4444" },
      { class_id: 2, name: "corrosion", color: "#F59E0B" },
    ],
  }, adminHeaders);

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.settings.upload_policy.maxFileBytes, 1024);
  assert.equal(updated.body.settings.name, "Renamed Project");
  assert.equal(updated.body.settings.description, "night batch");
  assert.deepEqual(updated.body.settings.upload_policy.allowedExtensions, [".png"]);
  assert.equal(updated.body.settings.magic_tool_preset.colorTolerance, 24);
  assert.equal(updated.body.settings.label_schema[1].name, "corrosion");
  assert.equal(updated.body.settings.revision, 3);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.name, "Renamed Project");
  assert.equal(manifest.description, "night batch");
  assert.equal(manifest.upload_policy.maxFileBytes, 1024);
  assert.equal(manifest.magic_tool_preset.edgeThreshold, 72);
  assert.equal(manifest.label_schema[0].name, "crack");
  assert.equal(manifest.revision, 3);
});

test("review events use authenticated session identity instead of request body reviewer", async () => {
  const { route, storage } = createApiHarness();
  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: "reviewer",
    password: "reviewer123",
  }, {});
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    status: "submitted",
    current_mask_path: "masks/image-1_mask.png",
  });

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "approve",
    reviewer_id: "spoofed-reviewer",
  }, { authorization: `Bearer ${login.body.session.token}` });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.reviewer_id, "reviewer");
  assert.equal(response.body.image.review_events[0].reviewer_id, "reviewer");
});

test("admin assignment validates worker and reviewer target roles", async () => {
  const { route, storage } = createApiHarness();
  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: "admin",
    password: "admin123",
  }, {});
  const headers = { authorization: `Bearer ${login.body.session.token}` };
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());

  const invalid = await callJson(route, "PUT", "/api/images/image-1/assignment", {
    project_id: "project-1",
    worker_id: "reviewer",
    reviewer_id: "worker",
  }, headers);
  assert.equal(invalid.statusCode, 422);

  const valid = await callJson(route, "PUT", "/api/images/image-1/assignment", {
    project_id: "project-1",
    worker_id: "worker",
    reviewer_id: "reviewer",
  }, headers);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.image.worker_id, "worker");
  assert.equal(valid.body.image.reviewer_id, "reviewer");
  assert.equal(valid.body.image.assigned_by, "admin");
});

test("valid image upload writes file and appends manifest image", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 2,
    height: 2,
  }, headers);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.id, "image-1");
  assert.equal(response.body.image_path, "images/image-1_frame.png");
  assert.equal(storage.imageWrites.length, 1);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images.length, 1);
  assert.equal(manifest.images[0].original_file_name, "frame.png");
});

test("multipart image upload writes file and appends manifest image", async () => {
  const { route, storage } = createApiHarness();
  const auth = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  const png = createGrayscalePng({ width: 2, height: 2, pixels: [0, 0, 0, 0] });
  const boundary = "----masking-app-test";
  const body = createMultipartBody(boundary, [
    { name: "image_id", value: "image-1" },
    { name: "file_name", value: "frame.png" },
    { name: "width", value: "2" },
    { name: "height", value: "2" },
    { name: "image", fileName: "frame.png", contentType: "image/png", value: png },
  ]);

  const response = await callJson(route, "POST", "/api/projects/project-1/images", body, {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    ...auth,
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.id, "image-1");
  assert.equal(response.body.worker_id, "worker");
  assert.equal(storage.imageWrites[0].relativePath, "images/image-1_frame.png");
  assert.deepEqual(storage.imageWrites[0].buffer, png);
});

test("image upload rejects missing projects before writing files", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");

  const response = await callJson(route, "POST", "/api/projects/missing-project/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 2,
    height: 2,
  }, headers);

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "project_not_found");
  assert.equal(await storage.readProjectManifest("missing-project"), null);
  assert.equal(storage.imageWrites.length, 0);
});

test("image upload uses server-extracted dimensions and rejects mismatches", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: VALID_IMAGE_DATA_URL,
    width: 999,
    height: 2,
  }, headers);

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "image_dimension_mismatch");
  assert.deepEqual(response.body.validation.server, { width: 2, height: 2 });
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
  assert.equal(storage.imageWrites.length, 0);
});

test("worker role cannot review submitted images", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    status: "submitted",
    current_mask_path: "masks/image-1_mask.png",
  });
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "approve",
    reviewer_id: "reviewer-1",
  }, headers);

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, "forbidden");
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
});

test("unsupported image upload returns 400 before mutating manifest", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "notes.txt",
    data_url: `data:text/plain;base64,${Buffer.from("not an image").toString("base64")}`,
    width: 2,
    height: 2,
  }, headers);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "image_upload_validation_failed");
  assert.deepEqual(response.body.validation.reasons, ["unsupported_mime_type", "unsupported_extension"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
  assert.equal(storage.imageWrites.length, 0);
});

test("oversized image upload returns 413 before mutating manifest", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  const before = await storage.readProjectManifest("project-1");
  const oversizedDataUrl = `data:image/png;base64,${Buffer.alloc((15 * 1024 * 1024) + 1).toString("base64")}`;

  const response = await callJson(route, "POST", "/api/projects/project-1/images", {
    image_id: "image-1",
    file_name: "large.png",
    data_url: oversizedDataUrl,
    width: 2,
    height: 2,
  }, headers);

  assert.equal(response.statusCode, 413);
  assert.equal(response.body.error, "image_upload_validation_failed");
  assert.deepEqual(response.body.validation.reasons, ["file_too_large"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
  assert.equal(storage.imageWrites.length, 0);
});

test("review approve updates only submitted images", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "reviewer");
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
  }, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.status, "approved");
  assert.equal(response.body.image.reviewer_id, "reviewer");
  assert.ok(response.body.image.approved_at);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].status, "approved");
  assert.equal(manifest.images[0].review_events.length, 1);
  assert.equal(manifest.images[0].review_events[0].action, "approve");
});

test("review reject requires reason and leaves manifest unchanged", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "reviewer");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", { ...baseImage(), status: "submitted" });
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "reject",
    reviewer_id: "reviewer-1",
  }, headers);

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "review_transition_failed");
  assert.deepEqual(response.body.validation.reasons, ["missing_rejection_reason"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
});

test("review action uses session reviewer identity when body reviewer is omitted", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "reviewer");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", { ...baseImage(), status: "submitted" });

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "approve",
  }, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.status, "approved");
  assert.equal(response.body.image.reviewer_id, "reviewer");
});

test("review rework moves rejected image back to in progress", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "reviewer");
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
  }, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.status, "in_progress");
  assert.ok(response.body.image.rework_started_at);
});

test("admin assignment updates worker and reviewer without changing status", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "admin");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", { ...baseImage(), status: "submitted" });

  const response = await callJson(route, "PUT", "/api/images/image-1/assignment", {
    project_id: "project-1",
    worker_id: "worker",
    reviewer_id: "reviewer",
  }, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.status, "submitted");
  assert.equal(response.body.image.worker_id, "worker");
  assert.equal(response.body.image.reviewer_id, "reviewer");
  assert.equal(response.body.image.assigned_by, "admin");

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].worker_id, "worker");
  assert.equal(manifest.images[0].reviewer_id, "reviewer");
});

test("valid mask save updates current mask and submitted status without claiming pixel validation", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
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
  }, headers);

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

test("class-aware mask save upserts annotation metadata and writes class mask path", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", {
    name: "Project 1",
    label_schema: [
      { class_id: 1, name: "target", color: "#EF4444" },
      { class_id: 2, name: "scratch", color: "#F59E0B" },
    ],
  });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "image-1",
    current_mask_path: "",
    status: "in_progress",
  });

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: VALID_MASK_DATA_URL,
    status: "in_progress",
    mask_ratio: 0.5,
    class_id: 2,
    class_name: "scratch",
    annotation_source: "ai",
    score: 0.91,
  }, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.current_mask_path, "masks/image-1_class_2_scratch_mask.png");
  assert.equal(response.body.image.annotations.length, 1);
  assert.equal(response.body.image.annotations[0].class_id, 2);
  assert.equal(response.body.image.annotations[0].class_name, "scratch");
  assert.equal(response.body.image.annotations[0].source, "ai");
  assert.equal(response.body.image.annotations[0].score, 0.91);
  assert.equal(response.body.image.annotations[0].mask_path, "masks/image-1_class_2_scratch_mask.png");

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].annotations[0].mask_path, "masks/image-1_class_2_scratch_mask.png");
  assert.equal(storage.maskWrites[0].relativePath, "masks/image-1_class_2_scratch_mask.png");
});

test("mask save can append submitted revision audit event", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    status: "submitted",
    current_mask_path: "masks/old_mask.png",
  });

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: VALID_MASK_DATA_URL,
    status: "in_progress",
    revision_event: {
      action: "revision_start",
      reviewer_id: "spoofed",
      reason: "edit_after_submission",
      from_status: "submitted",
      to_status: "in_progress",
      created_at: "2026-04-29T00:00:00.000Z",
    },
  }, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.status, "in_progress");
  assert.equal(response.body.image.review_events.length, 1);
  assert.equal(response.body.image.review_events[0].action, "revision_start");
  assert.equal(response.body.image.review_events[0].reviewer_id, "worker");
  assert.equal(response.body.image.revision_source_status, "submitted");

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].review_events[0].action, "revision_start");
});

test("invalid mask validation does not write a rejected mask file", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: toPngDataUrl(createGrayscalePng({ width: 2, height: 2, pixels: [0, 128, 0, 0] })),
    status: "submitted",
  }, headers);

  assert.equal(response.statusCode, 422);
  assert.equal(storage.maskWrites.length, 0);
});

test("invalid PNG mask returns 400 and leaves manifest unchanged", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());
  const before = await storage.readProjectManifest("project-1");

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: INVALID_PNG_DATA_URL,
    status: "submitted",
    mask_ratio: 0.5,
  }, headers);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "mask_validation_failed");
  assert.deepEqual(response.body.validation.reasons, ["invalid_png_signature"]);
  assert.deepEqual(await storage.readProjectManifest("project-1"), before);
});

test("dimension mismatch returns 422 and does not submit the image", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    data_url: DIMENSION_MISMATCH_DATA_URL,
    status: "submitted",
  }, headers);

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "mask_validation_failed");
  assert.deepEqual(response.body.validation.reasons, ["mask_dimension_mismatch"]);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].current_mask_path, "");
  assert.equal(manifest.images[0].status, "in_progress");
});

test("unsupported PNG mask format returns 422 and leaves previous mask intact", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
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
  }, headers);

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.body.validation.reasons, ["mask_not_8bit_grayscale"]);

  const manifest = await storage.readProjectManifest("project-1");
  assert.equal(manifest.images[0].current_mask_path, "masks/existing_mask.png");
  assert.equal(manifest.images[0].status, "in_progress");
});

test("worker can soft remove and restore a single image without physical purge", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    image_path: "images/image-1.png",
    current_mask_path: "masks/image-1_mask.png",
    deleted_at: "",
    deleted_by: "",
    delete_reason: "",
  });
  storage.files.set("project-1/images/image-1.png", "image-bytes");
  storage.files.set("project-1/masks/image-1_mask.png", "mask-bytes");

  const removed = await callJson(route, "DELETE", "/api/images/image-1", {
    project_id: "project-1",
    delete_reason: "wrong frame",
  }, headers);

  assert.equal(removed.statusCode, 200);
  assert.equal(removed.body.image.deleted_by, "worker");
  assert.equal(removed.body.image.delete_reason, "wrong frame");
  assert.ok(removed.body.image.deleted_at);
  assert.equal(storage.files.get("project-1/images/image-1.png"), "image-bytes");
  assert.equal(storage.files.get("project-1/masks/image-1_mask.png"), "mask-bytes");

  const restored = await callJson(route, "POST", "/api/images/image-1/restore", {
    project_id: "project-1",
  }, headers);

  assert.equal(restored.statusCode, 200);
  assert.equal(restored.body.image.deleted_at, "");
  assert.equal(restored.body.image.deleted_by, "");
  assert.equal(restored.body.image.delete_reason, "");
  assert.equal(storage.files.get("project-1/images/image-1.png"), "image-bytes");
  assert.equal(storage.files.get("project-1/masks/image-1_mask.png"), "mask-bytes");
});

test("project export writes files only for the same images included in annotations", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "admin");
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
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "deleted-1",
    original_file_name: "deleted.png",
    image_path: "images/deleted_source.png",
    current_mask_path: "masks/deleted_source_mask.png",
    status: "submitted",
    deleted_at: "2026-04-30T00:00:00.000Z",
  });
  storage.files.set("project-1/images/submitted_source.png", "submitted-image");
  storage.files.set("project-1/masks/submitted_source_mask.png", "submitted-mask");
  storage.files.set("project-1/images/draft_source.png", "draft-image");
  storage.files.set("project-1/masks/draft_source_mask.png", "draft-mask");
  storage.files.set("project-1/images/deleted_source.png", "deleted-image");
  storage.files.set("project-1/masks/deleted_source_mask.png", "deleted-mask");

  const response = await callRoute(route, "GET", "/api/projects/project-1/export", null, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/zip");
  assert.match(response.text, /annotations\.json/);
  assert.match(response.text, /export_summary\.json/);
  assert.match(response.text, /images\/submitted\.png/);
  assert.match(response.text, /masks\/submitted_mask\.png/);
  assert.doesNotMatch(response.text, /images\/draft\.png/);
  assert.doesNotMatch(response.text, /masks\/draft_mask\.png/);
  assert.doesNotMatch(response.text, /draft-image/);
  assert.doesNotMatch(response.text, /images\/deleted\.png/);
  assert.doesNotMatch(response.text, /masks\/deleted_mask\.png/);
  assert.doesNotMatch(response.text, /deleted-image/);
  assert.match(response.text, /status_not_exportable/);
});

test("project export includes each class annotation mask file", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "admin");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "submitted-1",
    original_file_name: "submitted.png",
    image_path: "images/submitted_source.png",
    current_mask_path: "",
    status: "submitted",
    mask_values_valid: true,
    annotations: [
      {
        annotation_id: "ann_submitted-1_class_1",
        class_id: 1,
        class_name: "crack",
        mask_path: "masks/submitted_class_1_crack_mask.png",
        mask_ratio: 0.2,
      },
      {
        annotation_id: "ann_submitted-1_class_2",
        class_id: 2,
        class_name: "scratch",
        mask_path: "masks/submitted_class_2_scratch_mask.png",
        mask_ratio: 0.1,
      },
    ],
  });
  storage.files.set("project-1/images/submitted_source.png", "submitted-image");
  storage.files.set("project-1/masks/submitted_class_1_crack_mask.png", "crack-mask");
  storage.files.set("project-1/masks/submitted_class_2_scratch_mask.png", "scratch-mask");

  const response = await callRoute(route, "GET", "/api/projects/project-1/export", null, headers);

  assert.equal(response.statusCode, 200);
  assert.match(response.text, /submitted_class_1_crack_mask/);
  assert.match(response.text, /submitted_class_2_scratch_mask/);
  assert.match(response.text, /crack-mask/);
  assert.match(response.text, /scratch-mask/);
});

test("project export includes derived indexed masks for class annotations", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "admin");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "submitted-1",
    original_file_name: "submitted.png",
    image_path: "images/submitted_source.png",
    current_mask_path: "",
    width: 2,
    height: 2,
    status: "submitted",
    mask_values_valid: true,
    annotations: [
      {
        annotation_id: "ann_submitted-1_class_1",
        class_id: 1,
        class_name: "crack",
        mask_path: "masks/submitted_class_1_crack_mask.png",
      },
      {
        annotation_id: "ann_submitted-1_class_2",
        class_id: 2,
        class_name: "scratch",
        mask_path: "masks/submitted_class_2_scratch_mask.png",
      },
    ],
  });
  storage.files.set("project-1/images/submitted_source.png", "submitted-image");
  storage.files.set("project-1/masks/submitted_class_1_crack_mask.png", createGrayscalePng({ width: 2, height: 2, pixels: [0, 255, 0, 0] }));
  storage.files.set("project-1/masks/submitted_class_2_scratch_mask.png", createGrayscalePng({ width: 2, height: 2, pixels: [0, 0, 255, 0] }));

  const response = await callRoute(route, "GET", "/api/projects/project-1/export", null, headers);

  assert.equal(response.statusCode, 200);
  assert.match(response.text, /indexed_masks\/submitted-1_indexed_mask\.png/);
  assert.match(response.text, /indexed_masks\/indexed_masks\.json/);
  assert.match(response.text, /higher_class_id_wins/);
  assert.match(response.text, /"class_id": 2/);
});

test("project export approved-only query excludes submitted images", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "admin");
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

  const response = await callRoute(route, "GET", "/api/projects/project-1/export?approved_only=1", null, headers);

  assert.equal(response.statusCode, 200);
  assert.match(response.text, /images\/approved\.png/);
  assert.match(response.text, /masks\/approved_mask\.png/);
  assert.match(response.text, /not_approved/);
  assert.match(response.text, /review_events/);
  assert.doesNotMatch(response.text, /images\/submitted\.png/);
  assert.doesNotMatch(response.text, /submitted-image/);
});

test("authorized users can download project files for server-first restore", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "worker");
  await storage.ensureProject("project-1", { name: "Project 1" });
  storage.files.set("project-1/images/source.png", "source-bytes");

  const response = await callRoute(route, "GET", "/api/projects/project-1/files?path=images%2Fsource.png", null, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.equal(response.text, "source-bytes");
});

test("training set export combines selected project sources with traceability metadata", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "admin");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "approved-1",
    original_file_name: "approved.png",
    image_path: "images/approved_source.png",
    current_mask_path: "masks/approved_source_mask.png",
    status: "approved",
    mask_values_valid: true,
  });
  storage.files.set("project-1/images/approved_source.png", "approved-image");
  storage.files.set("project-1/masks/approved_source_mask.png", "approved-mask");

  const response = await callRoute(route, "POST", "/api/training-sets/export", {
    sources: [{ project_id: "project-1" }],
    approved_only: true,
  }, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/zip");
  assert.match(response.text, /training_set\.json/);
  assert.match(response.text, /source_versions\.json/);
  assert.match(response.text, /images\/project-1_legacy_project_legacy_0001_approved-1_approved\.png/);
  assert.match(response.text, /masks\/project-1_legacy_project_legacy_0001_approved-1_approved_mask\.png/);
  assert.match(response.text, /approved-image/);
  assert.match(response.text, /approved-mask/);
});

test("training set export requires a selected source", async () => {
  const { route } = createApiHarness();
  const headers = await loginHeaders(route, "admin");

  const response = await callJson(route, "POST", "/api/training-sets/export", {
    sources: [],
  }, headers);

  assert.equal(response.statusCode, 400);
});

test("reviewers create and export saved training sets while admins archive and restore them", async () => {
  const { route, storage } = createApiHarness();
  const reviewerHeaders = await loginHeaders(route, "reviewer");
  const adminHeaders = await loginHeaders(route, "admin");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    id: "approved-1",
    original_file_name: "approved.png",
    image_path: "images/approved_source.png",
    current_mask_path: "masks/approved_source_mask.png",
    status: "approved",
    mask_values_valid: true,
  });
  storage.files.set("project-1/images/approved_source.png", "approved-image");
  storage.files.set("project-1/masks/approved_source_mask.png", "approved-mask");

  const created = await callJson(route, "POST", "/api/training-sets", {
    training_set_id: "rail_v1",
    name: "Rail v1",
    description: "approved baseline",
    sources: [{ project_id: "project-1" }],
    approved_only: true,
    split: { train: 1, val: 0, test: 0, seed: 7 },
  }, reviewerHeaders);
  const listed = await callJson(route, "GET", "/api/training-sets", null, reviewerHeaders);
  const duplicate = await callJson(route, "POST", "/api/training-sets", {
    training_set_id: "rail_v1",
    sources: [{ project_id: "project-1" }],
  }, reviewerHeaders);
  const detail = await callJson(route, "GET", "/api/training-sets/rail_v1", null, reviewerHeaders);
  const exported = await callRoute(route, "GET", "/api/training-sets/rail_v1/export", null, reviewerHeaders);
  const reviewerDelete = await callJson(route, "DELETE", "/api/training-sets/rail_v1", {
    if_match_revision: created.body.training_set_manifest.revision,
  }, reviewerHeaders);
  const archived = await callJson(route, "DELETE", "/api/training-sets/rail_v1", {
    if_match_revision: created.body.training_set_manifest.revision,
    delete_reason: "wrong merge set",
  }, adminHeaders);
  const rejectedDeletedList = await callJson(route, "GET", "/api/training-sets?include_deleted=1", null, reviewerHeaders);
  const adminDeletedList = await callJson(route, "GET", "/api/training-sets?include_deleted=1", null, adminHeaders);
  const hiddenDetail = callJson(route, "GET", "/api/training-sets/rail_v1", null, reviewerHeaders);
  const restored = await callJson(route, "POST", "/api/training-sets/rail_v1/restore", {
    if_match_revision: archived.body.training_set_manifest.revision,
  }, adminHeaders);

  assert.equal(created.statusCode, 201);
  assert.equal(created.body.training_set_manifest.training_set_id, "rail_v1");
  assert.equal(created.body.training_set_manifest.training_set.total_items, 1);
  assert.deepEqual(created.body.training_set_manifest.training_set.split_counts, { train: 1, val: 0, test: 0 });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.body.training_sets.map((item) => item.training_set_id), ["rail_v1"]);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.error, "training_set_exists");
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.body.training_set_manifest.name, "Rail v1");
  assert.equal(exported.statusCode, 200);
  assert.equal(exported.headers["content-type"], "application/zip");
  assert.match(exported.text, /training_set\.json/);
  assert.match(exported.text, /splits\/train\.txt/);
  assert.match(exported.text, /images\/project-1_legacy_project_legacy_0001_approved-1_approved\.png/);
  assert.match(exported.text, /approved-image/);
  assert.equal(reviewerDelete.statusCode, 403);
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.body.training_set_manifest.deleted_by, "admin");
  assert.equal(archived.body.training_set_manifest.delete_reason, "wrong merge set");
  assert.equal(rejectedDeletedList.statusCode, 403);
  assert.equal(adminDeletedList.statusCode, 200);
  assert.equal(adminDeletedList.body.training_sets[0].deleted_by, "admin");
  await assert.rejects(hiddenDetail, /Training set not found/);
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.body.training_set_manifest.deleted_at, "");
});

test("lists project summaries ordered by update time", async () => {
  const { route, storage } = createApiHarness();
  const headers = await loginHeaders(route, "reviewer");
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

  const response = await callJson(route, "GET", "/api/projects", null, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.total_projects, 2);
  assert.deepEqual(response.body.projects.map((project) => project.project_id), ["project-new", "project-old"]);
  assert.equal(response.body.projects[0].approved_images, 1);
  assert.equal(response.body.projects[1].submitted_images, 1);
});

test("admin archives restores and purges projects while normal lists hide archived projects", async () => {
  const { route, storage } = createApiHarness();
  const adminHeaders = await loginHeaders(route, "admin");
  const reviewerHeaders = await loginHeaders(route, "reviewer");
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.writeProjectManifest("project-1", {
    ...(await storage.readProjectManifest("project-1")),
    revision: 1,
  });

  const rejectedRole = await callJson(route, "DELETE", "/api/projects/project-1", {
    reason: "wrong_project",
  }, reviewerHeaders);
  assert.equal(rejectedRole.statusCode, 403);

  const stale = await callJson(route, "DELETE", "/api/projects/project-1", {
    if_match_revision: 0,
    reason: "wrong_project",
  }, adminHeaders);
  assert.equal(stale.statusCode, 409);

  const archived = await callJson(route, "DELETE", "/api/projects/project-1", {
    if_match_revision: 1,
    reason: "wrong_project",
  }, adminHeaders);
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.body.project.deleted_by, "admin");
  assert.equal(archived.body.project.delete_reason, "wrong_project");

  const activeList = await callJson(route, "GET", "/api/projects", null, reviewerHeaders);
  assert.equal(activeList.body.total_projects, 0);

  const rejectedDeletedList = await callJson(route, "GET", "/api/projects?include_deleted=1", null, reviewerHeaders);
  assert.equal(rejectedDeletedList.statusCode, 403);

  const deletedList = await callJson(route, "GET", "/api/projects?include_deleted=1", null, adminHeaders);
  assert.equal(deletedList.statusCode, 200);
  assert.equal(deletedList.body.projects[0].deleted_at, archived.body.project.deleted_at);

  const restored = await callJson(route, "POST", "/api/projects/project-1/restore", {
    if_match_revision: archived.body.project.revision,
  }, adminHeaders);
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.body.project.deleted_at, "");

  await callJson(route, "DELETE", "/api/projects/project-1", {
    if_match_revision: restored.body.project.revision,
    reason: "cleanup",
  }, adminHeaders);
  const purged = await callJson(route, "POST", "/api/projects/project-1/purge", {}, adminHeaders);
  assert.equal(purged.statusCode, 200);
  assert.equal(purged.body.purge.purged, true);
  assert.equal(await storage.readProjectManifest("project-1"), null);
});

test("admin creates tasks and authorized users list and read task metadata", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  const adminHeaders = await loginHeaders(route, "admin");
  const workerHeaders = await loginHeaders(route, "worker");

  const created = await callJson(route, "POST", "/api/projects/project-1/tasks", {
    task_id: "crack masking",
    name: "Crack Masking",
    description: "Binary crack mask task",
  }, adminHeaders);
  const listed = await callJson(route, "GET", "/api/projects/project-1/tasks", null, workerHeaders);
  const read = await callJson(route, "GET", "/api/projects/project-1/tasks/crack%20masking", null, workerHeaders);

  assert.equal(created.statusCode, 201);
  assert.equal(created.body.task.task_id, "crack_masking");
  assert.equal(created.body.task.name, "Crack Masking");
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.total_tasks, 1);
  assert.equal(listed.body.tasks[0].task_id, "crack_masking");
  assert.equal(read.statusCode, 200);
  assert.equal(read.body.task.description, "Binary crack mask task");
});

test("admin creates versions and authorized users list and read version manifests", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.ensureTaskMetadata("project-1", "task-1", { name: "Task 1" });
  const adminHeaders = await loginHeaders(route, "admin");
  const reviewerHeaders = await loginHeaders(route, "reviewer");

  const created = await callJson(route, "POST", "/api/projects/project-1/tasks/task-1/versions", {
    version_id: "v2",
    status: "draft",
  }, adminHeaders);
  const listed = await callJson(route, "GET", "/api/projects/project-1/tasks/task-1/versions", null, reviewerHeaders);
  const read = await callJson(route, "GET", "/api/projects/project-1/tasks/task-1/versions/v2", null, reviewerHeaders);

  assert.equal(created.statusCode, 201);
  assert.equal(created.body.version.version_id, "v2");
  assert.equal(created.body.version.status, "draft");
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.total_versions, 1);
  assert.equal(listed.body.versions[0].version_id, "v2");
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.body.version.images, []);
});

test("admin clones, soft deletes, and restores version manifests through storage helpers", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.ensureTaskMetadata("project-1", "task-1", { name: "Task 1" });
  await storage.ensureVersionManifest("project-1", "task-1", "v1", {
    status: "ready",
    images: [{ id: "image-1", status: "approved" }],
  });
  await storage.writeVersionManifest("project-1", "task-1", "v1", {
    ...(await storage.readVersionManifest("project-1", "task-1", "v1")),
    revision: 4,
  });
  const adminHeaders = await loginHeaders(route, "admin");
  const workerHeaders = await loginHeaders(route, "worker");

  const rejectedRole = await callJson(route, "POST", "/api/projects/project-1/tasks/task-1/versions/v1/clone", {
    new_version_id: "v2",
  }, workerHeaders);
  assert.equal(rejectedRole.statusCode, 403);

  const cloned = await callJson(route, "POST", "/api/projects/project-1/tasks/task-1/versions/v1/clone", {
    new_version_id: "v2",
    if_match_revision: 4,
  }, adminHeaders);
  const deleted = await callJson(route, "DELETE", "/api/projects/project-1/tasks/task-1/versions/v2", {
    delete_reason: "bad labels",
    if_match_revision: 1,
  }, adminHeaders);
  const restored = await callJson(route, "POST", "/api/projects/project-1/tasks/task-1/versions/v2/restore", {
    if_match_revision: 2,
  }, adminHeaders);
  const purged = await callJson(route, "POST", "/api/projects/project-1/tasks/task-1/versions/v2/purge", {}, adminHeaders);

  assert.equal(cloned.statusCode, 201);
  assert.equal(cloned.body.version.version_id, "v2");
  assert.equal(cloned.body.version.revision, 1);
  assert.equal(cloned.body.version.cloned_from_version_id, "v1");
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.body.version.deleted_by, "admin");
  assert.equal(deleted.body.version.delete_reason, "bad labels");
  assert.equal(deleted.body.version.revision, 2);
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.body.version.deleted_at, "");
  assert.equal(restored.body.version.revision, 3);
  assert.equal(purged.statusCode, 200);
  assert.equal(purged.body.purge.deleted_files, 0);
});

test("version mutation revision guard returns conflict before storage helper mutation", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.ensureTaskMetadata("project-1", "task-1", { name: "Task 1" });
  await storage.ensureVersionManifest("project-1", "task-1", "v1", { status: "ready" });
  await storage.writeVersionManifest("project-1", "task-1", "v1", {
    ...(await storage.readVersionManifest("project-1", "task-1", "v1")),
    revision: 7,
  });
  const adminHeaders = await loginHeaders(route, "admin");

  const response = await callJson(route, "DELETE", "/api/projects/project-1/tasks/task-1/versions/v1", {
    if_match_revision: 6,
  }, adminHeaders);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error, "revision_conflict");
  assert.equal(response.body.expected_revision, 7);
  assert.equal((await storage.readVersionManifest("project-1", "task-1", "v1")).deleted_at, undefined);
});

test("authorized users discover training export sources from project task versions", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("legacy-project", { name: "Legacy Project" });
  await storage.addImage("legacy-project", { ...baseImage(), id: "legacy-approved", status: "approved" });
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.ensureTaskMetadata("project-1", "task-1", { name: "Task 1" });
  await storage.ensureVersionManifest("project-1", "task-1", "v1", {
    status: "ready",
    images: [
      { ...baseImage(), id: "approved-1", status: "approved" },
      { ...baseImage(), id: "deleted-1", status: "approved", deleted_at: "2026-04-30T00:00:00.000Z" },
    ],
  });
  const headers = await loginHeaders(route, "reviewer");

  const response = await callJson(route, "GET", "/api/training-sources", null, headers);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.total_sources, 2);
  assert.deepEqual(response.body.sources.map((source) => `${source.project_id}/${source.task_id}/${source.version_id}`).sort(), [
    "legacy-project/legacy_project/legacy",
    "project-1/task-1/v1",
  ]);
  const versionSource = response.body.sources.find((source) => source.version_id === "v1");
  assert.equal(versionSource.total_images, 2);
  assert.equal(versionSource.active_images, 1);
  assert.equal(versionSource.approved_images, 1);
});

test("task and version routes do not replace legacy project manifest routes", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  const headers = await loginHeaders(route, "worker");

  const manifest = await callJson(route, "GET", "/api/projects/project-1", null, headers);

  assert.equal(manifest.statusCode, 200);
  assert.equal(manifest.body.project_id, "project-1");
  assert.deepEqual(manifest.body.images, []);
});

function createApiHarness(options = {}) {
  const storage = createMemoryStorage();
  return {
    storage,
    route: createApiRouter({ storage, ...options }),
  };
}

async function createTempUserDirectory() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "masking-api-users-test-"));
  return createUserDirectory({ rootDir });
}

function createMemoryStorage() {
  const manifests = new Map();
  const projects = new Map();
  const tasks = new Map();
  const versions = new Map();
  const trainingSets = new Map();
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
    async archiveProject(projectId, input = {}) {
      const manifest = manifests.get(projectId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      const updated = {
        ...manifest,
        deleted_at: manifest.deleted_at || now,
        deleted_by: input.deletedBy || input.deleted_by || "",
        delete_reason: input.reason || input.deleteReason || input.delete_reason || "",
        updated_at: now,
        revision: Number(manifest.revision || 0) + 1,
      };
      manifests.set(projectId, clone(updated));
      return clone(updated);
    },
    async restoreProject(projectId, input = {}) {
      const manifest = manifests.get(projectId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      const updated = {
        ...manifest,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        updated_at: now,
        revision: Number(manifest.revision || 0) + 1,
      };
      manifests.set(projectId, clone(updated));
      return clone(updated);
    },
    async purgeProject(projectId) {
      manifests.delete(projectId);
      return {
        project_id: projectId,
        purged: true,
      };
    },
    async softDeleteProjectImage(projectId, imageId, input = {}) {
      const manifest = manifests.get(projectId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      const image = (manifest.images || []).find((item) => item.id === imageId);
      const updated = {
        ...image,
        deleted_at: image.deleted_at || now,
        deleted_by: input.deletedBy || input.deleted_by || "",
        delete_reason: input.reason || input.deleteReason || input.delete_reason || "",
        updated_at: now,
      };
      manifest.images = manifest.images.map((item) => item.id === imageId ? updated : item);
      manifest.updated_at = now;
      return clone(updated);
    },
    async restoreProjectImage(projectId, imageId, input = {}) {
      const manifest = manifests.get(projectId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      const image = (manifest.images || []).find((item) => item.id === imageId);
      const updated = {
        ...image,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        updated_at: now,
      };
      manifest.images = manifest.images.map((item) => item.id === imageId ? updated : item);
      manifest.updated_at = now;
      return clone(updated);
    },
    async listProjects(options = {}) {
      return [...manifests.values()].filter((manifest) => options.includeDeleted || !manifest.deleted_at).map((manifest) => {
        const images = (manifest.images || []).filter((image) => !image.deleted_at);
        return {
          project_id: manifest.project_id,
          name: manifest.name,
          created_at: manifest.created_at,
          updated_at: manifest.updated_at,
          revision: Number(manifest.revision || 0),
          deleted_at: manifest.deleted_at || "",
          deleted_by: manifest.deleted_by || "",
          delete_reason: manifest.delete_reason || "",
          total_images: images.length,
          submitted_images: images.filter((image) => image.status === "submitted").length,
          approved_images: images.filter((image) => image.status === "approved").length,
          rejected_images: images.filter((image) => image.status === "rejected").length,
        };
      }).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    },
    async writeTrainingSetManifest(trainingSetId, manifest) {
      const safeTrainingSetId = sanitizeTestId(trainingSetId);
      const next = {
        ...clone(manifest),
        training_set_id: safeTrainingSetId,
      };
      trainingSets.set(safeTrainingSetId, next);
      return clone(next);
    },
    async readTrainingSetManifest(trainingSetId) {
      const safeTrainingSetId = sanitizeTestId(trainingSetId);
      return trainingSets.has(safeTrainingSetId) ? clone(trainingSets.get(safeTrainingSetId)) : null;
    },
    async listTrainingSets(options = {}) {
      return [...trainingSets.values()]
        .filter((manifest) => options.includeDeleted || !manifest.deleted_at)
        .map((manifest) => {
          const items = Array.isArray(manifest.training_set?.items) ? manifest.training_set.items : [];
          return {
            training_set_id: manifest.training_set_id,
            name: manifest.name || manifest.training_set_id,
            description: manifest.description || "",
            created_by: manifest.created_by || "",
            created_at: manifest.created_at || "",
            updated_at: manifest.updated_at || "",
            revision: Number(manifest.revision || 0),
            deleted_at: manifest.deleted_at || "",
            deleted_by: manifest.deleted_by || "",
            delete_reason: manifest.delete_reason || "",
            total_sources: manifest.training_set?.total_sources || manifest.source_versions?.sources?.length || 0,
            total_items: items.length,
            split_counts: manifest.training_set?.split_counts || { train: 0, val: 0, test: 0 },
          };
        })
        .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    },
    async archiveTrainingSet(trainingSetId, input = {}) {
      const safeTrainingSetId = sanitizeTestId(trainingSetId);
      const manifest = trainingSets.get(safeTrainingSetId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      const updated = {
        ...manifest,
        deleted_at: manifest.deleted_at || now,
        deleted_by: input.deletedBy || input.deleted_by || "",
        delete_reason: input.reason || input.deleteReason || input.delete_reason || "",
        updated_at: now,
        revision: Number(manifest.revision || 0) + 1,
      };
      trainingSets.set(safeTrainingSetId, clone(updated));
      return clone(updated);
    },
    async restoreTrainingSet(trainingSetId, input = {}) {
      const safeTrainingSetId = sanitizeTestId(trainingSetId);
      const manifest = trainingSets.get(safeTrainingSetId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      const updated = {
        ...manifest,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        updated_at: now,
        revision: Number(manifest.revision || 0) + 1,
      };
      trainingSets.set(safeTrainingSetId, clone(updated));
      return clone(updated);
    },
    async ensureProjectMetadata(projectId, input = {}) {
      if (!projects.has(projectId)) {
        projects.set(projectId, {
          project_id: projectId,
          name: input.name || projectId,
          description: input.description || "",
          created_by: input.createdBy || input.created_by || "",
          created_at: input.now || "2026-04-30T00:00:00.000Z",
          updated_at: input.now || "2026-04-30T00:00:00.000Z",
          archived: false,
        });
      }
      return clone(projects.get(projectId));
    },
    async ensureTaskMetadata(projectId, taskId, input = {}) {
      await this.ensureProjectMetadata(projectId, input.project || {});
      const safeTaskId = String(taskId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `${projectId}/${safeTaskId}`;
      if (!tasks.has(key)) {
        tasks.set(key, {
          project_id: projectId,
          task_id: safeTaskId,
          name: input.name || safeTaskId,
          description: input.description || "",
          created_by: input.createdBy || input.created_by || "",
          created_at: input.now || "2026-04-30T00:00:00.000Z",
          updated_at: input.now || "2026-04-30T00:00:00.000Z",
          current_version: input.currentVersion || input.current_version || "v1",
          archived: false,
        });
      }
      return clone(tasks.get(key));
    },
    async readTaskMetadata(projectId, taskId) {
      const safeTaskId = String(taskId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      return tasks.has(`${projectId}/${safeTaskId}`) ? clone(tasks.get(`${projectId}/${safeTaskId}`)) : null;
    },
    async listProjectTasks(projectId) {
      return [...tasks.values()]
        .filter((task) => task.project_id === projectId)
        .map(clone)
        .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    },
    async ensureVersionManifest(projectId, taskId, versionId, input = {}) {
      const safeTaskId = String(taskId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeVersionId = String(versionId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      await this.ensureTaskMetadata(projectId, safeTaskId, {
        currentVersion: safeVersionId,
        project: input.project || {},
      });
      const key = `${projectId}/${safeTaskId}/${safeVersionId}`;
      if (!versions.has(key)) {
        versions.set(key, {
          project_id: projectId,
          task_id: safeTaskId,
          version_id: safeVersionId,
          status: input.status || "in_progress",
          created_by: input.createdBy || input.created_by || "",
          created_at: input.now || "2026-04-30T00:00:00.000Z",
          updated_at: input.now || "2026-04-30T00:00:00.000Z",
          images: Array.isArray(input.images) ? input.images : [],
        });
      }
      return clone(versions.get(key));
    },
    async readVersionManifest(projectId, taskId, versionId) {
      const safeTaskId = String(taskId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeVersionId = String(versionId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      return versions.has(`${projectId}/${safeTaskId}/${safeVersionId}`)
        ? clone(versions.get(`${projectId}/${safeTaskId}/${safeVersionId}`))
        : null;
    },
    async writeVersionManifest(projectId, taskId, versionId, manifest) {
      const safeTaskId = String(taskId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeVersionId = String(versionId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      const next = {
        ...clone(manifest),
        project_id: projectId,
        task_id: safeTaskId,
        version_id: safeVersionId,
      };
      versions.set(`${projectId}/${safeTaskId}/${safeVersionId}`, next);
      return clone(next);
    },
    async cloneVersionManifest(projectId, taskId, sourceVersionId, newVersionId, input = {}) {
      const source = await this.readVersionManifest(projectId, taskId, sourceVersionId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      return this.writeVersionManifest(projectId, taskId, newVersionId, {
        ...source,
        version_id: newVersionId,
        status: "draft",
        created_by: input.createdBy || input.created_by || source.created_by || "",
        created_at: now,
        updated_at: now,
        cloned_from_version_id: source.version_id,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        revision: 1,
      });
    },
    async softDeleteVersionManifest(projectId, taskId, versionId, input = {}) {
      const version = await this.readVersionManifest(projectId, taskId, versionId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      return this.writeVersionManifest(projectId, taskId, versionId, {
        ...version,
        deleted_at: version.deleted_at || now,
        deleted_by: input.deletedBy || input.deleted_by || "",
        delete_reason: input.reason || input.deleteReason || input.delete_reason || "",
        updated_at: now,
        revision: Number(version.revision || 0) + 1,
      });
    },
    async restoreVersionManifest(projectId, taskId, versionId, input = {}) {
      const version = await this.readVersionManifest(projectId, taskId, versionId);
      const now = input.now || "2026-04-30T00:00:00.000Z";
      return this.writeVersionManifest(projectId, taskId, versionId, {
        ...version,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        updated_at: now,
        revision: Number(version.revision || 0) + 1,
      });
    },
    async purgeSoftDeletedVersionFiles() {
      return {
        deleted_files: 0,
        deletedFiles: 0,
        deleted_paths: [],
        missing_paths: [],
      };
    },
    async listTaskVersions(projectId, taskId) {
      const safeTaskId = String(taskId).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      return [...versions.values()]
        .filter((version) => version.project_id === projectId && version.task_id === safeTaskId)
        .map((version) => {
          const images = Array.isArray(version.images) ? version.images : [];
          return {
            project_id: version.project_id,
            task_id: version.task_id,
            version_id: version.version_id,
            status: version.status,
            created_at: version.created_at,
            updated_at: version.updated_at,
            total_images: images.length,
            active_images: images.filter((image) => !image.deleted_at).length,
            submitted_images: images.filter((image) => image.status === "submitted").length,
            approved_images: images.filter((image) => image.status === "approved").length,
            rejected_images: images.filter((image) => image.status === "rejected").length,
          };
        })
        .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    },
    async writeImageFromDataUrl(projectId, imageId, fileName, dataUrl) {
      const buffer = Buffer.from(String(dataUrl).split(",")[1] || "", "base64");
      return this.writeImageBuffer(projectId, imageId, fileName, buffer, {
        mimeType: String(dataUrl).slice(5, String(dataUrl).indexOf(";")),
      });
    },
    async writeImageBuffer(projectId, imageId, fileName, buffer, options = {}) {
      const safeFileName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
      const relativePath = `images/${imageId}_${safeFileName}`;
      imageWrites.push({ projectId, imageId, fileName, relativePath, buffer });
      files.set(`${projectId}/${relativePath}`, buffer);
      return {
        buffer,
        relativePath,
        archivePath: relativePath,
        mimeType: options.mimeType || "image/png",
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
    async writeMaskBuffer(projectId, imageId, buffer, options = {}) {
      const relativePath = `masks/${options.fileName || `${imageId}_mask.png`}`;
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

async function loginHeaders(route, userId = "admin", password = `${userId}123`) {
  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: userId,
    password,
  }, {});
  assert.equal(login.statusCode, 201);
  return { authorization: `Bearer ${login.body.session.token}` };
}

async function callJson(route, method, pathname, body, headers = {}) {
  const response = await callRoute(route, method, pathname, body, headers);
  return {
    ...response,
    body: response.text ? JSON.parse(response.text) : null,
  };
}

async function callRoute(route, method, pathname, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body || {}));
  const request = Readable.from([payload]);
  request.method = method;
  request.headers = { host: "localhost:4173", ...headers };
  request.url = pathname;

  const response = createMemoryResponse();
  await route(request, response, new URL(pathname, "http://localhost:4173"));
  return response.result();
}

function authHeaders(role = "admin", userId = `${role}-1`) {
  return {
    "x-user-role": role,
    "x-user-id": userId,
  };
}

function sanitizeTestId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
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

function createMultipartBody(boundary, parts) {
  const chunks = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.fileName) {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"\r\n`));
      chunks.push(Buffer.from(`Content-Type: ${part.contentType || "application/octet-stream"}\r\n\r\n`));
      chunks.push(Buffer.from(part.value));
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
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
