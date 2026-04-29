import { createMaskingApiClient, normalizeApiError } from "./api/client.js";
import { MaskEditor } from "./editor/maskEditor.js";
import {
  buildAnnotations,
  buildExportSummary,
  createExportPaths,
  createImageRecord,
  downloadBlob,
  validateExportItem,
} from "./export/exporter.js";
import { createZipBlob } from "./export/zip.js";
import { createLogger } from "./observability/logger.js";
import { QUEUE_MODES, filterImagesForQueue, normalizeQueueMode, summarizeAssignmentQueue } from "./assignment/queue.js";
import { REVIEW_ACTIONS, applyReviewTransition, normalizeReviewerId, reviewReasonLabel } from "./review/policy.js";
import { createProjectStore } from "./storage/projectStore.js";
import { UPLOAD_POLICY, formatBytes, uploadReasonLabel, validateBrowserUploadFile } from "./upload/policy.js";
import { DEFAULT_ACTORS, DEFAULT_SESSION, ROLES, normalizeRole } from "./config/runtimeDefaults.js";

const SCREENS = {
  LOGIN: "login",
  PROJECTS: "projects",
  WORKBENCH: "workbench",
};

const state = {
  projectId: "",
  projectName: "",
  images: [],
  selectedId: null,
  filter: "all",
  queueMode: QUEUE_MODES.ALL,
  savedAt: null,
  autosaveTimer: null,
  backendProjectReady: false,
  uploadRejections: [],
  sessionUserId: DEFAULT_SESSION.user_id,
  sessionPassword: "",
  sessionRole: DEFAULT_SESSION.role,
  sessionToken: "",
  sessionAuthenticated: false,
  reviewReasonDraft: "",
  assignmentWorkerId: DEFAULT_ACTORS.worker,
  assignmentReviewerId: DEFAULT_ACTORS.reviewer,
  exportApprovedOnly: false,
  projectSummaries: [],
  projectSummariesError: "",
  projectCreateId: "",
  projectCreateName: "",
  projectCreateMessage: "",
};

const apiClient = createMaskingApiClient({
  getSession: () => ({
    userId: state.sessionUserId,
    role: state.sessionRole,
    token: state.sessionToken,
  }),
});
const logger = createLogger({ component: "frontend" });
const projectStore = createProjectStore();

const els = {
  loginScreen: document.querySelector("#loginScreen"),
  projectsScreen: document.querySelector("#projectsScreen"),
  workbenchScreen: document.querySelector("#workbenchScreen"),
  imageInput: document.querySelector("#imageInput"),
  uploadDropzone: document.querySelector("#uploadDropzone"),
  uploadRejections: document.querySelector("#uploadRejections"),
  refreshProjectsButton: document.querySelector("#refreshProjectsButton"),
  projectCreateForm: document.querySelector("#projectCreateForm"),
  projectCreateId: document.querySelector("#projectCreateId"),
  projectCreateName: document.querySelector("#projectCreateName"),
  createProjectButton: document.querySelector("#createProjectButton"),
  projectCreateMessage: document.querySelector("#projectCreateMessage"),
  projectSummaryList: document.querySelector("#projectSummaryList"),
  projectName: document.querySelector("#projectName"),
  imageList: document.querySelector("#imageList"),
  progressText: document.querySelector("#progressText"),
  queueAllCount: document.querySelector("#queueAllCount"),
  queueWorkCount: document.querySelector("#queueWorkCount"),
  queueReviewCount: document.querySelector("#queueReviewCount"),
  editorCanvas: document.querySelector("#editorCanvas"),
  emptyState: document.querySelector("#emptyState"),
  saveStatus: document.querySelector("#saveStatus"),
  saveDot: document.querySelector("#saveDot"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  downloadMaskButton: document.querySelector("#downloadMaskButton"),
  reviseButton: document.querySelector("#reviseButton"),
  submitButton: document.querySelector("#submitButton"),
  exportButton: document.querySelector("#exportButton"),
  clearProjectButton: document.querySelector("#clearProjectButton"),
  fitButton: document.querySelector("#fitButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  brushSize: document.querySelector("#brushSize"),
  brushSizeValue: document.querySelector("#brushSizeValue"),
  overlayOpacity: document.querySelector("#overlayOpacity"),
  opacityValue: document.querySelector("#opacityValue"),
  displayMode: document.querySelector("#displayMode"),
  validationList: document.querySelector("#validationList"),
  metaImageId: document.querySelector("#metaImageId"),
  metaFilename: document.querySelector("#metaFilename"),
  metaSize: document.querySelector("#metaSize"),
  metaStatus: document.querySelector("#metaStatus"),
  sessionUserId: document.querySelector("#sessionUserId"),
  sessionPassword: document.querySelector("#sessionPassword"),
  sessionRoleLabel: document.querySelector("#sessionRoleLabel"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  sessionMessage: document.querySelector("#sessionMessage"),
  assignmentWorkerId: document.querySelector("#assignmentWorkerId"),
  assignmentReviewerId: document.querySelector("#assignmentReviewerId"),
  assignButton: document.querySelector("#assignButton"),
  assignmentMessage: document.querySelector("#assignmentMessage"),
  reviewerIdentitySummary: document.querySelector("#reviewerIdentitySummary"),
  reviewDetailLink: document.querySelector("#reviewDetailLink"),
  reviewReason: document.querySelector("#reviewReason"),
  approveButton: document.querySelector("#approveButton"),
  rejectButton: document.querySelector("#rejectButton"),
  reworkButton: document.querySelector("#reworkButton"),
  reviewMessage: document.querySelector("#reviewMessage"),
  approvedOnlyExport: document.querySelector("#approvedOnlyExport"),
  exportIncludedCount: document.querySelector("#exportIncludedCount"),
  exportExcludedCount: document.querySelector("#exportExcludedCount"),
  exportErrorList: document.querySelector("#exportErrorList"),
  exportFilePreview: document.querySelector("#exportFilePreview"),
  exportPolicyMessage: document.querySelector("#exportPolicyMessage"),
  syncProjectStatus: document.querySelector("#syncProjectStatus"),
  syncImageStatus: document.querySelector("#syncImageStatus"),
  syncMaskStatus: document.querySelector("#syncMaskStatus"),
  syncExportStatus: document.querySelector("#syncExportStatus"),
  syncMessage: document.querySelector("#syncMessage"),
  retrySyncButton: document.querySelector("#retrySyncButton"),
  statusImageIndex: document.querySelector("#statusImageIndex"),
  statusZoom: document.querySelector("#statusZoom"),
  statusCoords: document.querySelector("#statusCoords"),
  statusMask: document.querySelector("#statusMask"),
  statusSavedAt: document.querySelector("#statusSavedAt"),
};

const editor = new MaskEditor(els.editorCanvas, {
  brushSize: Number(els.brushSize.value),
  overlayOpacity: Number(els.overlayOpacity.value) / 100,
  onChange: handleEditorChange,
  onViewportChange: updateStatusbar,
  onPointerMove: updatePointerStatus,
});

void init();

async function init() {
  resizeEditorCanvas();
  await restoreProject();
  await validateRestoredSession();
  routeToInitialScreen();
  bindEvents();
  if (canEnterProjects()) {
    void refreshProjectSummaries();
  }
  render();
  renderScreen();

  if (state.images.length > 0) {
    const routeImageId = getReviewImageIdFromHash();
    const initialImageId = state.images.some((image) => image.id === routeImageId)
      ? routeImageId
      : state.selectedId || state.images[0].id;
    await selectImage(initialImageId, { updateRoute: false });
  }
  updateReviewRouteLink();
}

function routeToInitialScreen() {
  if (window.location.hash) {
    renderScreen();
    return;
  }
  if (canEnterWorkbench()) {
    routeToScreen(SCREENS.WORKBENCH);
  } else if (canEnterProjects()) {
    routeToScreen(SCREENS.PROJECTS);
  } else {
    routeToScreen(SCREENS.LOGIN);
  }
}

function bindEvents() {
  els.imageInput.addEventListener("change", (event) => {
    void handleFiles(event.target.files);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((type) => {
    els.uploadDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.uploadDropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    els.uploadDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.uploadDropzone.classList.remove("drag-over");
    });
  });

  els.uploadDropzone.addEventListener("drop", (event) => {
    void handleFiles(event.dataTransfer.files);
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      render();
    });
  });

  document.querySelectorAll("[data-queue]").forEach((button) => {
    button.addEventListener("click", () => {
      state.queueMode = normalizeQueueMode(button.dataset.queue);
      void persistProject();
      render();
    });
  });

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      setTool(button.dataset.tool);
    });
  });

  els.brushSize.addEventListener("input", () => {
    const size = Number(els.brushSize.value);
    els.brushSizeValue.textContent = String(size);
    editor.setBrushSize(size);
  });

  els.overlayOpacity.addEventListener("input", () => {
    const opacity = Number(els.overlayOpacity.value);
    els.opacityValue.textContent = `${opacity}%`;
    editor.setOverlayOpacity(opacity / 100);
  });

  els.displayMode.addEventListener("change", () => {
    editor.setDisplayMode(els.displayMode.value);
  });

  els.undoButton.addEventListener("click", () => {
    editor.undo();
    handleEditorChange();
  });

  els.redoButton.addEventListener("click", () => {
    editor.redo();
    handleEditorChange();
  });

  els.fitButton.addEventListener("click", () => editor.fitToCanvas());
  els.zoomInButton.addEventListener("click", () => editor.zoomBy(1.2));
  els.zoomOutButton.addEventListener("click", () => editor.zoomBy(0.85));
  els.downloadMaskButton.addEventListener("click", () => void saveCurrentMask());
  els.reviseButton.addEventListener("click", () => void startSelectedRevision());
  els.submitButton.addEventListener("click", () => void submitCurrentImage());
  els.exportButton.addEventListener("click", () => void exportProject());
  els.clearProjectButton.addEventListener("click", clearProject);
  els.retrySyncButton.addEventListener("click", () => void retrySelectedSync());
  els.refreshProjectsButton.addEventListener("click", () => void refreshProjectSummaries());
  els.projectCreateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void createProjectFromForm();
  });
  els.projectCreateId.addEventListener("input", () => {
    state.projectCreateId = els.projectCreateId.value;
    renderProjectCreateForm();
  });
  els.projectCreateName.addEventListener("input", () => {
    state.projectCreateName = els.projectCreateName.value;
    renderProjectCreateForm();
  });
  els.loginButton.addEventListener("click", () => void loginSession());
  els.logoutButton.addEventListener("click", () => void logoutSession());
  els.approveButton.addEventListener("click", () => void reviewSelectedImage(REVIEW_ACTIONS.APPROVE));
  els.rejectButton.addEventListener("click", () => void reviewSelectedImage(REVIEW_ACTIONS.REJECT));
  els.reworkButton.addEventListener("click", () => void reviewSelectedImage(REVIEW_ACTIONS.REWORK));
  els.assignButton.addEventListener("click", () => void assignSelectedImage());
  els.sessionUserId.addEventListener("input", () => {
    state.sessionUserId = normalizeActorId(els.sessionUserId.value);
    state.sessionToken = "";
    state.sessionAuthenticated = false;
    void persistProject();
    render();
  });
  els.sessionPassword.addEventListener("input", () => {
    state.sessionPassword = els.sessionPassword.value;
    state.sessionToken = "";
    state.sessionAuthenticated = false;
    render();
  });
  els.assignmentWorkerId.addEventListener("input", () => {
    state.assignmentWorkerId = normalizeActorId(els.assignmentWorkerId.value);
    void persistProject();
  });
  els.assignmentReviewerId.addEventListener("input", () => {
    state.assignmentReviewerId = normalizeActorId(els.assignmentReviewerId.value);
    void persistProject();
  });
  els.reviewReason.addEventListener("input", () => {
    state.reviewReasonDraft = els.reviewReason.value;
  });
  els.approvedOnlyExport.addEventListener("change", () => {
    state.exportApprovedOnly = els.approvedOnlyExport.checked;
    void persistProject();
    render();
  });

  window.addEventListener("hashchange", () => {
    renderScreen();
    void applyRouteFromHash();
  });
  window.addEventListener("keydown", handleShortcut);
  window.addEventListener("resize", resizeEditorCanvas);

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(resizeEditorCanvas);
    observer.observe(document.querySelector("#canvasStage"));
  }
}

function resizeEditorCanvas() {
  const stage = document.querySelector("#canvasStage");
  const rect = stage.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(240, Math.floor(rect.height));

  if (els.editorCanvas.width === width && els.editorCanvas.height === height) {
    return;
  }

  els.editorCanvas.width = width;
  els.editorCanvas.height = height;
  editor.fitToCanvas();
}

async function handleFiles(fileList) {
  state.uploadRejections = [];
  if (!state.projectId) {
    setSaveState("failed", "프로젝트를 먼저 생성하거나 열어야 합니다");
    routeToScreen(SCREENS.PROJECTS);
    return;
  }

  const candidates = Array.from(fileList || []);
  const files = [];

  for (const file of candidates) {
    const validation = validateBrowserUploadFile(file);
    if (validation.valid) {
      files.push(file);
      continue;
    }
    state.uploadRejections.push({
      fileName: file?.name || "이름 없는 파일",
      sizeBytes: Number(file?.size || 0),
      reasons: validation.reasons,
    });
  }

  renderUploadRejections();

  if (files.length === 0) {
    setSaveState("failed", state.uploadRejections.length > 0 ? "업로드 거절됨" : "이미지 파일 없음");
    return;
  }

  for (const file of files) {
    const record = await createImageRecord(file, {
      index: state.images.length + 1,
      projectId: state.projectId,
    });
    await projectStore.saveImageBlob(record.id, file);
    state.images.push(record);
    void syncUploadedImage(record, file);
  }

  await persistProject();
  render();
  await selectImage(state.images.at(-files.length).id);
  setSaveState("saved", state.uploadRejections.length > 0 ? "일부 업로드 완료" : "업로드 완료");
}

async function selectImage(imageId, options = {}) {
  const image = state.images.find((item) => item.id === imageId);
  if (!image) return;

  state.selectedId = image.id;
  state.reviewReasonDraft = image.reject_reason || "";
  state.assignmentWorkerId = image.worker_id || state.assignmentWorkerId;
  state.assignmentReviewerId = image.reviewer_id || state.assignmentReviewerId;
  if (options.markInProgress !== false) {
    image.status = image.status === "not_started" ? "in_progress" : image.status;
  }
  setSaveState("saving", "이미지 로딩");
  await ensureObjectUrls(image);
  if (!image.objectUrl && options.allowMissingBlob) {
    editor.clear();
    els.emptyState.hidden = false;
    await persistProject();
    render();
    updateReviewRouteLink();
    setSaveState("failed", "서버 manifest만 로드됨");
    return;
  }
  await editor.loadImage(image.objectUrl, image.maskDataUrl || image.maskObjectUrl);
  els.emptyState.hidden = true;
  await persistProject();
  render();
  if (options.updateRoute !== false) {
    updateReviewRoute(image.id);
  } else {
    updateReviewRouteLink();
  }
  setSaveState("saved", "로드됨");
}

async function refreshProjectSummaries() {
  try {
    const response = await apiClient.listProjects();
    state.projectSummaries = Array.isArray(response.projects) ? response.projects : [];
    state.projectSummariesError = "";
    renderProjectSummaries();
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.projectSummariesError = normalized.message;
    logger.warn("project.list.failed", {
      project_id: state.projectId,
      error: normalized,
    });
    renderProjectSummaries();
  }
}

async function loginSession() {
  try {
    const response = await apiClient.login({
      userId: state.sessionUserId,
      password: state.sessionPassword,
    });
    const session = response.session || {};
    state.sessionToken = session.token || "";
    state.sessionUserId = session.userId || session.user_id || state.sessionUserId;
    state.sessionRole = normalizeRole(session.role, state.sessionRole);
    state.sessionPassword = "";
    state.sessionAuthenticated = Boolean(state.sessionToken);
    await persistProject();
    render();
    routeToScreen(SCREENS.PROJECTS);
    void refreshProjectSummaries();
    setSaveState("saved", "로그인됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.sessionAuthenticated = false;
    state.sessionToken = "";
    renderSessionPanel();
    setSaveState("failed", `로그인 실패: ${normalized.message}`);
  }
}

async function logoutSession() {
  try {
    if (state.sessionToken) await apiClient.logout();
  } catch (error) {
    logger.warn("session.logout.failed", {
      error: normalizeApiError(error),
    });
  }
  state.sessionToken = "";
  state.sessionAuthenticated = false;
  await persistProject();
  render();
  routeToScreen(SCREENS.LOGIN);
  setSaveState("saved", "로그아웃됨");
}

async function saveCurrentMask() {
  const image = getSelectedImage();
  if (!image) return;

  setSaveState("saving", "저장 중");
  const blob = await editor.exportMaskPngBlob();
  image.maskDataUrl = await blobToDataUrl(blob);
  await projectStore.saveMaskBlob(image.id, blob);
  image.maskPath = `masks/${image.id}_mask.png`;
  image.current_mask_path = image.maskPath;
  image.mask_data_url = image.maskDataUrl;
  image.mask_width = image.width;
  image.mask_height = image.height;
  image.mask_values_valid = true;
  image.maskRatio = editor.getMaskRatio();
  image.mask_ratio = image.maskRatio;
  image.updatedAt = new Date().toISOString();
  state.savedAt = new Date();
  await persistProject();
  await syncMaskToBackend(image, image.maskDataUrl, image.status);
  render();
  downloadBlob(blob, `${image.id}_mask.png`);
  setSaveState("saved", "저장됨");
}

async function submitCurrentImage() {
  const image = getSelectedImage();
  if (!image) return;

  setSaveState("saving", "제출 저장 중");
  const blob = await editor.exportMaskPngBlob();
  image.maskDataUrl = await blobToDataUrl(blob);
  await projectStore.saveMaskBlob(image.id, blob);
  image.maskPath = `masks/${image.id}_mask.png`;
  image.current_mask_path = image.maskPath;
  image.mask_data_url = image.maskDataUrl;
  image.mask_width = image.width;
  image.mask_height = image.height;
  image.mask_values_valid = true;
  image.maskRatio = editor.getMaskRatio();
  image.mask_ratio = image.maskRatio;
  image.status = "submitted";
  image.submittedAt = new Date().toISOString();
  image.updatedAt = image.submittedAt;
  state.savedAt = new Date();
  await persistProject();
  await syncMaskToBackend(image, image.maskDataUrl, "submitted");
  render();
  setSaveState("saved", "제출됨");
}

async function startSelectedRevision() {
  const image = getSelectedImage();
  if (!image) return;
  if (!canStartRevision(image)) {
    setSaveState("failed", "제출 또는 승인 상태만 수정 모드를 시작할 수 있습니다");
    return;
  }
  startRevisionMode(image, { reason: "manual_revision" });
  await persistProject();
  render();
  setSaveState("dirty", "수정 모드 시작됨");
}

function startRevisionMode(image, options = {}) {
  if (!image || !canStartRevision(image)) return null;

  const now = new Date().toISOString();
  const event = {
    action: "revision_start",
    reviewer_id: state.sessionUserId || "",
    reason: options.reason || "mask_revision",
    from_status: image.status,
    to_status: "in_progress",
    created_at: now,
  };
  image.revision_source_status = image.status;
  image.revision_started_at = now;
  image.status = "in_progress";
  image.updatedAt = now;
  image.updated_at = now;
  image.review_events = [...(Array.isArray(image.review_events) ? image.review_events : []), event];
  image.pending_revision_event = event;
  image.review_server_synced = false;
  return event;
}

function canStartRevision(image) {
  return Boolean(image && ["submitted", "approved"].includes(image.status));
}

async function exportProject() {
  const exportState = getExportState();
  const { exportable, validImages } = exportState;

  if (canUseServerExport(validImages)) {
    try {
      const zip = await apiClient.downloadProjectExport(state.projectId, { approvedOnly: state.exportApprovedOnly });
      downloadBlob(zip, `export_${state.projectId}.zip`);
      state.lastExportMode = "server";
      state.lastExportMessage = state.exportApprovedOnly ? "서버 ZIP 사용: 승인 항목만" : "서버 ZIP 사용";
      await persistProject();
      render();
      setSaveState("saved", "서버 ZIP 내보냄");
      return;
    } catch (error) {
      const normalized = normalizeApiError(error);
      state.lastExportMode = "local";
      state.lastExportMessage = `서버 ZIP 실패: ${normalized.message}`;
      logger.warn("sync.export.fallback", {
        project_id: state.projectId,
        fallback: "local_zip",
        error: normalized,
      });
    }
  } else {
    state.lastExportMode = "local";
    state.lastExportMessage = explainLocalExportFallback(validImages);
  }

  const annotations = buildAnnotations({
    projectId: state.projectId,
    images: validImages,
    approvedOnly: state.exportApprovedOnly,
  });
  const summary = buildExportSummary({
    projectId: state.projectId,
    results: exportable,
    images: state.images,
    approvedOnly: state.exportApprovedOnly,
  });
  const entries = [
    { path: "annotations.json", data: annotations },
    { path: "export_summary.json", data: summary },
  ];

  for (const [index, image] of validImages.entries()) {
    const imageBlob = await projectStore.loadImageBlob(image.id);
    const maskBlob = await projectStore.loadMaskBlob(image.id);
    const exportPaths = createExportPaths(image, { index });
    if (imageBlob) {
      entries.push({ path: exportPaths.image_path, data: imageBlob });
    }
    if (maskBlob) {
      entries.push({ path: exportPaths.mask_path, data: maskBlob });
    }
  }

  const zip = await createZipBlob(entries);
  downloadBlob(zip, `export_${state.projectId}.zip`);
  await persistProject();
  render();
  setSaveState("saved", "ZIP 내보냄");
}

async function syncUploadedImage(image, file) {
  try {
    const ready = await ensureBackendProject();
    if (!ready) return false;

    const uploaded = await apiClient.uploadImage(state.projectId, {
      imageId: image.id,
      fileName: image.original_file_name || image.fileName,
      file,
      width: image.width,
      height: image.height,
    });

    Object.assign(image, {
      ...uploaded,
      fileName: image.fileName,
      original_file_name: uploaded.original_file_name || image.original_file_name,
      imagePath: uploaded.image_path || image.imagePath,
      server_image_synced: true,
      server_sync_error: "",
    });
    await persistProject();
    render();
    return true;
  } catch (error) {
    const normalized = normalizeApiError(error);
    image.server_image_synced = false;
    image.server_sync_error = normalized.message;
    logger.warn("sync.image.failed", {
      project_id: state.projectId,
      image_id: image.id,
      error: normalized,
    });
    await persistProject();
    return false;
  }
}

async function syncMaskToBackend(image, dataUrl, status) {
  try {
    const ready = await ensureBackendProject();
    if (!ready || !dataUrl) return false;

    const revisionEvent = image.pending_revision_event || null;
    const result = await apiClient.saveMask(state.projectId, image.id, {
      dataUrl,
      status,
      maskRatio: image.maskRatio ?? image.mask_ratio,
      revisionEvent,
    });
    const updated = result.image || {};

    Object.assign(image, {
      ...updated,
      fileName: image.fileName,
      original_file_name: updated.original_file_name || image.original_file_name,
      imagePath: updated.image_path || image.imagePath,
      maskPath: updated.current_mask_path || image.maskPath,
      maskDataUrl: dataUrl,
      mask_data_url: dataUrl,
      server_mask_synced: true,
      server_mask_validation: result.validation || null,
      server_sync_error: "",
    });
    if (revisionEvent) {
      image.pending_revision_event = "";
      image.review_server_synced = true;
    }
    await persistProject();
    return true;
  } catch (error) {
    const normalized = normalizeApiError(error);
    image.server_mask_synced = false;
    image.server_sync_error = normalized.message;
    logger.warn("sync.mask.failed", {
      project_id: state.projectId,
      image_id: image.id,
      error: normalized,
    });
    await persistProject();
    return false;
  }
}

async function ensureBackendProject() {
  if (state.backendProjectReady) return true;
  if (!state.projectId) {
    state.backendProjectError = "프로젝트를 먼저 생성하거나 열어야 합니다.";
    setSaveState("failed", state.backendProjectError);
    routeToScreen(SCREENS.PROJECTS);
    return false;
  }

  try {
    await apiClient.createProject({
      projectId: state.projectId,
      name: state.projectName,
    });
    state.backendProjectReady = true;
    state.backendProjectError = "";
    await persistProject();
    void refreshProjectSummaries();
    render();
    return true;
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.backendProjectReady = false;
    state.backendProjectError = normalized.message;
    logger.warn("sync.project.failed", {
      project_id: state.projectId,
      error: normalized,
    });
    return false;
  }
}

async function retrySelectedSync() {
  const image = getSelectedImage();
  if (!image) return;

  setSaveState("saving", "동기화 재시도 중");
  const imageBlob = await projectStore.loadImageBlob(image.id);
  if (imageBlob && !image.server_image_synced) {
    await syncUploadedImage(image, imageBlob);
  } else {
    await ensureBackendProject();
  }

  const maskDataUrl = image.maskDataUrl || image.mask_data_url || await maskDataUrlFromStore(image.id);
  if (maskDataUrl && !image.server_mask_synced) {
    await syncMaskToBackend(image, maskDataUrl, image.status);
  }
  if (image.review_server_synced === false) {
    await syncReviewToBackend(image);
  }
  if (image.assignment_server_synced === false) {
    await syncAssignmentToBackend(image);
  }

  render();
  setSaveState(hasSyncIssue(image) ? "failed" : "saved", hasSyncIssue(image) ? "동기화 확인 필요" : "동기화 완료");
}

async function syncAssignmentToBackend(image) {
  try {
    const response = await apiClient.assignImage(state.projectId, image.id, {
      workerId: image.worker_id || state.assignmentWorkerId,
      reviewerId: image.reviewer_id || state.assignmentReviewerId,
    });
    Object.assign(image, {
      ...response.image,
      fileName: image.fileName,
      imagePath: response.image.image_path || image.imagePath,
      maskPath: response.image.current_mask_path || image.maskPath,
      assignment_server_synced: true,
      server_sync_error: "",
    });
    await persistProject();
    return true;
  } catch (error) {
    const normalized = normalizeApiError(error);
    image.assignment_server_synced = false;
    image.server_sync_error = normalized.message;
    logger.warn("assignment.sync.retry.failed", {
      project_id: state.projectId,
      image_id: image.id,
      error: normalized,
    });
    await persistProject();
    return false;
  }
}

async function syncReviewToBackend(image) {
  const action = inferReviewAction(image);
  if (!action) return false;

  try {
    const response = await apiClient.reviewImage(state.projectId, image.id, {
      action,
      reason: image.reject_reason || state.reviewReasonDraft,
    });
    Object.assign(image, {
      ...response.image,
      fileName: image.fileName,
      imagePath: response.image.image_path || image.imagePath,
      maskPath: response.image.current_mask_path || image.maskPath,
      review_server_synced: true,
      server_sync_error: "",
    });
    await persistProject();
    return true;
  } catch (error) {
    const normalized = normalizeApiError(error);
    image.review_server_synced = false;
    image.server_sync_error = normalized.message;
    logger.warn("review.sync.retry.failed", {
      project_id: state.projectId,
      image_id: image.id,
      action,
      error: normalized,
    });
    await persistProject();
    return false;
  }
}

async function reviewSelectedImage(action) {
  const image = getSelectedImage();
  if (!image) return;

  if ((action === REVIEW_ACTIONS.APPROVE || action === REVIEW_ACTIONS.REJECT) && !image.server_mask_synced) {
    setReviewMessage("마스크 서버 동기화 후 리뷰할 수 있습니다.", true);
    return;
  }
  if (!await ensureAuthenticatedSession()) {
    setReviewMessage("세션 확인 후 리뷰할 수 있습니다.", true);
    return;
  }
  const reviewActorId = getReviewActorId();
  if (!reviewActorId) {
    setReviewMessage("reviewer 또는 admin 세션으로 로그인 후 리뷰할 수 있습니다.", true);
    return;
  }
  if (action === REVIEW_ACTIONS.REWORK && image.review_server_synced === false) {
    setReviewMessage("반려 상태 서버 동기화 후 재작업할 수 있습니다.", true);
    return;
  }

  const result = applyReviewTransition(image, {
    action,
    reason: state.reviewReasonDraft,
    reviewerId: reviewActorId,
  });
  if (!result.valid) {
    setReviewMessage(result.validation.reasons.map(reviewReasonLabel).join(", "), true);
    return;
  }

  Object.assign(image, {
    ...result.image,
    fileName: image.fileName,
    imagePath: result.image.image_path || image.imagePath,
    maskPath: result.image.current_mask_path || image.maskPath,
    review_server_synced: false,
    server_sync_error: "",
  });
  state.reviewReasonDraft = image.reject_reason || "";
  state.savedAt = new Date();
  await persistProject();
  render();

  try {
    const ready = await ensureBackendProject();
    if (!ready) {
      setReviewMessage("로컬 리뷰 상태로 저장됨. 서버 연결 후 동기화 필요", true);
      return;
    }
    const response = await apiClient.reviewImage(state.projectId, image.id, {
      action,
      reason: state.reviewReasonDraft,
    });
    Object.assign(image, {
      ...response.image,
      fileName: image.fileName,
      imagePath: response.image.image_path || image.imagePath,
      maskPath: response.image.current_mask_path || image.maskPath,
      review_server_synced: true,
      server_sync_error: "",
    });
    await persistProject();
    render();
    setReviewMessage(reviewStatusMessage(image), false);
  } catch (error) {
    const normalized = normalizeApiError(error);
    image.review_server_synced = false;
    image.server_sync_error = normalized.message;
    logger.warn("review.transition.failed", {
      project_id: state.projectId,
      image_id: image.id,
      action,
      error: normalized,
    });
    await persistProject();
    render();
    setReviewMessage(`서버 리뷰 동기화 실패: ${normalized.message}`, true);
  }
}

async function assignSelectedImage() {
  const image = getSelectedImage();
  if (!image) {
    setAssignmentMessage("배정할 이미지를 선택하세요.", true);
    return;
  }
  if (!await ensureAuthenticatedSession()) {
    setAssignmentMessage("세션 확인 후 배정할 수 있습니다.", true);
    return;
  }
  if (state.sessionRole !== ROLES.ADMIN) {
    setAssignmentMessage("admin 역할에서만 배정할 수 있습니다.", true);
    return;
  }

  const workerId = normalizeActorId(state.assignmentWorkerId || image.worker_id || DEFAULT_ACTORS.worker);
  const reviewerId = normalizeActorId(state.assignmentReviewerId || image.reviewer_id);
  if (!workerId || !reviewerId) {
    setAssignmentMessage("작업자와 리뷰어 ID가 필요합니다.", true);
    return;
  }

  Object.assign(image, {
    worker_id: workerId,
    reviewer_id: reviewerId,
    assignment_server_synced: false,
    server_sync_error: "",
    updated_at: new Date().toISOString(),
  });
  state.savedAt = new Date();
  await persistProject();
  render();

  try {
    const ready = await ensureBackendProject();
    if (!ready) {
      setAssignmentMessage("로컬 배정으로 저장됨. 서버 연결 후 동기화 필요", true);
      return;
    }
    const response = await apiClient.assignImage(state.projectId, image.id, {
      workerId,
      reviewerId,
    });
    Object.assign(image, {
      ...response.image,
      fileName: image.fileName,
      imagePath: response.image.image_path || image.imagePath,
      maskPath: response.image.current_mask_path || image.maskPath,
      assignment_server_synced: true,
      server_sync_error: "",
    });
    await persistProject();
    render();
    setAssignmentMessage("배정 저장됨", false);
  } catch (error) {
    const normalized = normalizeApiError(error);
    image.assignment_server_synced = false;
    image.server_sync_error = normalized.message;
    logger.warn("assignment.failed", {
      project_id: state.projectId,
      image_id: image.id,
      error: normalized,
    });
    await persistProject();
    render();
    setAssignmentMessage(`배정 동기화 실패: ${normalized.message}`, true);
  }
}

function inferReviewAction(image) {
  if (image.status === "approved") return REVIEW_ACTIONS.APPROVE;
  if (image.status === "rejected") return REVIEW_ACTIONS.REJECT;
  if (image.status === "in_progress" && image.rework_started_at) return REVIEW_ACTIONS.REWORK;
  return "";
}

function canUseServerExport(validImages) {
  return (
    state.backendProjectReady &&
    validImages.length > 0 &&
    validImages.every((image) => image.server_image_synced && image.server_mask_synced && image.review_server_synced !== false)
  );
}

function handleEditorChange() {
  const image = getSelectedImage();
  if (!image) return;

  if (canStartRevision(image)) {
    startRevisionMode(image, { reason: "edit_after_submission" });
  }
  image.maskRatio = editor.getMaskRatio();
  image.mask_ratio = image.maskRatio;
  image.updatedAt = new Date().toISOString();
  setSaveState("dirty", "변경됨");
  scheduleAutosave();
  renderValidation();
  updateStatusbar();
}

function scheduleAutosave() {
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => {
    void autosaveCurrentMask();
  }, 1200);
}

async function autosaveCurrentMask() {
  const image = getSelectedImage();
  if (!image) return;

  setSaveState("saving", "자동 저장 중");
  const blob = await editor.exportMaskPngBlob();
  await projectStore.saveMaskBlob(image.id, blob);
  image.maskDataUrl = await blobToDataUrl(blob);
  image.maskPath = `masks/${image.id}_mask.png`;
  image.current_mask_path = image.maskPath;
  image.mask_data_url = image.maskDataUrl;
  image.mask_width = image.width;
  image.mask_height = image.height;
  image.mask_values_valid = true;
  image.maskRatio = editor.getMaskRatio();
  image.mask_ratio = image.maskRatio;
  image.updatedAt = new Date().toISOString();
  state.savedAt = new Date();
  await persistProject();
  render();
  setSaveState("saved", "자동 저장됨");
}

function render() {
  renderScreen();
  renderFilters();
  renderQueueControls();
  renderUploadRejections();
  renderProjectCreateForm();
  renderProjectSummaries();
  renderProjectHeader();
  renderImageList();
  renderMetadata();
  renderValidation();
  renderSessionPanel();
  renderAssignmentPanel();
  renderReviewPanel();
  renderReviewIdentity();
  renderExportPolicy();
  renderSyncStatus();
  renderRolePanels();
  updateStatusbar();
}

function currentScreen() {
  const value = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  if (value === "review") return SCREENS.WORKBENCH;
  return Object.values(SCREENS).includes(value) ? value : SCREENS.LOGIN;
}

function canEnterProjects() {
  return Boolean(state.sessionAuthenticated && state.sessionToken);
}

function canEnterWorkbench() {
  return canEnterProjects() && Boolean(state.backendProjectReady || state.images.length > 0);
}

function routeToScreen(screen) {
  const next = Object.values(SCREENS).includes(screen) ? screen : SCREENS.LOGIN;
  if (window.location.hash !== `#/${next}`) {
    window.location.hash = `#/${next}`;
  }
  renderScreen();
}

function renderScreen() {
  let screen = currentScreen();
  const requested = screen;
  if (screen !== SCREENS.LOGIN && !canEnterProjects()) {
    screen = SCREENS.LOGIN;
  }
  if (screen === SCREENS.WORKBENCH && !canEnterWorkbench()) {
    screen = SCREENS.PROJECTS;
  }
  if (screen !== requested && window.location.hash !== `#/${screen}`) {
    window.history.replaceState(null, "", `#/${screen}`);
  }

  els.loginScreen.hidden = screen !== SCREENS.LOGIN;
  els.projectsScreen.hidden = screen !== SCREENS.PROJECTS;
  els.workbenchScreen.hidden = screen !== SCREENS.WORKBENCH;
}

function renderRolePanels() {
  document.querySelectorAll("[data-role-panel]").forEach((panel) => {
    const allowed = String(panel.dataset.rolePanel || "").split(/\s+/).filter(Boolean);
    panel.hidden = allowed.length > 0 && !allowed.includes(state.sessionRole);
  });
}

function renderFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  });
}

function renderQueueControls() {
  const summary = summarizeAssignmentQueue(state.images, {
    sessionUserId: state.sessionUserId,
  });
  els.queueAllCount.textContent = String(summary.all);
  els.queueWorkCount.textContent = String(summary.my_work);
  els.queueReviewCount.textContent = String(summary.my_review);
  document.querySelectorAll("[data-queue]").forEach((button) => {
    button.classList.toggle("active", button.dataset.queue === state.queueMode);
  });
}

function renderImageList() {
  const filtered = filterImagesForQueue(state.images, {
    queueMode: state.queueMode,
    statusFilter: state.filter,
    sessionUserId: state.sessionUserId,
  });
  const submittedCount = state.images.filter((image) => image.status === "submitted").length;
  els.progressText.textContent = `${submittedCount}/${state.images.length} 제출 · ${filtered.length}개 표시`;

  els.imageList.replaceChildren(...filtered.map((image) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `image-row ${image.id === state.selectedId ? "selected" : ""}`;
    button.addEventListener("click", () => void selectImage(image.id));
    button.innerHTML = `
      <img src="${image.objectUrl}" alt="">
      <span class="image-row-main">
        <strong>${escapeHtml(image.fileName)}</strong>
        <small>${image.width}×${image.height} · ${syncListLabel(image)}</small>
      </span>
      <span class="status-chip ${image.status}">${statusLabel(image.status)}</span>
    `;
    return button;
  }));
}

function renderUploadRejections() {
  const items = (state.uploadRejections || []).map((item) => {
    const element = document.createElement("li");
    const reasonText = (item.reasons || []).map(uploadReasonLabel).join(", ");
    element.innerHTML = `
      <span>${escapeHtml(item.fileName || "이름 없는 파일")}</span>
      <small>${escapeHtml(reasonText)} · ${formatBytes(item.sizeBytes)} / 최대 ${formatBytes(UPLOAD_POLICY.maxFileBytes)}</small>
    `;
    return element;
  });
  els.uploadRejections.replaceChildren(...items);
}

function renderProjectSummaries() {
  if (state.projectSummariesError) {
    const item = document.createElement("div");
    item.className = "project-summary-row";
    item.innerHTML = `<span><strong>서버 목록 실패</strong><small>${escapeHtml(state.projectSummariesError)}</small></span>`;
    els.projectSummaryList.replaceChildren(item);
    return;
  }

  const items = (state.projectSummaries || []).slice(0, 4).map((project) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `project-summary-row ${project.project_id === state.projectId ? "current" : ""}`;
    row.addEventListener("click", () => void loadServerProject(project.project_id));
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(project.name || project.project_id || "Untitled")}</strong>
        <small>${project.submitted_images || 0} 제출 · ${project.approved_images || 0} 승인 · ${project.rejected_images || 0} 반려</small>
      </span>
      <output>${project.total_images || 0}</output>
    `;
    return row;
  });

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "project-summary-row";
    empty.innerHTML = "<span><strong>서버 프로젝트 없음</strong><small>관리자가 새 프로젝트를 생성하면 표시됩니다.</small></span>";
    items.push(empty);
  }
  els.projectSummaryList.replaceChildren(...items);
}

function renderProjectCreateForm() {
  if (document.activeElement !== els.projectCreateId) {
    els.projectCreateId.value = state.projectCreateId;
  }
  if (document.activeElement !== els.projectCreateName) {
    els.projectCreateName.value = state.projectCreateName;
  }
  els.createProjectButton.disabled = state.sessionRole !== ROLES.ADMIN || !canEnterProjects();
  els.projectCreateMessage.textContent = state.projectCreateMessage
    || (state.sessionRole === ROLES.ADMIN
      ? "관리자는 새 프로젝트를 만들고 작업도구로 진입할 수 있습니다."
      : "프로젝트 생성은 관리자 권한에서만 사용할 수 있습니다.");
}

function renderProjectHeader() {
  els.projectName.textContent = state.projectName || "프로젝트 미선택";
}

async function createProjectFromForm() {
  if (!canEnterProjects()) {
    routeToScreen(SCREENS.LOGIN);
    return;
  }
  if (state.sessionRole !== ROLES.ADMIN) {
    state.projectCreateMessage = "프로젝트 생성은 관리자 권한에서만 사용할 수 있습니다.";
    renderProjectCreateForm();
    return;
  }

  const projectId = normalizeProjectId(state.projectCreateId || state.projectCreateName);
  const projectName = String(state.projectCreateName || projectId).trim();
  if (!projectId) {
    state.projectCreateMessage = "프로젝트 ID 또는 이름을 입력하세요.";
    renderProjectCreateForm();
    return;
  }

  setSaveState("saving", "프로젝트 생성 중");
  state.projectCreateMessage = "프로젝트 생성 중";
  renderProjectCreateForm();
  try {
    const manifest = await apiClient.createProject({
      projectId,
      name: projectName,
    });
    setActiveProjectFromManifest(manifest, {
      clearImages: true,
      fallbackId: projectId,
      fallbackName: projectName,
    });
    state.projectCreateId = "";
    state.projectCreateName = "";
    state.projectCreateMessage = "프로젝트 생성 완료";
    await persistProject();
    void refreshProjectSummaries();
    render();
    routeToScreen(SCREENS.WORKBENCH);
    setSaveState("saved", "프로젝트 생성됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.projectCreateMessage = normalized.message;
    setSaveState("failed", `프로젝트 생성 실패: ${normalized.message}`);
    renderProjectCreateForm();
  }
}

async function loadServerProject(projectId) {
  if (!projectId) return;
  setSaveState("saving", "서버 프로젝트 로딩");
  try {
    const manifest = await apiClient.getProject(projectId);
    await restoreServerManifest(manifest);
    routeToScreen(SCREENS.WORKBENCH);
    setSaveState("saved", "서버 프로젝트 선택됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.projectSummariesError = normalized.message;
    renderProjectSummaries();
    setSaveState("failed", `프로젝트 로딩 실패: ${normalized.message}`);
  }
}

async function restoreServerManifest(manifest = {}) {
  revokeImageUrls();
  await projectStore.clearProject();
  setActiveProjectFromManifest(manifest);
  state.images = (manifest.images || []).map(rehydrateServerImageRecord);
  state.selectedId = state.images[0]?.id || null;
  state.filter = "all";
  state.uploadRejections = [];
  state.savedAt = manifest.updated_at ? new Date(manifest.updated_at) : new Date();
  await persistProject();
  editor.clear();
  els.emptyState.hidden = false;
  if (state.selectedId) {
    await selectImage(state.selectedId, { updateRoute: false, allowMissingBlob: true, markInProgress: false });
  } else {
    render();
  }
}

function setActiveProjectFromManifest(manifest = {}, options = {}) {
  if (options.clearImages) {
    revokeImageUrls();
    editor.clear();
    state.images = [];
    state.selectedId = null;
    state.savedAt = null;
    state.uploadRejections = [];
  }
  state.projectId = manifest.project_id || manifest.id || options.fallbackId || state.projectId;
  state.projectName = manifest.name || manifest.project_name || options.fallbackName || state.projectId;
  state.backendProjectReady = Boolean(state.projectId);
  state.backendProjectError = "";
}

function normalizeProjectId(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+$/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 160);
}

function renderMetadata() {
  const image = getSelectedImage();
  els.metaImageId.textContent = image?.id || "-";
  els.metaFilename.textContent = image?.fileName || "-";
  els.metaSize.textContent = image ? `${image.width}×${image.height}` : "-";
  els.metaStatus.textContent = image ? statusLabel(image.status) : "-";
}

function renderSessionPanel() {
  if (document.activeElement !== els.sessionUserId) {
    els.sessionUserId.value = state.sessionUserId;
  }
  if (document.activeElement !== els.sessionPassword || !state.sessionPassword) {
    els.sessionPassword.value = state.sessionPassword;
  }
  els.sessionRoleLabel.value = state.sessionRole || "미확인";
  els.loginButton.disabled = !state.sessionUserId || !state.sessionPassword;
  els.logoutButton.disabled = !state.sessionAuthenticated;
  els.sessionMessage.textContent = state.sessionAuthenticated
    ? `${state.sessionUserId} / ${state.sessionRole} / session`
    : `${state.sessionUserId || "미설정"} / ${state.sessionRole || "role 없음"} / 로그인 필요`;
  els.sessionMessage.classList.toggle("warning", !state.sessionAuthenticated);
}

function renderAssignmentPanel() {
  const image = getSelectedImage();
  if (document.activeElement !== els.assignmentWorkerId) {
    els.assignmentWorkerId.value = state.assignmentWorkerId || image?.worker_id || "";
  }
  if (document.activeElement !== els.assignmentReviewerId) {
    els.assignmentReviewerId.value = state.assignmentReviewerId || image?.reviewer_id || "";
  }
  els.assignButton.disabled = !image || !state.sessionAuthenticated || state.sessionRole !== ROLES.ADMIN;
  if (!image) {
    setAssignmentMessage("이미지를 선택하면 배정할 수 있습니다.", false);
  } else if (!state.sessionAuthenticated) {
    setAssignmentMessage("로그인 후 배정할 수 있습니다.", true);
  } else if (state.sessionRole !== ROLES.ADMIN) {
    setAssignmentMessage("admin 역할에서만 배정할 수 있습니다.", true);
  } else if (image.assignment_server_synced === false) {
    setAssignmentMessage("배정 서버 동기화가 필요합니다.", true);
  } else {
    setAssignmentMessage(`작업자 ${image.worker_id || "미배정"} · 리뷰어 ${image.reviewer_id || "미배정"}`, false);
  }
}

function renderReviewPanel() {
  const image = getSelectedImage();
  const canReview = image?.status === "submitted" && Boolean(image.server_mask_synced);
  const canRework = image?.status === "rejected" && image.review_server_synced !== false;
  const reviewerReady = Boolean(getReviewActorId());

  if (document.activeElement !== els.reviewReason) {
    els.reviewReason.value = state.reviewReasonDraft || image?.reject_reason || "";
  }
  els.reviewReason.disabled = !image || image.status === "approved";
  els.approveButton.disabled = !canReview || !reviewerReady;
  els.rejectButton.disabled = !canReview || !reviewerReady;
  els.reworkButton.disabled = !canRework || !reviewerReady;

  if (!image) {
    setReviewMessage("제출된 이미지를 선택하면 리뷰할 수 있습니다.", false);
  } else if (!reviewerReady) {
    setReviewMessage("reviewer 또는 admin 세션으로 로그인 후 리뷰할 수 있습니다.", true);
  } else if (image.status === "submitted" && !image.server_mask_synced) {
    setReviewMessage("마스크 서버 동기화 후 리뷰할 수 있습니다.", true);
  } else if (image.status === "submitted") {
    setReviewMessage("승인 또는 반려를 선택하세요.", false);
  } else if (image.status === "rejected" && image.review_server_synced === false) {
    setReviewMessage("반려 상태 서버 동기화 후 재작업할 수 있습니다.", true);
  } else if (image.status === "rejected") {
    setReviewMessage(image.reject_reason ? `반려: ${image.reject_reason}` : "반려됨. 재작업을 시작할 수 있습니다.", true);
  } else if (image.status === "approved") {
    setReviewMessage("승인 완료", false);
  } else {
    setReviewMessage("제출 후 리뷰할 수 있습니다.", false);
  }
}

function renderReviewIdentity() {
  els.reviewerIdentitySummary.textContent = getReviewActorId() || "로그인 필요";
  updateReviewRouteLink();
}

function getReviewActorId() {
  if (!state.sessionAuthenticated) return "";
  if (state.sessionRole !== ROLES.REVIEWER && state.sessionRole !== ROLES.ADMIN) return "";
  return normalizeReviewerId(state.sessionUserId);
}

function renderExportPolicy() {
  els.approvedOnlyExport.checked = Boolean(state.exportApprovedOnly);
  const exportState = getExportState();
  const validImages = exportState.validImages;
  els.exportIncludedCount.textContent = String(validImages.length);
  els.exportExcludedCount.textContent = String(exportState.excluded.length);
  els.exportPolicyMessage.textContent = state.exportApprovedOnly
    ? `${validImages.length}개 승인 항목만 내보냅니다.`
    : `${validImages.length}개 제출/승인 항목을 내보냅니다.`;
  els.exportErrorList.replaceChildren(...exportState.excluded.slice(0, 5).map(renderExportErrorItem));
  els.exportFilePreview.textContent = exportPreviewPaths(validImages).join("\n");
}

function getExportState() {
  const results = state.images.map((image) => ({
    image,
    validation: validateExportItem(image, { approvedOnly: state.exportApprovedOnly }),
  }));
  return {
    exportable: results.map((item) => item.validation),
    validImages: results.filter((item) => item.validation.valid).map((item) => item.image),
    excluded: results.filter((item) => !item.validation.valid),
  };
}

function renderExportErrorItem(item) {
  const element = document.createElement("li");
  const fileName = item.validation.fileName || item.image.fileName || item.image.id;
  element.innerHTML = `
    <strong>${escapeHtml(fileName)}</strong>
    <span>${escapeHtml(item.validation.reasons.join(", "))}</span>
  `;
  return element;
}

function exportPreviewPaths(validImages) {
  const paths = ["annotations.json", "export_summary.json"];
  for (const [index, image] of validImages.slice(0, 2).entries()) {
    const exportPaths = createExportPaths(image, { index });
    paths.push(exportPaths.image_path);
    paths.push(exportPaths.mask_path);
  }
  if (validImages.length > 2) {
    paths.push(`... ${validImages.length - 2} more image/mask pairs`);
  }
  return paths;
}

function renderSyncStatus() {
  const image = getSelectedImage();
  const validImages = getExportState().validImages;

  els.syncProjectStatus.textContent = state.backendProjectReady ? "연결됨" : "로컬 우선";
  els.syncImageStatus.textContent = image ? syncLabel(image.server_image_synced) : "-";
  els.syncMaskStatus.textContent = image ? syncLabel(image.server_mask_synced) : "-";
  els.syncExportStatus.textContent = canUseServerExport(validImages) ? "서버 ZIP 가능" : "로컬 ZIP fallback";

  const message = image?.server_sync_error || state.backendProjectError || state.lastExportMessage || explainLocalExportFallback(validImages);
  els.syncMessage.textContent = message;
  els.syncMessage.classList.toggle("warning", Boolean(image?.server_sync_error || state.backendProjectError));
  els.retrySyncButton.disabled = !image || !hasSyncIssue(image);
}

function renderValidation() {
  const image = getSelectedImage();
  els.reviseButton.disabled = !image || !canStartRevision(image);
  const checks = image ? validateExportItem({
    ...image,
    maskRatio: editor.getMaskRatio(),
  }) : { checks: {} };

  setCheck("dimensions", Boolean(checks.checks.dimensions));
  setCheck("notEmpty", Boolean(checks.checks.notEmpty));
  setCheck("pixelValues", Boolean(checks.checks.pixelValues));
}

function setCheck(name, passed) {
  const item = els.validationList.querySelector(`[data-check="${name}"]`);
  item.classList.toggle("passed", passed);
  item.classList.toggle("failed", !passed);
}

function updateStatusbar() {
  const image = getSelectedImage();
  const index = image ? state.images.findIndex((item) => item.id === image.id) + 1 : 0;
  const viewport = editor.getViewportState();
  els.statusImageIndex.textContent = `이미지 ${index} / ${state.images.length}`;
  els.statusZoom.textContent = `확대 ${Math.round(viewport.scale * 100)}%`;
  els.statusMask.textContent = `마스크 ${Math.round(editor.getMaskRatio() * 1000) / 10}%`;
  els.statusSavedAt.textContent = state.savedAt ? `마지막 저장 ${state.savedAt.toLocaleTimeString("ko-KR")}` : "저장 기록 없음";
}

function updatePointerStatus(point) {
  els.statusCoords.textContent = point ? `좌표 ${Math.round(point.x)}, ${Math.round(point.y)}` : "좌표 -";
}

function setTool(tool) {
  editor.setTool(tool);
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
}

function handleShortcut(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (currentScreen() !== SCREENS.WORKBENCH || els.workbenchScreen.hidden) return;

  const key = event.key.toLowerCase();
  const ctrl = event.metaKey || event.ctrlKey;

  if (ctrl && key === "s") {
    event.preventDefault();
    void saveCurrentMask();
  } else if (ctrl && key === "z") {
    event.preventDefault();
    editor.undo();
    handleEditorChange();
  } else if (ctrl && key === "y") {
    event.preventDefault();
    editor.redo();
    handleEditorChange();
  } else if (key === "b") {
    setTool("brush");
  } else if (key === "e") {
    setTool("erase");
  } else if (key === "v") {
    setTool("view");
  } else if (key === "n") {
    selectAdjacentImage(1);
  } else if (key === "p") {
    selectAdjacentImage(-1);
  } else if (key === "[") {
    adjustBrush(-4);
  } else if (key === "]") {
    adjustBrush(4);
  } else if (key === "enter") {
    void submitCurrentImage();
  }
}

function selectAdjacentImage(delta) {
  if (state.images.length === 0) return;
  const current = state.images.findIndex((image) => image.id === state.selectedId);
  const next = Math.max(0, Math.min(state.images.length - 1, current + delta));
  void selectImage(state.images[next].id);
}

function adjustBrush(delta) {
  const next = Math.max(Number(els.brushSize.min), Math.min(Number(els.brushSize.max), Number(els.brushSize.value) + delta));
  els.brushSize.value = String(next);
  els.brushSize.dispatchEvent(new Event("input"));
}

function setSaveState(kind, label) {
  els.saveStatus.textContent = label;
  els.saveDot.className = `save-dot ${kind}`;
}

function setReviewMessage(message, warning = false) {
  els.reviewMessage.textContent = message;
  els.reviewMessage.classList.toggle("warning", warning);
}

function setAssignmentMessage(message, warning = false) {
  els.assignmentMessage.textContent = message;
  els.assignmentMessage.classList.toggle("warning", warning);
}

function reviewStatusMessage(image) {
  return {
    approved: "승인 완료",
    rejected: "반려 완료",
    in_progress: "재작업 시작",
  }[image.status] || "리뷰 상태 저장됨";
}

async function validateRestoredSession() {
  if (!state.sessionToken || !state.sessionAuthenticated) return false;
  return ensureAuthenticatedSession();
}

async function ensureAuthenticatedSession() {
  if (!state.sessionToken || !state.sessionAuthenticated) {
    state.sessionAuthenticated = false;
    state.sessionToken = "";
    return false;
  }
  try {
    const response = await apiClient.me();
    const session = response.session || {};
    state.sessionUserId = session.userId || session.user_id || state.sessionUserId;
    state.sessionRole = normalizeRole(session.role, state.sessionRole);
    state.sessionAuthenticated = true;
    await persistProject();
    return true;
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.sessionAuthenticated = false;
    state.sessionToken = "";
    logger.warn("session.validate.failed", {
      user_id: state.sessionUserId,
      error: normalized,
    });
    await persistProject();
    renderSessionPanel();
    renderReviewIdentity();
    return false;
  }
}

function getSelectedImage() {
  return state.images.find((image) => image.id === state.selectedId) || null;
}

function syncLabel(value) {
  return value ? "서버 저장됨" : "로컬만";
}

function syncListLabel(image) {
  if (image.server_image_synced && image.server_mask_synced && image.review_server_synced !== false) return "서버 동기화";
  if (hasSyncIssue(image)) return "동기화 필요";
  return "로컬 저장";
}

function hasSyncIssue(image) {
  return Boolean(image && (
    image.server_sync_error ||
    !image.server_image_synced ||
    (image.current_mask_path && !image.server_mask_synced) ||
    image.review_server_synced === false ||
    image.assignment_server_synced === false
  ));
}

async function applyRouteFromHash() {
  const imageId = getReviewImageIdFromHash();
  if (!imageId || imageId === state.selectedId) {
    updateReviewRouteLink();
    return;
  }
  await selectImage(imageId, { updateRoute: false });
}

function updateReviewRoute(imageId) {
  const nextHash = reviewRouteHash(imageId);
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, "", nextHash);
  }
  updateReviewRouteLink();
}

function updateReviewRouteLink() {
  const hash = reviewRouteHash(state.selectedId);
  els.reviewDetailLink.href = hash;
  els.reviewDetailLink.textContent = hash;
}

function getReviewImageIdFromHash() {
  const match = window.location.hash.match(/^#\/review\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function reviewRouteHash(imageId) {
  return imageId ? `#/review/${encodeURIComponent(imageId)}` : "#/review";
}

function explainLocalExportFallback(validImages) {
  if (validImages.length === 0) return "Export 대상 없음";
  if (!state.backendProjectReady) return "서버 프로젝트 연결 전이라 로컬 ZIP 사용";
  const unsynced = validImages.filter((image) => !image.server_image_synced || !image.server_mask_synced).length;
  if (unsynced > 0) return `${unsynced}개 export 대상이 서버 동기화 전이라 로컬 ZIP 사용`;
  return "서버 ZIP 사용 조건 확인 중";
}

async function maskDataUrlFromStore(imageId) {
  const maskBlob = await projectStore.loadMaskBlob(imageId);
  return maskBlob ? blobToDataUrl(maskBlob) : "";
}

async function persistProject() {
  const serializable = {
    projectId: state.projectId,
    projectName: state.projectName,
    selectedId: state.selectedId,
    filter: state.filter,
    queueMode: state.queueMode,
    savedAt: state.savedAt ? state.savedAt.toISOString() : null,
    backendProjectReady: state.backendProjectReady,
    backendProjectError: state.backendProjectError || "",
    lastExportMode: state.lastExportMode || "",
    lastExportMessage: state.lastExportMessage || "",
    exportApprovedOnly: Boolean(state.exportApprovedOnly),
    sessionUserId: state.sessionUserId,
    sessionRole: state.sessionRole,
    sessionToken: state.sessionToken,
    sessionAuthenticated: state.sessionAuthenticated,
    assignmentWorkerId: state.assignmentWorkerId,
    assignmentReviewerId: state.assignmentReviewerId,
    uploadRejections: state.uploadRejections || [],
    images: state.images.map(toSerializableImage),
  };
  await projectStore.saveProjectSnapshot(serializable);
}

async function restoreProject() {
  const saved = await projectStore.loadProjectSnapshot();
  if (!saved) return;

  try {
    state.projectId = saved.projectId || state.projectId;
    state.projectName = saved.projectName || state.projectName;
    state.selectedId = saved.selectedId || null;
    state.filter = saved.filter || "all";
    state.queueMode = normalizeQueueMode(saved.queueMode);
    state.savedAt = saved.savedAt ? new Date(saved.savedAt) : null;
    state.backendProjectReady = Boolean(saved.backendProjectReady);
    state.backendProjectError = saved.backendProjectError || "";
    state.lastExportMode = saved.lastExportMode || "";
    state.lastExportMessage = saved.lastExportMessage || "";
    state.exportApprovedOnly = Boolean(saved.exportApprovedOnly);
    state.sessionUserId = normalizeActorId(saved.sessionUserId) || state.sessionUserId;
    state.sessionRole = normalizeRole(saved.sessionRole, state.sessionRole);
    state.sessionToken = String(saved.sessionToken || "");
    state.sessionAuthenticated = Boolean(saved.sessionAuthenticated && state.sessionToken);
    state.assignmentWorkerId = normalizeActorId(saved.assignmentWorkerId) || state.assignmentWorkerId;
    state.assignmentReviewerId = normalizeActorId(saved.assignmentReviewerId) || state.assignmentReviewerId;
    state.uploadRejections = Array.isArray(saved.uploadRejections) ? saved.uploadRejections : [];
    state.images = await Promise.all((saved.images || []).map(rehydrateImageRecord));
    setSaveState("saved", "작업 복구됨");
  } catch {
    await projectStore.clearProject();
    state.images = [];
    state.selectedId = null;
    setSaveState("failed", "복구 실패");
  }
}

async function clearProject() {
  revokeImageUrls();
  state.projectId = "";
  state.projectName = "";
  state.images = [];
  state.selectedId = null;
  state.queueMode = QUEUE_MODES.ALL;
  state.savedAt = null;
  state.backendProjectReady = false;
  state.backendProjectError = "";
  state.lastExportMode = "";
  state.lastExportMessage = "";
  state.exportApprovedOnly = false;
  state.sessionUserId = DEFAULT_SESSION.user_id;
  state.sessionPassword = "";
  state.sessionRole = DEFAULT_SESSION.role;
  state.sessionToken = "";
  state.sessionAuthenticated = false;
  state.assignmentWorkerId = DEFAULT_ACTORS.worker;
  state.assignmentReviewerId = DEFAULT_ACTORS.reviewer;
  state.uploadRejections = [];
  state.projectCreateId = "";
  state.projectCreateName = "";
  state.projectCreateMessage = "";
  await projectStore.clearProject();
  editor.clear();
  els.emptyState.hidden = false;
  setSaveState("saved", "초기화됨");
  render();
}

function revokeImageUrls() {
  state.images.forEach((image) => {
    if (image.objectUrl) URL.revokeObjectURL(image.objectUrl);
    if (image.maskObjectUrl) URL.revokeObjectURL(image.maskObjectUrl);
  });
}

function toSerializableImage(image) {
  const {
    file,
    objectUrl,
    object_url,
    maskObjectUrl,
    maskDataUrl,
    mask_data_url,
    ...serializable
  } = image;
  return {
    ...serializable,
    objectUrl: "",
    object_url: "",
    maskObjectUrl: "",
    maskDataUrl: "",
    mask_data_url: "",
  };
}

async function rehydrateImageRecord(image) {
  const record = {
    ...image,
    objectUrl: "",
    object_url: "",
    maskObjectUrl: "",
  };
  await ensureObjectUrls(record);
  return record;
}

function rehydrateServerImageRecord(image) {
  return {
    ...image,
    fileName: image.original_file_name || image.fileName || image.id,
    imagePath: image.image_path || image.imagePath || "",
    maskPath: image.current_mask_path || image.maskPath || "",
    objectUrl: "",
    object_url: "",
    maskObjectUrl: "",
    maskDataUrl: "",
    mask_data_url: "",
    server_image_synced: Boolean(image.image_path),
    server_mask_synced: Boolean(image.current_mask_path),
    review_server_synced: true,
    assignment_server_synced: true,
  };
}

async function ensureObjectUrls(image) {
  if (!image.objectUrl) {
    const blob = await projectStore.loadImageBlob(image.id);
    if (blob) {
      image.objectUrl = URL.createObjectURL(blob);
      image.object_url = image.objectUrl;
    }
  }

  if (!image.maskDataUrl && !image.maskObjectUrl) {
    const maskBlob = await projectStore.loadMaskBlob(image.id);
    if (maskBlob) {
      image.maskObjectUrl = URL.createObjectURL(maskBlob);
    }
  }
}

function statusLabel(status) {
  return {
    not_started: "대기",
    in_progress: "작업중",
    submitted: "제출",
    approved: "승인",
    rejected: "반려",
  }[status] || status;
}

function normalizeActorId(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
