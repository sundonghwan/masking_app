import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildAnnotations,
  createImageRecord,
  createProjectRecord,
  serializeJson,
  validateExportItem,
} from "../src/export/exporter.js";
import {
  DEFAULT_ACTORS,
  DEFAULT_PROJECT,
  DEFAULT_SESSION,
  findMvpUser,
  userHasRole,
} from "../src/config/runtimeDefaults.js";
import { validateMvpCredentials } from "../src/server/auth.js";

const NOW = "2026-04-29T03:00:00.000Z";

test("runtime defaults expose explicit MVP project and actor fallbacks", () => {
  assert.equal(DEFAULT_PROJECT.id, "mask_project_001");
  assert.equal(DEFAULT_PROJECT.name, "Masking Project");
  assert.equal(DEFAULT_ACTORS.admin, "admin");
  assert.equal(DEFAULT_ACTORS.worker, "worker");
  assert.equal(DEFAULT_ACTORS.reviewer, "reviewer");
  assert.equal(DEFAULT_SESSION.user_id, "admin");
  assert.equal(DEFAULT_SESSION.role, "admin");
});

test("MVP users validate credentials and expose server-owned roles", () => {
  const admin = validateMvpCredentials({ userId: "admin", password: "admin123" });
  assert.equal(admin.user_id, "admin");
  assert.equal(admin.role, "admin");

  assert.equal(validateMvpCredentials({ userId: "admin", password: "bad" }), null);
  assert.equal(findMvpUser("worker").role, "worker");
  assert.equal(userHasRole("reviewer", "reviewer"), true);
  assert.equal(userHasRole("reviewer", "worker"), false);
});

test("browser-imported runtime defaults do not expose valid MVP passwords", () => {
  const defaultsModule = fs.readFileSync(new URL("../src/config/runtimeDefaults.js", import.meta.url), "utf8");

  assert.doesNotMatch(defaultsModule, /admin123|worker123|reviewer123/);
});

test("operation session UI uses credential login and derived reviewer identity", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="sessionPassword"/);
  assert.match(html, /id="sessionRoleLabel"[^>]+readonly/);
  assert.doesNotMatch(html, /id="sessionRole"/);
  assert.doesNotMatch(html, /id="reviewerId"/);
  assert.match(app, /function getReviewActorId\(\)/);
  assert.match(app, /ensureAuthenticatedSession\(\)/);
  assert.doesNotMatch(app, /reviewerId: state\.reviewerId/);
});

test("screen flow separates login projects and workbench", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="loginScreen"/);
  assert.match(html, /id="projectsScreen"/);
  assert.match(html, /id="workbenchScreen"/);
  assert.match(html, /id="sessionPassword"/);
  assert.match(html, /id="projectCreateForm"/);
  assert.match(html, /id="projectCreateId"/);
  assert.match(html, /id="projectCreateName"/);
  assert.match(html, /id="createProjectButton"/);
  assert.match(html, /id="projectSummaryList"/);
  assert.match(html, /id="editorCanvas"/);
  assert.match(app, /function routeToScreen\(/);
  assert.match(app, /function currentScreen\(/);
  assert.match(app, /function canEnterWorkbench\(/);
  assert.match(app, /function createProjectFromForm\(/);
  assert.match(app, /function normalizeProjectId\(/);
  assert.doesNotMatch(app, /openDefaultProjectButton/);
  assert.doesNotMatch(app, /function openDefaultProject\(/);
});

test("login controls are not embedded in the workbench inspector", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const inspectorStart = html.indexOf('<aside class="sidebar inspector"');
  const inspectorEnd = html.indexOf("</aside>", inspectorStart);
  const inspector = html.slice(inspectorStart, inspectorEnd);

  assert.equal(inspector.includes("sessionPassword"), false);
  assert.equal(inspector.includes("loginButton"), false);
  assert.equal(inspector.includes("logoutButton"), false);
});

test("workbench actions are role-marked and shortcut gated to workbench", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="uploadDropzone"[^>]+data-role-panel="admin worker"/);
  assert.match(html, /id="downloadMaskButton"[^>]+data-role-panel="admin worker"/);
  assert.match(html, /id="submitButton"[^>]+data-role-panel="admin worker"/);
  assert.match(html, /id="exportButton"[^>]+data-role-panel="admin reviewer"/);
  assert.match(app, /currentScreen\(\) !== SCREENS\.WORKBENCH/);
});

test("assignment queue controls expose per-user task lists", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /data-queue="all"/);
  assert.match(html, /data-queue="my_work"/);
  assert.match(html, /data-queue="my_review"/);
  assert.match(html, /id="queueWorkCount"/);
  assert.match(html, /id="queueReviewCount"/);
  assert.match(app, /filterImagesForQueue/);
  assert.match(app, /summarizeAssignmentQueue/);
  assert.match(app, /queueMode: QUEUE_MODES\.ALL/);
});

test("project creation replaces default project entry path", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="projectCreateForm"[^>]+data-role-panel="admin"/);
  assert.match(app, /projectId: ""/);
  assert.match(app, /프로젝트를 먼저 생성하거나 열어야 합니다/);
  assert.doesNotMatch(app, /projectId: DEFAULT_PROJECT\.id/);
});

function createRestoredSubmittedRecord(overrides = {}) {
  return createImageRecord(
    {
      id: "image-0001",
      projectId: "mask_project_001",
      originalFileName: "rail crack 001.png",
      imagePath: "images/rail_crack_001.png",
      maskPath: "masks/rail_crack_001_mask.png",
      width: 1280,
      height: 720,
      maskWidth: 1280,
      maskHeight: 720,
      maskValuesValid: true,
      maskRatio: 0.14,
      status: "submitted",
      submittedAt: NOW,
      ...overrides,
    },
    { now: NOW },
  );
}

test("image records can be serialized without File objects or object URLs", () => {
  const record = createRestoredSubmittedRecord();

  assert.equal(record.object_url, "");
  assert.equal(Object.hasOwn(record, "file"), false);

  const serialized = serializeJson(record);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.id, "image-0001");
  assert.equal(parsed.image_path, "images/rail_crack_001.png");
  assert.equal(parsed.current_mask_path, "masks/rail_crack_001_mask.png");
  assert.equal(parsed.object_url, "");
  assert.equal(Object.hasOwn(parsed, "file"), false);
  assert.equal(serialized.includes("blob:"), false);
});

test("restored image metadata can be rehydrated with object URLs outside persistence", () => {
  const persisted = JSON.parse(serializeJson(createRestoredSubmittedRecord()));

  const rehydrated = createImageRecord(
    {
      ...persisted,
      objectUrl: "blob:rehydrated-image",
    },
    { now: NOW },
  );

  assert.equal(persisted.object_url, "");
  assert.equal(rehydrated.object_url, "blob:rehydrated-image");
  assert.equal(rehydrated.image_path, "images/rail_crack_001.png");
  assert.equal(rehydrated.current_mask_path, "masks/rail_crack_001_mask.png");
});

test("export validation accepts restored submitted records without runtime handles", () => {
  const project = createProjectRecord({ id: "mask_project_001", name: "Rail Masks" }, { now: NOW });
  const restored = JSON.parse(serializeJson(createRestoredSubmittedRecord()));

  const validation = validateExportItem(restored);
  const annotations = buildAnnotations({
    projectId: project.id,
    images: [restored],
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.reasons, []);
  assert.equal(validation.checks.notEmpty, true);
  assert.equal(validation.checks.pixelValues, true);
  assert.deepEqual(annotations.annotations, [
    {
      image_id: "image-0001",
      original_file_name: "rail crack 001.png",
      image_path: "images/rail_crack_001.png",
      mask_path: "masks/rail_crack_001_mask.png",
      width: 1280,
      height: 720,
      status: "submitted",
      submitted_at: NOW,
    },
  ]);
});
