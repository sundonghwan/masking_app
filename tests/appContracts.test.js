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
  assert.match(html, /id="dashboardScreen"/);
  assert.match(html, /id="workbenchScreen"/);
  assert.match(html, /id="workbenchProjectsButton"/);
  assert.match(html, /id="workbenchDashboardButton"/);
  assert.match(html, /id="sessionPassword"/);
  assert.match(html, /id="projectCreateForm"/);
  assert.match(html, /id="projectCreateId"/);
  assert.match(html, /id="projectCreateName"/);
  assert.match(html, /id="projectCreateLabelSchema"/);
  assert.match(html, /id="createProjectButton"/);
  assert.match(html, /id="projectSummaryList"/);
  assert.match(html, /id="editorCanvas"/);
  assert.match(app, /function routeToScreen\(/);
  assert.match(app, /workbenchProjectsButton\.addEventListener\("click", \(\) => routeToScreen\(SCREENS\.PROJECTS\)\)/);
  assert.match(app, /workbenchDashboardButton\.addEventListener\("click", \(\) => routeToScreen\(SCREENS\.DASHBOARD\)\)/);
  assert.match(app, /function currentScreen\(/);
  assert.match(app, /function canEnterWorkbench\(/);
  assert.match(app, /function renderDashboard\(/);
  assert.match(app, /createDashboardSummary/);
  assert.match(app, /function createProjectFromForm\(/);
  assert.match(app, /function normalizeProjectId\(/);
  assert.doesNotMatch(app, /openDefaultProjectButton/);
  assert.doesNotMatch(app, /function openDefaultProject\(/);
});

test("assignment controls use user-directory backed pickers", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../src/api/client.js", import.meta.url), "utf8");

  assert.match(html, /<select class="select" id="assignmentWorkerId"/);
  assert.match(html, /<select class="select" id="assignmentReviewerId"/);
  assert.match(app, /function refreshAssignmentUsers\(/);
  assert.match(app, /apiClient\.listUsers\(\{ role: ROLES\.WORKER \}\)/);
  assert.match(app, /apiClient\.listUsers\(\{ role: ROLES\.REVIEWER \}\)/);
  assert.match(api, /listUsers\(options = \{\}\)/);
});

test("browser upload validation uses active project upload policy", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(app, /uploadPolicy: \{ \.\.\.UPLOAD_POLICY \}/);
  assert.match(app, /validateBrowserUploadFile\(file, state\.uploadPolicy\)/);
  assert.match(app, /state\.uploadPolicy = normalizeUploadPolicy\(manifest\.upload_policy/);
  assert.match(app, /uploadPolicy: state\.uploadPolicy/);
  assert.match(app, /state\.uploadPolicy = normalizeUploadPolicy\(saved\.uploadPolicy \|\| \{\}, UPLOAD_POLICY\)/);
  assert.match(app, /formatBytes\(state\.uploadPolicy\.maxFileBytes\)/);
});

test("dashboard screen has a full-width layout contract", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /class="screen-panel dashboard-panel"/);
  assert.match(html, /id="dashboardReviewQuality"/);
  assert.match(styles, /\.dashboard-panel\s*\{/);
  assert.match(styles, /width: min\(1120px, 100%\)/);
  assert.match(styles, /\.compact-dashboard\s*\{/);
  assert.match(styles, /grid-template-columns: minmax\(220px, 280px\) minmax\(0, 1fr\) minmax\(260px, 320px\)/);
  assert.match(styles, /\.compact-dashboard \.panel-section\s*\{/);
});

test("server-first restore can fetch image and mask files into local recovery", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../src/api/client.js", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../src/server/api.js", import.meta.url), "utf8");

  assert.match(api, /getProjectFileBlob\(projectId, relativePath\)/);
  assert.match(app, /function restoreServerImageBlob\(/);
  assert.match(app, /function restoreServerMaskBlob\(/);
  assert.match(app, /projectStore\.saveImageBlob/);
  assert.match(app, /projectStore\.saveMaskBlob/);
  assert.match(server, /parts\[1\] === "files"/);
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
  assert.match(html, /id="reviseButton"[^>]+data-role-panel="admin worker"/);
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

test("discovery controls expose image search and operational filters", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="imageSearchInput"[^>]+type="search"/);
  assert.match(html, /data-filter="not_started"/);
  assert.match(html, /data-filter="sync_needed"/);
  assert.match(html, /data-filter="deleted"/);
  assert.match(app, /imageSearch: ""/);
  assert.match(app, /els\.imageSearchInput\.addEventListener\("input"/);
  assert.match(app, /function filterImagesByDiscovery\(/);
  assert.match(app, /syncNeededOnly: state\.filter === "sync_needed"/);
  assert.match(app, /hasSyncIssue\(image\)/);
  assert.match(app, /function toggleImageRemoval\(imageId\)/);
  assert.match(app, /apiClient\.removeImage\(state\.projectId, image\.id/);
  assert.match(app, /apiClient\.restoreImage\(state\.projectId, image\.id\)/);
  assert.match(app, /function activeImages\(\)/);
  assert.match(app, /const listScroll = captureImageListScroll\(\)/);
  assert.match(app, /restoreImageListScroll\(listScroll\)/);
  assert.match(app, /function captureImageListScroll\(\)/);
  assert.match(app, /function restoreImageListScroll\(position\)/);
});

test("workbench exposes version settings account and training operations", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="taskSelector"/);
  assert.match(html, /id="versionSelector"/);
  assert.match(html, /id="cloneVersionButton"/);
  assert.match(html, /id="deleteVersionButton"/);
  assert.match(html, /id="restoreVersionButton"/);
  assert.match(html, /id="purgeVersionButton"/);
  assert.match(html, /id="trainingSourcePicker"/);
  assert.match(html, /id="trainingExportButton"/);
  assert.match(html, /id="trainingSetId"/);
  assert.match(html, /id="trainingSetName"/);
  assert.match(html, /id="trainingSplitTrain"/);
  assert.match(html, /id="trainingSetList"/);
  assert.match(html, /id="createTrainingSetButton"/);
  assert.match(html, /id="includeDeletedTrainingSets"/);
  assert.match(html, /id="settingsProjectName"/);
  assert.match(html, /id="settingsProjectDescription"/);
  assert.match(html, /id="settingsLabelSchema"/);
  assert.match(html, /id="saveProjectSettingsButton"/);
  assert.match(html, /id="saveUserButton"/);
  assert.match(app, /taskId: DEFAULT_TASK_ID/);
  assert.match(app, /versionId: DEFAULT_VERSION_ID/);
  assert.match(app, /function refreshVersionContext\(/);
  assert.match(app, /apiClient\.cloneTaskVersion/);
  assert.match(app, /apiClient\.purgeTaskVersion/);
  assert.match(app, /apiClient\.updateProjectSettings/);
  assert.match(app, /apiClient\.listTrainingSets/);
  assert.match(app, /apiClient\.createTrainingSet/);
  assert.match(app, /apiClient\.archiveTrainingSet/);
  assert.match(app, /apiClient\.restoreTrainingSet/);
  assert.match(app, /apiClient\.downloadTrainingSetExport/);
  assert.match(app, /apiClient\.createUser/);
  assert.match(app, /apiClient\.updateUser/);
});

test("workbench exposes class label selection for mask tools", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="labelSelector"/);
  assert.match(html, /id="imageAnnotationList"/);
  assert.match(html, /id="labelMessage"/);
  assert.match(html, /id="maskColorSwatch"/);
  assert.match(app, /selectedClassId/);
  assert.match(app, /labelSchema/);
  assert.match(app, /function renderLabelSelector\(/);
  assert.match(app, /function selectClassLabel\(/);
  assert.match(app, /function selectedLabelAnnotation\(/);
  assert.match(app, /function applySelectedLabelColor\(/);
  assert.match(app, /function saveEditorMaskForSelectedClass\(/);
  assert.match(app, /function loadSelectedClassMaskIntoEditor\(/);
  assert.match(app, /function localExportMaskBlobForAnnotation\(/);
  assert.match(app, /annotationMaskBlobKey\(image\.id, state\.selectedClassId\)/);
  assert.match(app, /annotationMaskBlobKey\(image\.id, annotation\.class_id\)/);
  assert.match(app, /upsertAnnotationRecord\(image\.annotations/);
  assert.match(app, /editor\.setOverlayColor\(color\)/);
  assert.match(app, /els\.maskColorSwatch\.style\.backgroundColor = color/);
  assert.match(app, /normalizeLabelSchema\(manifest\.label_schema/);
  assert.match(app, /labelSchema: state\.labelSchema/);
  assert.match(app, /function parseLabelSchemaText\(/);
  assert.match(app, /function formatLabelSchemaText\(/);
  assert.match(app, /parseLabelSchemaText\(els\.settingsLabelSchema\.value\)/);
});

test("project management exposes edit archive restore and purge controls", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../src/api/client.js", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../src/server/api.js", import.meta.url), "utf8");

  assert.match(html, /id="includeDeletedProjects"/);
  assert.match(app, /function editProjectFromSummary\(/);
  assert.match(app, /function archiveProjectFromSummary\(/);
  assert.match(app, /function restoreProjectFromSummary\(/);
  assert.match(app, /function purgeProjectFromSummary\(/);
  assert.match(app, /apiClient\.archiveProject/);
  assert.match(app, /apiClient\.restoreProject/);
  assert.match(app, /apiClient\.purgeProject/);
  assert.match(api, /archiveProject\(projectId/);
  assert.match(api, /restoreProject\(projectId/);
  assert.match(api, /purgeProject\(projectId/);
  assert.match(server, /include_deleted/);
  assert.match(server, /project_not_archived/);
});

test("project discovery searches full server project list without four item cap", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="projectSearchInput"[^>]+type="search"/);
  assert.match(app, /projectSearch: ""/);
  assert.match(app, /els\.projectSearchInput\.addEventListener\("input"/);
  assert.match(app, /function filterProjectsBySearch\(/);
  assert.match(app, /const filteredProjects = filterProjectsBySearch\(state\.projectSummaries \|\| \[\], state\.projectSearch\)/);
  assert.doesNotMatch(app, /projectSummaries \|\| \[\]\)\.slice\(0,\s*4\)/);
  assert.doesNotMatch(app, /\.slice\(0,\s*4\)\.map\(\(project\)/);
});

test("submitted revision flow records audit and removes exportable status", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../src/api/client.js", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../src/server/api.js", import.meta.url), "utf8");

  assert.match(app, /function startRevisionMode\(/);
  assert.match(app, /action: "revision_start"/);
  assert.match(app, /status = "in_progress"/);
  assert.match(app, /pending_revision_event/);
  assert.match(api, /revision_event/);
  assert.match(server, /function normalizeRevisionEvent/);
});

test("review UI sends structured rejection reason codes into quality summaries", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../src/api/client.js", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../src/server/api.js", import.meta.url), "utf8");

  assert.match(html, /id="reviewReasonCode"/);
  assert.match(html, /value="rough_boundary"/);
  assert.match(app, /reviewReasonCode: REJECTION_REASON_CODES\.ROUGH_BOUNDARY/);
  assert.match(app, /reasonCode: state\.reviewReasonCode/);
  assert.match(app, /dashboardReviewQuality\.replaceChildren/);
  assert.match(api, /reason_code: input\.reasonCode \|\| input\.reason_code/);
  assert.match(server, /reason_code: body\.reason_code \|\| body\.reasonCode/);
});

test("zoomed image pan controls use viewport movement without mask save", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../src/editor/maskEditor.js", import.meta.url), "utf8");

  assert.match(app, /panDeltaForKey/);
  assert.match(app, /editor\.panBy\(panDelta\.dx, panDelta\.dy\)/);
  assert.match(editor, /export function panDeltaForKey/);
  assert.match(editor, /panBy\(deltaX, deltaY\)/);
});

test("magic click tool is local deterministic mask assist", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../src/editor/maskEditor.js", import.meta.url), "utf8");

  assert.match(html, /data-tool="magic"/);
  assert.match(html, /매직 W/);
  assert.match(html, /id="magicTolerance"/);
  assert.match(html, /id="magicEdge"/);
  assert.match(app, /key === "w"/);
  assert.match(app, /setMagicOptions/);
  assert.match(editor, /function selectEdgeAwareRegionFromImageData/);
  assert.match(editor, /createEdgeMagnitudeMap/);
  assert.match(editor, /setMagicOptions/);
  assert.match(editor, /magicSelectAt\(point/);
  assert.doesNotMatch(editor, /fetch\(|\/api\/.*magic|segmentation/i);
});

test("spacebar temporarily pans without switching the selected tool", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../src/editor/maskEditor.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /이동 Space/);
  assert.match(styles, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(app, /event\.code === "Space"/);
  assert.match(app, /activateSpacePan/);
  assert.match(app, /deactivateSpacePan/);
  assert.match(app, /handleShortcutRelease/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /setCameraPanOverride\(true\)/);
  assert.match(app, /clearCameraPanOverride\(\)/);
  assert.match(app, /이동 모드 Space/);
  assert.match(editor, /setCameraPanOverride\(active\)/);
  assert.match(editor, /isCameraPanActive\(\)/);
  assert.match(editor, /beginCameraPan\(event\)/);
  assert.match(editor, /activePointerMode = "camera_pan"/);
  assert.doesNotMatch(editor, /this\.tool === "pan" \|\| this\.temporaryPanActive/);
  assert.doesNotMatch(app, /setTool\("pan"\).*Space/s);
});

test("workbench exposes previous-frame mask copy and mask move adjustment", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../src/editor/maskEditor.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="copyPreviousMaskButton"/);
  assert.match(html, /data-tool="mask_move"/);
  assert.match(html, /마스크 이동/);
  assert.match(app, /copyMaskFromPreviousImage/);
  assert.match(app, /previousMaskSourceImage/);
  assert.match(app, /Shift \+ V/);
  assert.match(app, /setTool\("mask_move"\)/);
  assert.match(editor, /replaceMaskFromImageData/);
  assert.match(editor, /beginMaskMove/);
  assert.match(editor, /activePointerMode = "mask_move"/);
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
