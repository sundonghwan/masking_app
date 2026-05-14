import { createMaskingApiClient, normalizeApiError } from "./api/client.js";
import { selectAiPredictionForClass } from "./annotations/aiPredictions.js";
import { DEFAULT_LABEL_SCHEMA, labelByClassId, normalizeLabelSchema, validateClassId } from "./annotations/labels.js";
import {
  annotationMaskBlobKey,
  annotationMaskPath,
  migrateLegacyImageAnnotations,
  upsertAnnotationRecord,
} from "./annotations/records.js";
import { createDashboardSummary } from "./dashboard/summary.js";
import { MaskEditor, panDeltaForKey } from "./editor/maskEditor.js";
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
import {
  REJECTION_REASON_CODES,
  REVIEW_ACTIONS,
  applyReviewTransition,
  normalizeReviewerId,
  rejectionReasonCodeLabel,
  reviewReasonLabel,
} from "./review/policy.js";
import { createProjectStore } from "./storage/projectStore.js";
import { UPLOAD_POLICY, formatBytes, normalizeUploadPolicy, uploadReasonLabel, validateBrowserUploadFile } from "./upload/policy.js";
import { DEFAULT_ACTORS, DEFAULT_SESSION, ROLES, normalizeRole } from "./config/runtimeDefaults.js";
import { escapeHtml } from "./ui/html.js";

const SCREENS = {
  LOGIN: "login",
  PROJECTS: "projects",
  DASHBOARD: "dashboard",
  WORKBENCH: "workbench",
};

const DEFAULT_TASK_ID = "default_task";
const DEFAULT_VERSION_ID = "v1";

const state = {
  projectId: "",
  projectName: "",
  images: [],
  selectedId: null,
  filter: "all",
  imageSearch: "",
  queueMode: QUEUE_MODES.ALL,
  labelSchema: normalizeLabelSchema(DEFAULT_LABEL_SCHEMA),
  selectedClassId: DEFAULT_LABEL_SCHEMA[0].class_id,
  labelMessage: "",
  aiDraftMessage: "",
  savedAt: null,
  autosaveTimer: null,
  backendProjectReady: false,
  uploadRejections: [],
  uploadPolicy: { ...UPLOAD_POLICY },
  sessionUserId: DEFAULT_SESSION.user_id,
  sessionPassword: "",
  sessionRole: DEFAULT_SESSION.role,
  sessionToken: "",
  sessionAuthenticated: false,
  reviewReasonDraft: "",
  reviewReasonCode: REJECTION_REASON_CODES.ROUGH_BOUNDARY,
  assignmentWorkerId: DEFAULT_ACTORS.worker,
  assignmentReviewerId: DEFAULT_ACTORS.reviewer,
  assignmentUsers: {
    workers: [],
    reviewers: [],
    error: "",
  },
  exportApprovedOnly: false,
  projectSummaries: [],
  projectSummariesError: "",
  projectSearch: "",
  includeDeletedProjects: false,
  projectCreateId: "",
  projectCreateName: "",
  projectUploadLimitMb: 15,
  projectCreateLabelSchema: "",
  projectCreateMessage: "",
  projectDescription: "",
  taskId: DEFAULT_TASK_ID,
  versionId: DEFAULT_VERSION_ID,
  taskSummaries: [],
  versionSummaries: [],
  versionRevision: 0,
  versionMessage: "",
  trainingSources: [],
  selectedTrainingSourceIds: new Set(),
  trainingSets: [],
  includeDeletedTrainingSets: false,
  trainingSetId: "",
  trainingSetName: "",
  trainingSetDescription: "",
  trainingSplitTrain: 0.8,
  trainingSplitVal: 0.1,
  trainingSplitTest: 0.1,
  trainingSplitSeed: 42,
  trainingSetMessage: "",
  maskTransferMessage: "",
  maskTransferWarning: false,
  projectSettingsMessage: "",
  settingsAllowedFormats: "image/png,image/jpeg,image/bmp,image/webp",
  settingsMagicTolerance: 42,
  settingsMagicEdge: 55,
  adminUsers: [],
  adminUserDraft: {
    userId: "",
    displayName: "",
    role: ROLES.WORKER,
    password: "",
    active: true,
  },
  adminUserMessage: "",
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
  dashboardScreen: document.querySelector("#dashboardScreen"),
  workbenchScreen: document.querySelector("#workbenchScreen"),
  imageInput: document.querySelector("#imageInput"),
  uploadDropzone: document.querySelector("#uploadDropzone"),
  uploadRejections: document.querySelector("#uploadRejections"),
  refreshProjectsButton: document.querySelector("#refreshProjectsButton"),
  projectCreateForm: document.querySelector("#projectCreateForm"),
  projectCreateId: document.querySelector("#projectCreateId"),
  projectCreateName: document.querySelector("#projectCreateName"),
  projectUploadLimitMb: document.querySelector("#projectUploadLimitMb"),
  projectCreateLabelSchema: document.querySelector("#projectCreateLabelSchema"),
  createProjectButton: document.querySelector("#createProjectButton"),
  projectCreateMessage: document.querySelector("#projectCreateMessage"),
  projectSearchInput: document.querySelector("#projectSearchInput"),
  includeDeletedProjects: document.querySelector("#includeDeletedProjects"),
  projectSummaryList: document.querySelector("#projectSummaryList"),
  dashboardProjectName: document.querySelector("#dashboardProjectName"),
  dashboardProjectsButton: document.querySelector("#dashboardProjectsButton"),
  dashboardWorkbenchButton: document.querySelector("#dashboardWorkbenchButton"),
  dashboardHealthGrid: document.querySelector("#dashboardHealthGrid"),
  dashboardWorkloadBody: document.querySelector("#dashboardWorkloadBody"),
  dashboardExportReadiness: document.querySelector("#dashboardExportReadiness"),
  dashboardReviewQuality: document.querySelector("#dashboardReviewQuality"),
  dashboardBlockers: document.querySelector("#dashboardBlockers"),
  dashboardActivityList: document.querySelector("#dashboardActivityList"),
  projectName: document.querySelector("#projectName"),
  imageList: document.querySelector("#imageList"),
  imageSearchInput: document.querySelector("#imageSearchInput"),
  progressText: document.querySelector("#progressText"),
  workbenchProjectsButton: document.querySelector("#workbenchProjectsButton"),
  workbenchDashboardButton: document.querySelector("#workbenchDashboardButton"),
  taskSelector: document.querySelector("#taskSelector"),
  versionSelector: document.querySelector("#versionSelector"),
  refreshVersionsButton: document.querySelector("#refreshVersionsButton"),
  cloneVersionButton: document.querySelector("#cloneVersionButton"),
  deleteVersionButton: document.querySelector("#deleteVersionButton"),
  restoreVersionButton: document.querySelector("#restoreVersionButton"),
  purgeVersionButton: document.querySelector("#purgeVersionButton"),
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
  labelSelector: document.querySelector("#labelSelector"),
  imageAnnotationList: document.querySelector("#imageAnnotationList"),
  labelMessage: document.querySelector("#labelMessage"),
  aiDraftButton: document.querySelector("#aiDraftButton"),
  aiDraftMessage: document.querySelector("#aiDraftMessage"),
  copyPreviousMaskButton: document.querySelector("#copyPreviousMaskButton"),
  maskTransferMessage: document.querySelector("#maskTransferMessage"),
  clearProjectButton: document.querySelector("#clearProjectButton"),
  fitButton: document.querySelector("#fitButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  brushSize: document.querySelector("#brushSize"),
  brushSizeValue: document.querySelector("#brushSizeValue"),
  magicTolerance: document.querySelector("#magicTolerance"),
  magicToleranceValue: document.querySelector("#magicToleranceValue"),
  magicEdge: document.querySelector("#magicEdge"),
  magicEdgeValue: document.querySelector("#magicEdgeValue"),
  overlayOpacity: document.querySelector("#overlayOpacity"),
  opacityValue: document.querySelector("#opacityValue"),
  maskColorSwatch: document.querySelector("#maskColorSwatch"),
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
  reviewReasonCode: document.querySelector("#reviewReasonCode"),
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
  trainingSourcePicker: document.querySelector("#trainingSourcePicker"),
  trainingExportButton: document.querySelector("#trainingExportButton"),
  trainingSetId: document.querySelector("#trainingSetId"),
  trainingSetName: document.querySelector("#trainingSetName"),
  trainingSetDescription: document.querySelector("#trainingSetDescription"),
  trainingSplitTrain: document.querySelector("#trainingSplitTrain"),
  trainingSplitVal: document.querySelector("#trainingSplitVal"),
  trainingSplitTest: document.querySelector("#trainingSplitTest"),
  trainingSplitSeed: document.querySelector("#trainingSplitSeed"),
  createTrainingSetButton: document.querySelector("#createTrainingSetButton"),
  refreshTrainingSetsButton: document.querySelector("#refreshTrainingSetsButton"),
  includeDeletedTrainingSets: document.querySelector("#includeDeletedTrainingSets"),
  trainingSetList: document.querySelector("#trainingSetList"),
  settingsProjectName: document.querySelector("#settingsProjectName"),
  settingsProjectDescription: document.querySelector("#settingsProjectDescription"),
  settingsUploadLimitMb: document.querySelector("#settingsUploadLimitMb"),
  settingsAllowedFormats: document.querySelector("#settingsAllowedFormats"),
  settingsLabelSchema: document.querySelector("#settingsLabelSchema"),
  settingsMagicTolerance: document.querySelector("#settingsMagicTolerance"),
  settingsMagicToleranceValue: document.querySelector("#settingsMagicToleranceValue"),
  settingsMagicEdge: document.querySelector("#settingsMagicEdge"),
  settingsMagicEdgeValue: document.querySelector("#settingsMagicEdgeValue"),
  saveProjectSettingsButton: document.querySelector("#saveProjectSettingsButton"),
  projectSettingsMessage: document.querySelector("#projectSettingsMessage"),
  adminUserId: document.querySelector("#adminUserId"),
  adminDisplayName: document.querySelector("#adminDisplayName"),
  adminUserRole: document.querySelector("#adminUserRole"),
  adminPassword: document.querySelector("#adminPassword"),
  adminUserActive: document.querySelector("#adminUserActive"),
  saveUserButton: document.querySelector("#saveUserButton"),
  deactivateUserButton: document.querySelector("#deactivateUserButton"),
  adminUserList: document.querySelector("#adminUserList"),
  adminUserMessage: document.querySelector("#adminUserMessage"),
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
  overlayColor: selectedLabelColor(),
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
    void refreshAssignmentUsers();
    void refreshVersionContext();
    void refreshTrainingSources();
    void refreshTrainingSets();
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
    routeToScreen(SCREENS.DASHBOARD);
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
      void persistProject();
      render();
    });
  });

  els.imageSearchInput.addEventListener("input", () => {
    state.imageSearch = els.imageSearchInput.value;
    void persistProject();
    renderImageList();
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

  els.magicTolerance.addEventListener("input", () => {
    const value = Number(els.magicTolerance.value);
    els.magicToleranceValue.textContent = String(value);
    editor.setMagicOptions({ colorTolerance: value });
  });

  els.magicEdge.addEventListener("input", () => {
    const value = Number(els.magicEdge.value);
    els.magicEdgeValue.textContent = String(value);
    editor.setMagicOptions({ edgeThreshold: value });
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
  els.aiDraftButton.addEventListener("click", () => void requestAiDraftMask());
  els.copyPreviousMaskButton.addEventListener("click", () => void copyMaskFromPreviousImage());
  els.clearProjectButton.addEventListener("click", clearProject);
  els.retrySyncButton.addEventListener("click", () => void retrySelectedSync());
  els.refreshProjectsButton.addEventListener("click", () => void refreshProjectSummaries());
  els.workbenchProjectsButton.addEventListener("click", () => routeToScreen(SCREENS.PROJECTS));
  els.workbenchDashboardButton.addEventListener("click", () => routeToScreen(SCREENS.DASHBOARD));
  els.refreshVersionsButton.addEventListener("click", () => void refreshWorkbenchFromServer());
  els.taskSelector.addEventListener("change", () => void selectTaskContext(els.taskSelector.value));
  els.versionSelector.addEventListener("change", () => void selectVersionContext(els.versionSelector.value));
  els.cloneVersionButton.addEventListener("click", () => void cloneSelectedVersion());
  els.deleteVersionButton.addEventListener("click", () => void deleteSelectedVersion());
  els.restoreVersionButton.addEventListener("click", () => void restoreSelectedVersion());
  els.purgeVersionButton.addEventListener("click", () => void purgeSelectedVersionFiles());
  els.dashboardProjectsButton.addEventListener("click", () => routeToScreen(SCREENS.PROJECTS));
  els.dashboardWorkbenchButton.addEventListener("click", () => routeToScreen(SCREENS.WORKBENCH));
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
  els.projectUploadLimitMb.addEventListener("input", () => {
    state.projectUploadLimitMb = Number(els.projectUploadLimitMb.value || 15);
    renderProjectCreateForm();
  });
  els.projectCreateLabelSchema.addEventListener("input", () => {
    state.projectCreateLabelSchema = els.projectCreateLabelSchema.value;
    renderProjectCreateForm();
  });
  els.projectSearchInput.addEventListener("input", () => {
    state.projectSearch = els.projectSearchInput.value;
    renderProjectSummaries();
  });
  els.includeDeletedProjects.addEventListener("change", () => {
    state.includeDeletedProjects = els.includeDeletedProjects.checked && state.sessionRole === ROLES.ADMIN;
    void refreshProjectSummaries();
  });
  els.loginButton.addEventListener("click", () => void loginSession());
  document.querySelectorAll("[data-session-logout]").forEach((button) => {
    button.addEventListener("click", () => void logoutSession());
  });
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
  els.assignmentWorkerId.addEventListener("change", () => {
    state.assignmentWorkerId = normalizeActorId(els.assignmentWorkerId.value);
    void persistProject();
    renderAssignmentPanel();
  });
  els.assignmentReviewerId.addEventListener("change", () => {
    state.assignmentReviewerId = normalizeActorId(els.assignmentReviewerId.value);
    void persistProject();
    renderAssignmentPanel();
  });
  els.reviewReason.addEventListener("input", () => {
    state.reviewReasonDraft = els.reviewReason.value;
  });
  els.reviewReasonCode.addEventListener("change", () => {
    state.reviewReasonCode = els.reviewReasonCode.value;
  });
  els.approvedOnlyExport.addEventListener("change", () => {
    state.exportApprovedOnly = els.approvedOnlyExport.checked;
    void persistProject();
    render();
  });
  els.trainingSetId.addEventListener("input", () => {
    state.trainingSetId = sanitizeUiId(els.trainingSetId.value);
    renderTrainingSetPanel();
  });
  els.trainingSetName.addEventListener("input", () => {
    state.trainingSetName = els.trainingSetName.value;
    renderTrainingSetPanel();
  });
  els.trainingSetDescription.addEventListener("input", () => {
    state.trainingSetDescription = els.trainingSetDescription.value;
  });
  [els.trainingSplitTrain, els.trainingSplitVal, els.trainingSplitTest, els.trainingSplitSeed].forEach((input) => {
    input.addEventListener("input", () => {
      state.trainingSplitTrain = Number(els.trainingSplitTrain.value || 0);
      state.trainingSplitVal = Number(els.trainingSplitVal.value || 0);
      state.trainingSplitTest = Number(els.trainingSplitTest.value || 0);
      state.trainingSplitSeed = Number(els.trainingSplitSeed.value || 42);
    });
  });
  els.createTrainingSetButton.addEventListener("click", () => void createSavedTrainingSet());
  els.trainingExportButton.addEventListener("click", () => void exportSelectedTrainingSet());
  els.refreshTrainingSetsButton.addEventListener("click", () => void refreshTrainingSets());
  els.includeDeletedTrainingSets.addEventListener("change", () => {
    state.includeDeletedTrainingSets = els.includeDeletedTrainingSets.checked && state.sessionRole === ROLES.ADMIN;
    void refreshTrainingSets();
  });
  els.settingsProjectName.addEventListener("input", () => {
    renderProjectSettingsPanel();
  });
  els.settingsProjectDescription.addEventListener("input", () => {
    renderProjectSettingsPanel();
  });
  els.settingsUploadLimitMb.addEventListener("input", () => {
    renderProjectSettingsPanel();
  });
  els.settingsAllowedFormats.addEventListener("input", () => {
    renderProjectSettingsPanel();
  });
  els.settingsLabelSchema.addEventListener("input", () => {
    renderProjectSettingsPanel();
  });
  els.settingsMagicTolerance.addEventListener("input", () => {
    state.settingsMagicTolerance = Number(els.settingsMagicTolerance.value || 42);
    editor.setMagicOptions({ colorTolerance: state.settingsMagicTolerance });
    renderProjectSettingsPanel();
  });
  els.settingsMagicEdge.addEventListener("input", () => {
    state.settingsMagicEdge = Number(els.settingsMagicEdge.value || 55);
    editor.setMagicOptions({ edgeThreshold: state.settingsMagicEdge });
    renderProjectSettingsPanel();
  });
  els.saveProjectSettingsButton.addEventListener("click", () => void saveProjectSettings());
  els.saveUserButton.addEventListener("click", () => void saveAdminUser());
  els.deactivateUserButton.addEventListener("click", () => void deactivateAdminUser());
  els.adminUserId.addEventListener("input", () => {
    state.adminUserDraft.userId = normalizeActorId(els.adminUserId.value);
  });
  els.adminDisplayName.addEventListener("input", () => {
    state.adminUserDraft.displayName = els.adminDisplayName.value;
  });
  els.adminUserRole.addEventListener("change", () => {
    state.adminUserDraft.role = normalizeRole(els.adminUserRole.value, ROLES.WORKER);
  });
  els.adminPassword.addEventListener("input", () => {
    state.adminUserDraft.password = els.adminPassword.value;
  });
  els.adminUserActive.addEventListener("change", () => {
    state.adminUserDraft.active = els.adminUserActive.checked;
  });

  window.addEventListener("hashchange", () => {
    renderScreen();
    void applyRouteFromHash();
  });
  window.addEventListener("keydown", handleShortcut);
  window.addEventListener("keyup", handleShortcutRelease);
  window.addEventListener("blur", deactivateSpacePan);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") deactivateSpacePan();
  });
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
    const validation = validateBrowserUploadFile(file, state.uploadPolicy);
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
  state.reviewReasonCode = image.reject_reason_code || state.reviewReasonCode || REJECTION_REASON_CODES.ROUGH_BOUNDARY;
  state.assignmentWorkerId = image.worker_id || state.assignmentWorkerId;
  state.assignmentReviewerId = image.reviewer_id || state.assignmentReviewerId;
  state.maskTransferMessage = "";
  state.maskTransferWarning = false;
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
  const maskDataUrl = await selectedClassMaskDataUrlForImage(image);
  await editor.loadImage(image.objectUrl, maskDataUrl || null);
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
    const response = await apiClient.listProjects({
      includeDeleted: state.includeDeletedProjects && state.sessionRole === ROLES.ADMIN,
    });
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

async function refreshVersionContext() {
  if (!state.projectId || !state.sessionAuthenticated) return;
  try {
    const taskResponse = await apiClient.listProjectTasks(state.projectId);
    state.taskSummaries = normalizeTaskSummaries(taskResponse.tasks || []);
    if (state.taskSummaries.length === 0) {
      if (canAdminMutateProject()) {
        const created = await apiClient.createProjectTask(state.projectId, {
          taskId: DEFAULT_TASK_ID,
          name: DEFAULT_TASK_ID,
        });
        state.taskSummaries = normalizeTaskSummaries([created.task]);
      } else {
        state.taskSummaries = normalizeTaskSummaries([{
          task_id: state.taskId || DEFAULT_TASK_ID,
          name: state.taskId || DEFAULT_TASK_ID,
        }]);
      }
    }
    if (!state.taskSummaries.some((task) => task.task_id === state.taskId)) {
      state.taskId = state.taskSummaries[0]?.task_id || DEFAULT_TASK_ID;
    }
    await refreshVersionSummaries();
    state.versionMessage = "Task/Version 목록 갱신됨";
    render();
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.versionMessage = normalized.message;
    renderVersionContext();
  }
}

async function refreshWorkbenchFromServer() {
  if (!state.projectId || !state.sessionAuthenticated) return;
  const localOnly = state.images.filter((image) => image.active_mask_dirty || hasSyncIssue(image));
  if (localOnly.length > 0) {
    const proceed = window.confirm(`${localOnly.length}개 항목에 로컬 전용 변경이 있습니다. 서버 데이터로 새로고침하면 이 화면의 로컬 변경이 덮어써질 수 있습니다. 계속할까요?`);
    if (!proceed) return;
  }

  setSaveState("saving", "서버 데이터 새로고침");
  try {
    const manifest = await apiClient.getProject(state.projectId);
    await restoreServerManifest(manifest);
    await refreshVersionContext();
    await refreshTrainingSources();
    await refreshTrainingSets();
    render();
    setSaveState("saved", "서버 데이터 갱신됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `서버 새로고침 실패: ${normalized.message}`);
  }
}

async function refreshVersionSummaries() {
  if (!state.projectId || !state.taskId) return;
  const versionResponse = await apiClient.listTaskVersions(state.projectId, state.taskId);
  state.versionSummaries = normalizeVersionSummaries(versionResponse.versions || []);
  if (state.versionSummaries.length === 0) {
    if (canAdminMutateProject()) {
      const created = await apiClient.createTaskVersion(state.projectId, state.taskId, {
        versionId: DEFAULT_VERSION_ID,
        status: "in_progress",
      });
      state.versionSummaries = normalizeVersionSummaries([created.version]);
    } else {
      state.versionSummaries = normalizeVersionSummaries([{
        version_id: state.versionId || DEFAULT_VERSION_ID,
        status: "read_only",
        revision: state.versionRevision || 0,
      }]);
    }
  }
  if (!state.versionSummaries.some((version) => version.version_id === state.versionId)) {
    state.versionId = state.versionSummaries[0]?.version_id || DEFAULT_VERSION_ID;
  }
}

async function selectTaskContext(taskId) {
  state.taskId = sanitizeUiId(taskId) || DEFAULT_TASK_ID;
  await refreshVersionSummaries();
  await loadSelectedVersionManifest();
}

async function selectVersionContext(versionId) {
  state.versionId = sanitizeUiId(versionId) || DEFAULT_VERSION_ID;
  await loadSelectedVersionManifest();
}

async function loadSelectedVersionManifest() {
  if (!state.projectId || !state.taskId || !state.versionId) return;
  setSaveState("saving", "버전 로딩");
  try {
    const response = await apiClient.getTaskVersion(state.projectId, state.taskId, state.versionId);
    const version = response.version || {};
    state.versionRevision = Number(version.revision || 0);
    if (Array.isArray(version.images) && version.images.length > 0) {
      await restoreServerManifest({
        ...version,
        project_id: version.project_id || state.projectId,
        name: version.project_name || state.projectName || state.projectId,
      });
    } else {
      state.versionMessage = "선택 버전에 이미지가 없어 현재 프로젝트 목록을 유지합니다.";
      render();
    }
    setSaveState("saved", "버전 선택됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.versionMessage = normalized.message;
    setSaveState("failed", `버전 로딩 실패: ${normalized.message}`);
    renderVersionContext();
  }
}

async function cloneSelectedVersion() {
  if (!canAdminMutateProject()) return;
  const nextVersionId = window.prompt("새 버전 ID", nextVersionName(state.versionId));
  if (!nextVersionId) return;
  setSaveState("saving", "버전 복제 중");
  try {
    const response = await apiClient.cloneTaskVersion(state.projectId, state.taskId, state.versionId, {
      newVersionId: nextVersionId,
      ifMatchRevision: state.versionRevision || undefined,
    });
    state.versionId = response.version?.version_id || sanitizeUiId(nextVersionId);
    await refreshVersionSummaries();
    state.versionMessage = "버전 복제 완료";
    render();
    setSaveState("saved", "버전 복제됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.versionMessage = normalized.message;
    setSaveState("failed", `버전 복제 실패: ${normalized.message}`);
  }
}

async function deleteSelectedVersion() {
  if (!canAdminMutateProject()) return;
  const reason = window.prompt("버전 삭제 사유", "wrong_version");
  if (reason === null) return;
  if (!window.confirm("선택 버전은 soft delete 처리됩니다. 계속할까요?")) return;
  setSaveState("saving", "버전 삭제 중");
  try {
    const response = await apiClient.deleteTaskVersion(state.projectId, state.taskId, state.versionId, {
      reason,
      ifMatchRevision: state.versionRevision || undefined,
    });
    state.versionRevision = Number(response.version?.revision || state.versionRevision || 0);
    await refreshVersionSummaries();
    state.versionMessage = "버전 삭제됨";
    render();
    setSaveState("saved", "버전 삭제됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.versionMessage = normalized.message;
    setSaveState("failed", `버전 삭제 실패: ${normalized.message}`);
  }
}

async function restoreSelectedVersion() {
  if (!canAdminMutateProject()) return;
  setSaveState("saving", "버전 복원 중");
  try {
    const response = await apiClient.restoreTaskVersion(state.projectId, state.taskId, state.versionId, {
      ifMatchRevision: state.versionRevision || undefined,
    });
    state.versionRevision = Number(response.version?.revision || state.versionRevision || 0);
    await refreshVersionSummaries();
    state.versionMessage = "버전 복원됨";
    render();
    setSaveState("saved", "버전 복원됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.versionMessage = normalized.message;
    setSaveState("failed", `버전 복원 실패: ${normalized.message}`);
  }
}

async function purgeSelectedVersionFiles() {
  if (!canAdminMutateProject()) return;
  if (!window.confirm("soft delete된 이미지/마스크 파일만 실제 삭제합니다. 복구할 수 없습니다. 계속할까요?")) return;
  setSaveState("saving", "삭제 파일 정리 중");
  try {
    const response = await apiClient.purgeTaskVersion(state.projectId, state.taskId, state.versionId);
    const count = Number(response.purge?.deleted_files || response.purge?.deletedFiles || 0);
    state.versionMessage = `${count}개 파일 정리됨`;
    renderVersionContext();
    setSaveState("saved", "삭제 파일 정리됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.versionMessage = normalized.message;
    setSaveState("failed", `삭제 파일 정리 실패: ${normalized.message}`);
  }
}

async function refreshTrainingSources() {
  if (!state.sessionAuthenticated || ![ROLES.ADMIN, ROLES.REVIEWER].includes(state.sessionRole)) return;
  try {
    const response = await apiClient.listTrainingSources();
    state.trainingSources = Array.isArray(response.sources) ? response.sources : [];
    if (state.selectedTrainingSourceIds.size === 0 && state.projectId && state.taskId && state.versionId) {
      state.selectedTrainingSourceIds.add(sourceKey({
        project_id: state.projectId,
        task_id: state.taskId,
        version_id: state.versionId,
      }));
    }
    renderTrainingSourcePicker();
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.trainingSources = [];
    state.lastExportMessage = `source 목록 실패: ${normalized.message}`;
  }
}

async function refreshTrainingSets() {
  if (!state.sessionAuthenticated || ![ROLES.ADMIN, ROLES.REVIEWER].includes(state.sessionRole)) return;
  try {
    const response = await apiClient.listTrainingSets({
      includeDeleted: state.includeDeletedTrainingSets && state.sessionRole === ROLES.ADMIN,
    });
    state.trainingSets = Array.isArray(response.training_sets) ? response.training_sets : [];
    state.trainingSetMessage = `${state.trainingSets.length}개 training set`;
    renderTrainingSetPanel();
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.trainingSets = [];
    state.trainingSetMessage = `Training set 목록 실패: ${normalized.message}`;
    renderTrainingSetPanel();
  }
}

async function saveProjectSettings() {
  if (!canAdminMutateProject()) return;
  const maxFileBytes = Math.max(1, Number(els.settingsUploadLimitMb.value || 15)) * 1024 * 1024;
  const allowedMimeTypes = parseCsv(els.settingsAllowedFormats.value);
  let labelSchema;
  try {
    labelSchema = parseLabelSchemaText(els.settingsLabelSchema.value);
  } catch (error) {
    state.projectSettingsMessage = error.message;
    renderProjectSettingsPanel();
    setSaveState("failed", `라벨 저장 실패: ${error.message}`);
    return;
  }
  setSaveState("saving", "프로젝트 설정 저장 중");
  try {
    const response = await apiClient.updateProjectSettings(state.projectId, {
      name: els.settingsProjectName.value || state.projectName,
      description: els.settingsProjectDescription.value || state.projectDescription || "",
      uploadPolicy: {
        maxFileBytes,
        allowedMimeTypes,
      },
      magicToolPreset: {
        colorTolerance: Number(els.settingsMagicTolerance.value || state.settingsMagicTolerance),
        edgeThreshold: Number(els.settingsMagicEdge.value || state.settingsMagicEdge),
      },
      labelSchema,
    });
    state.projectName = response.settings?.name || state.projectName;
    state.projectDescription = response.settings?.description || state.projectDescription || "";
    state.uploadPolicy = normalizeUploadPolicy(response.settings?.upload_policy || {}, state.uploadPolicy);
    state.labelSchema = normalizeLabelSchema(response.settings?.label_schema || labelSchema);
    ensureSelectedClassId();
    const preset = response.settings?.magic_tool_preset || {};
    state.settingsMagicTolerance = Number(preset.color_tolerance || preset.colorTolerance || state.settingsMagicTolerance);
    state.settingsMagicEdge = Number(preset.edge_threshold || preset.edgeThreshold || state.settingsMagicEdge);
    editor.setMagicOptions({
      colorTolerance: state.settingsMagicTolerance,
      edgeThreshold: state.settingsMagicEdge,
    });
    state.projectSettingsMessage = "프로젝트 설정 저장됨";
    await persistProject();
    render();
    setSaveState("saved", "프로젝트 설정 저장됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.projectSettingsMessage = normalized.message;
    setSaveState("failed", `설정 저장 실패: ${normalized.message}`);
  }
}

async function saveAdminUser() {
  if (state.sessionRole !== ROLES.ADMIN) return;
  const draft = state.adminUserDraft;
  if (!draft.userId) {
    state.adminUserMessage = "사용자 ID를 입력하세요";
    renderAccountAdminPanel();
    return;
  }
  setSaveState("saving", "사용자 저장 중");
  try {
    const payload = {
      userId: draft.userId,
      displayName: draft.displayName || draft.userId,
      role: draft.role,
      password: draft.password || undefined,
      active: draft.active,
    };
    const exists = state.adminUsers.some((user) => user.user_id === draft.userId);
    const response = exists
      ? await apiClient.updateUser(draft.userId, payload)
      : await apiClient.createUser(payload);
    state.adminUserMessage = `${response.user?.user_id || draft.userId} 저장됨`;
    state.adminUserDraft.password = "";
    els.adminPassword.value = "";
    await refreshAssignmentUsers();
    renderAccountAdminPanel();
    setSaveState("saved", "사용자 저장됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.adminUserMessage = normalized.message;
    setSaveState("failed", `사용자 저장 실패: ${normalized.message}`);
  }
}

async function deactivateAdminUser() {
  if (state.sessionRole !== ROLES.ADMIN || !state.adminUserDraft.userId) return;
  setSaveState("saving", "사용자 비활성화 중");
  try {
    await apiClient.updateUser(state.adminUserDraft.userId, { active: false });
    state.adminUserDraft.active = false;
    state.adminUserMessage = `${state.adminUserDraft.userId} 비활성화됨`;
    await refreshAssignmentUsers();
    renderAccountAdminPanel();
    setSaveState("saved", "사용자 비활성화됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.adminUserMessage = normalized.message;
    setSaveState("failed", `사용자 비활성화 실패: ${normalized.message}`);
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
    state.includeDeletedProjects = state.sessionRole === ROLES.ADMIN && state.includeDeletedProjects;
    state.sessionPassword = "";
    state.sessionAuthenticated = Boolean(state.sessionToken);
    await persistProject();
    render();
    routeToScreen(SCREENS.PROJECTS);
    void refreshProjectSummaries();
    void refreshAssignmentUsers();
    void refreshVersionContext();
    void refreshTrainingSources();
    void refreshTrainingSets();
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
  state.includeDeletedProjects = false;
  state.includeDeletedTrainingSets = false;
  state.trainingSets = [];
  state.assignmentUsers = { workers: [], reviewers: [], error: "" };
  await persistProject();
  render();
  routeToScreen(SCREENS.LOGIN);
  setSaveState("saved", "로그아웃됨");
}

async function refreshAssignmentUsers() {
  if (!state.sessionAuthenticated || state.sessionRole !== ROLES.ADMIN) return;
  try {
    const [workerResponse, reviewerResponse, allResponse] = await Promise.all([
      apiClient.listUsers({ role: ROLES.WORKER }),
      apiClient.listUsers({ role: ROLES.REVIEWER }),
      apiClient.listUsers(),
    ]);
    state.assignmentUsers = {
      workers: Array.isArray(workerResponse.users) ? workerResponse.users : [],
      reviewers: Array.isArray(reviewerResponse.users) ? reviewerResponse.users : [],
      error: "",
    };
    state.adminUsers = Array.isArray(allResponse.users) ? allResponse.users : [];
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.assignmentUsers = {
      workers: [],
      reviewers: [],
      error: normalized.message,
    };
    state.adminUsers = [];
    logger.warn("assignment.users.failed", {
      project_id: state.projectId,
      error: normalized,
    });
  }
  renderAssignmentPanel();
}

async function saveCurrentMask() {
  const image = getSelectedImage();
  if (!image) return;

  setSaveState("saving", "저장 중");
  const { blob, dataUrl } = await saveEditorMaskForSelectedClass(image, { status: image.status });
  state.savedAt = new Date();
  await persistProject();
  await syncMaskToBackend(image, dataUrl, image.status);
  render();
  downloadBlob(blob, `${image.id}_mask.png`);
  setSaveState("saved", "저장됨");
}

async function submitCurrentImage() {
  const image = getSelectedImage();
  if (!image) return;

  setSaveState("saving", "제출 저장 중");
  const { dataUrl } = await saveEditorMaskForSelectedClass(image, { status: "submitted" });
  image.submittedAt = new Date().toISOString();
  image.updatedAt = image.submittedAt;
  state.savedAt = new Date();
  await persistProject();
  await syncMaskToBackend(image, dataUrl, "submitted");
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

async function copyMaskFromPreviousImage() {
  const image = getSelectedImage();
  const source = previousMaskSourceImage();
  if (!image || !source) {
    setMaskTransferMessage("이전 프레임 마스크가 없습니다.", true);
    return;
  }
  if (canStartRevision(image) && !window.confirm("제출/승인된 마스크를 수정 모드로 전환하고 이전 프레임 마스크를 적용할까요?")) {
    return;
  }
  if (!canStartRevision(image) && hasExistingMask(image) && !window.confirm("현재 마스크를 이전 프레임 마스크로 교체할까요?")) {
    return;
  }

  setSaveState("saving", "이전 마스크 적용 중");
  try {
    const maskDataUrl = await maskDataUrlForImage(source);
    if (!maskDataUrl) {
      setMaskTransferMessage("이전 프레임에 저장된 마스크가 없습니다.", true);
      setSaveState("failed", "이전 마스크 없음");
      return;
    }
    await editor.replaceMaskFromDataUrl(maskDataUrl);
    handleEditorChange();
    setTool("mask_move");
    const resized = Number(source.width) !== Number(image.width) || Number(source.height) !== Number(image.height);
    const resizeNote = resized ? " 현재 이미지 해상도에 맞게 마스크 크기를 조정했습니다." : "";
    setMaskTransferMessage(`이전 마스크 적용됨: ${source.original_file_name || source.fileName || source.id}.${resizeNote} 마스크 이동 M으로 위치를 보정하세요.`);
  } catch (error) {
    setMaskTransferMessage(error.message || "이전 마스크 적용 실패", true);
    setSaveState("failed", `이전 마스크 적용 실패: ${error.message || "unknown"}`);
  }
}

async function requestAiDraftMask() {
  const image = getSelectedImage();
  const label = selectedLabel();
  if (!image || !label) {
    setAiDraftMessage("이미지와 라벨을 먼저 선택하세요.", true);
    return;
  }
  if (![ROLES.ADMIN, ROLES.WORKER].includes(state.sessionRole)) {
    setAiDraftMessage("작업자 또는 관리자만 AI 초안을 가져올 수 있습니다.", true);
    return;
  }
  if (canStartRevision(image) && !window.confirm("제출/승인된 마스크를 수정 모드로 전환하고 AI 초안을 적용할까요?")) {
    return;
  }

  setSaveState("saving", "AI 초안 요청 중");
  setAiDraftMessage("AI 초안 요청 중");
  try {
    const imageDataUrl = await imageDataUrlForAi(image);
    if (!imageDataUrl) {
      setAiDraftMessage("AI 요청에 사용할 원본 이미지를 찾을 수 없습니다.", true);
      setSaveState("failed", "AI 원본 이미지 없음");
      return;
    }
    const labels = activeLabelSchema();
    const response = await apiClient.requestAiInference({
      task: "segmentation",
      image: {
        dataUrl: imageDataUrl,
        width: image.width,
        height: image.height,
      },
      options: {
        allowed_class_ids: labels.filter((item) => item.enabled !== false).map((item) => item.class_id),
      },
    });
    const result = await importAiPredictionMask(image, response.predictions || [], label.class_id);
    if (!result.imported) {
      setAiDraftMessage(result.message, true);
      setSaveState("saved", "AI 예측 없음");
      return;
    }
    setAiDraftMessage(result.message);
    setSaveState("saved", "AI 초안 가져옴");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setAiDraftMessage(normalized.message, true);
    setSaveState("failed", `AI 초안 실패: ${normalized.message}`);
  }
}

async function importAiPredictionMask(image, predictions, classId) {
  const selected = selectAiPredictionForClass(predictions, classId, activeLabelSchema());
  if (!selected.valid) {
    return { imported: false, message: aiPredictionReasonLabel(selected.reason) };
  }
  const prediction = selected.prediction;
  if (Number(state.selectedClassId) !== Number(prediction.class_id)) {
    state.selectedClassId = prediction.class_id;
    applySelectedLabelColor();
  }
  if (canStartRevision(image)) {
    startRevisionMode(image, { reason: "ai_prediction_import" });
  } else if (!["in_progress", "rework"].includes(image.status)) {
    image.status = "in_progress";
  }
  await editor.replaceMaskFromDataUrl(prediction.mask_data_url);
  image.pending_annotation_source = "ai";
  image.pending_annotation_score = prediction.score;
  const { dataUrl } = await saveEditorMaskForSelectedClass(image, {
    status: image.status || "in_progress",
    source: "ai",
    score: prediction.score,
  });
  await persistProject();
  await syncMaskToBackend(image, dataUrl, image.status);
  render();
  return {
    imported: true,
    message: `AI 초안 적용: ${prediction.class_name} / class_id=${prediction.class_id}`,
  };
}

async function imageDataUrlForAi(image) {
  let blob = await projectStore.loadImageBlob(image.id);
  if (!blob && state.projectId && image.image_path) {
    await restoreServerImageBlob(image);
    blob = await projectStore.loadImageBlob(image.id);
  }
  return blob ? blobToDataUrl(blob) : "";
}

function aiPredictionReasonLabel(reason) {
  return {
    prediction_not_found: "선택 라벨에 대한 AI 예측이 없습니다.",
    unknown_class_id: "AI 예측 라벨이 현재 프로젝트 라벨에 없습니다.",
    disabled_class_id: "AI 예측 라벨이 비활성 상태입니다.",
    mask_data_url_required: "AI 예측에 마스크 이미지가 없습니다.",
  }[reason] || "AI 예측을 가져올 수 없습니다.";
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
    const exportPaths = createExportPaths(image, { index });
    if (imageBlob) {
      entries.push({ path: exportPaths.image_path, data: imageBlob });
    }
  }

  for (const annotation of annotations.annotations) {
    const image = validImages.find((item) => item.id === annotation.image_id);
    const maskBlob = await localExportMaskBlobForAnnotation(image, annotation);
    if (image && maskBlob) {
      entries.push({ path: annotation.mask_path, data: maskBlob });
    }
  }

  const zip = await createZipBlob(entries);
  downloadBlob(zip, `export_${state.projectId}.zip`);
  await persistProject();
  render();
  setSaveState("saved", "ZIP 내보냄");
}

async function localExportMaskBlobForAnnotation(image, annotation = {}) {
  if (!image) return null;
  if (annotation.class_id) {
    const classBlob = await projectStore.loadMaskBlob(annotationMaskBlobKey(image.id, annotation.class_id));
    if (classBlob) return classBlob;
  }
  if (!annotation.class_id || annotation.mask_path === image.current_mask_path || annotation.mask_path === image.maskPath) {
    return projectStore.loadMaskBlob(image.id);
  }
  return null;
}

async function exportSelectedTrainingSet() {
  const sources = selectedTrainingSources();
  if (sources.length === 0) {
    setSaveState("failed", "Training source를 선택하세요");
    return;
  }
  setSaveState("saving", "Training set 내보내는 중");
  try {
    const zip = await apiClient.downloadTrainingSetExport({
      sources,
      approvedOnly: state.exportApprovedOnly,
    });
    downloadBlob(zip, `training_set_${new Date().toISOString().slice(0, 10)}.zip`);
    setSaveState("saved", "Training set ZIP 내보냄");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `Training export 실패: ${normalized.message}`);
  }
}

async function createSavedTrainingSet() {
  const sources = selectedTrainingSources();
  const trainingSetId = sanitizeUiId(state.trainingSetId || suggestedTrainingSetId());
  if (sources.length === 0) {
    setSaveState("failed", "Training source를 선택하세요");
    return;
  }
  if (!trainingSetId) {
    setSaveState("failed", "Training set ID를 입력하세요");
    return;
  }
  setSaveState("saving", "Training set 저장 중");
  try {
    const response = await apiClient.createTrainingSet({
      trainingSetId,
      name: state.trainingSetName || trainingSetId,
      description: state.trainingSetDescription,
      sources,
      approvedOnly: state.exportApprovedOnly,
      split: currentTrainingSplit(),
    });
    const manifest = response.training_set_manifest || {};
    state.trainingSetId = manifest.training_set_id || trainingSetId;
    state.trainingSetName = manifest.name || state.trainingSetName;
    state.trainingSetMessage = "Training set 저장됨";
    await refreshTrainingSets();
    await persistProject();
    setSaveState("saved", "Training set 저장됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.trainingSetMessage = normalized.message;
    renderTrainingSetPanel();
    setSaveState("failed", `Training set 저장 실패: ${normalized.message}`);
  }
}

async function exportSavedTrainingSet(trainingSetId) {
  setSaveState("saving", "저장된 Training set 내보내는 중");
  try {
    const zip = await apiClient.downloadTrainingSetExport({ trainingSetId });
    downloadBlob(zip, `training_set_${trainingSetId}.zip`);
    setSaveState("saved", "저장된 Training set ZIP 내보냄");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `Training set export 실패: ${normalized.message}`);
  }
}

async function archiveSavedTrainingSet(trainingSet) {
  if (state.sessionRole !== ROLES.ADMIN) return;
  if (!window.confirm("이 Training set을 목록에서 보관 처리합니다. 원본 프로젝트/버전 데이터는 삭제하지 않습니다. 진행할까요?")) return;
  setSaveState("saving", "Training set 보관 중");
  try {
    await apiClient.archiveTrainingSet(trainingSet.training_set_id, {
      reason: "archived_from_ui",
      ifMatchRevision: trainingSet.revision || undefined,
    });
    state.trainingSetMessage = "Training set 보관됨";
    await refreshTrainingSets();
    setSaveState("saved", "Training set 보관됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.trainingSetMessage = normalized.message;
    renderTrainingSetPanel();
    setSaveState("failed", `Training set 보관 실패: ${normalized.message}`);
  }
}

async function restoreSavedTrainingSet(trainingSet) {
  if (state.sessionRole !== ROLES.ADMIN) return;
  setSaveState("saving", "Training set 복원 중");
  try {
    await apiClient.restoreTrainingSet(trainingSet.training_set_id, {
      ifMatchRevision: trainingSet.revision || undefined,
    });
    state.trainingSetMessage = "Training set 복원됨";
    await refreshTrainingSets();
    setSaveState("saved", "Training set 복원됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.trainingSetMessage = normalized.message;
    renderTrainingSetPanel();
    setSaveState("failed", `Training set 복원 실패: ${normalized.message}`);
  }
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
      classId: state.selectedClassId,
      className: selectedLabel()?.name || "",
      annotationSource: image.pending_annotation_source || "manual",
      score: image.pending_annotation_score,
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
    image.pending_annotation_source = "";
    image.pending_annotation_score = null;
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
    void refreshVersionContext();
    void refreshTrainingSources();
    void refreshTrainingSets();
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
      reasonCode: image.reject_reason_code || state.reviewReasonCode,
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
    reasonCode: state.reviewReasonCode,
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
  state.reviewReasonCode = image.reject_reason_code || state.reviewReasonCode;
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
      reasonCode: state.reviewReasonCode,
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
  image.active_mask_dirty = true;
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
  await saveEditorMaskForSelectedClass(image, { status: image.status });
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
  renderVersionContext();
  renderDashboard();
  renderImageList();
  renderMetadata();
  renderValidation();
  renderSessionPanel();
  renderAssignmentPanel();
  renderReviewPanel();
  renderReviewIdentity();
  renderLabelSelector();
  renderAiDraftPanel();
  renderMaskTransferPanel();
  renderExportPolicy();
  renderTrainingSourcePicker();
  renderTrainingSetPanel();
  renderProjectSettingsPanel();
  renderAccountAdminPanel();
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
  if ((screen === SCREENS.WORKBENCH || screen === SCREENS.DASHBOARD) && !canEnterWorkbench()) {
    screen = SCREENS.PROJECTS;
  }
  if (screen !== requested && window.location.hash !== `#/${screen}`) {
    window.history.replaceState(null, "", `#/${screen}`);
  }

  els.loginScreen.hidden = screen !== SCREENS.LOGIN;
  els.projectsScreen.hidden = screen !== SCREENS.PROJECTS;
  els.dashboardScreen.hidden = screen !== SCREENS.DASHBOARD;
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
  const summary = summarizeAssignmentQueue(activeImages(), {
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
  const listScroll = captureImageListScroll();
  const deletedOnly = state.filter === "deleted";
  const sourceImages = deletedOnly ? state.images.filter(isDeletedImage) : activeImages();
  const queueFiltered = filterImagesForQueue(sourceImages, {
    queueMode: state.queueMode,
    statusFilter: state.filter === "sync_needed" || deletedOnly ? "all" : state.filter,
    sessionUserId: state.sessionUserId,
  });
  const filtered = filterImagesByDiscovery(queueFiltered, {
    search: state.imageSearch,
    syncNeededOnly: state.filter === "sync_needed",
  });
  const activeCount = activeImages().length;
  const deletedCount = state.images.filter(isDeletedImage).length;
  const submittedCount = activeImages().filter((image) => image.status === "submitted").length;
  els.progressText.textContent = `${submittedCount}/${activeCount} 제출 · ${filtered.length}개 표시${deletedCount ? ` · 삭제 ${deletedCount}` : ""}`;
  if (document.activeElement !== els.imageSearchInput) {
    els.imageSearchInput.value = state.imageSearch;
  }

  const rows = filtered.map((image) => {
    const row = document.createElement("div");
    row.className = "image-row-shell";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `image-row ${image.id === state.selectedId ? "selected" : ""} ${isDeletedImage(image) ? "deleted" : ""}`;
    button.addEventListener("click", () => void selectImage(image.id));
    button.innerHTML = `
      <img src="${image.objectUrl}" alt="">
      <span class="image-row-main">
        <strong>${escapeHtml(image.fileName)}</strong>
        <small>${image.width}×${image.height} · ${isDeletedImage(image) ? "삭제됨" : syncListLabel(image)}</small>
      </span>
      <span class="status-chip ${image.status}">${statusLabel(image.status)}</span>
    `;
    const action = document.createElement("button");
    action.type = "button";
    action.className = `icon-button small image-row-action ${isDeletedImage(image) ? "restore" : "danger"}`;
    action.title = isDeletedImage(image) ? "이미지 복원" : "이미지 제거";
    action.setAttribute("aria-label", `${image.fileName || image.id} ${isDeletedImage(image) ? "복원" : "제거"}`);
    action.textContent = isDeletedImage(image) ? "↺" : "×";
    action.disabled = !canEditImageCollection();
    action.addEventListener("click", (event) => {
      event.stopPropagation();
      void toggleImageRemoval(image.id);
    });
    row.replaceChildren(button, action);
    return row;
  });

  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list-row";
    empty.innerHTML = "<strong>표시할 이미지 없음</strong><small>검색어 또는 필터를 조정하세요.</small>";
    rows.push(empty);
  }
  els.imageList.replaceChildren(...rows);
  restoreImageListScroll(listScroll);
}

function captureImageListScroll() {
  return {
    top: els.imageList.scrollTop,
    left: els.imageList.scrollLeft,
  };
}

function restoreImageListScroll(position) {
  els.imageList.scrollTop = position?.top || 0;
  els.imageList.scrollLeft = position?.left || 0;
}

function renderUploadRejections() {
  const items = (state.uploadRejections || []).map((item) => {
    const element = document.createElement("li");
    const reasonText = (item.reasons || []).map(uploadReasonLabel).join(", ");
    element.innerHTML = `
      <span>${escapeHtml(item.fileName || "이름 없는 파일")}</span>
      <small>${escapeHtml(reasonText)} · ${formatBytes(item.sizeBytes)} / 최대 ${formatBytes(state.uploadPolicy.maxFileBytes)}</small>
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

  if (document.activeElement !== els.projectSearchInput) {
    els.projectSearchInput.value = state.projectSearch;
  }
  els.includeDeletedProjects.checked = Boolean(state.includeDeletedProjects && state.sessionRole === ROLES.ADMIN);
  els.includeDeletedProjects.disabled = state.sessionRole !== ROLES.ADMIN;
  const filteredProjects = filterProjectsBySearch(state.projectSummaries || [], state.projectSearch);
  const items = filteredProjects.map((project) => {
    const row = document.createElement("div");
    row.className = `project-summary-row ${project.project_id === state.projectId ? "current" : ""}`;
    const main = document.createElement("button");
    main.type = "button";
    main.className = "project-summary-main";
    main.dataset.projectId = project.project_id || "";
    main.disabled = Boolean(project.deleted_at);
    main.addEventListener("click", () => void loadServerProject(project.project_id));
    main.innerHTML = `
      <span>
        <strong>${escapeHtml(project.name || project.project_id || "Untitled")}</strong>
        <small>${project.deleted_at ? "삭제됨 · " : ""}${project.submitted_images || 0} 제출 · ${project.approved_images || 0} 승인 · ${project.rejected_images || 0} 반려</small>
      </span>
      <output>${project.total_images || 0}</output>
    `;
    row.append(main);
    if (state.sessionRole === ROLES.ADMIN) {
      const actions = document.createElement("div");
      actions.className = "project-summary-actions";
      if (project.deleted_at) {
        actions.append(
          projectActionButton("복원", () => void restoreProjectFromSummary(project)),
          projectActionButton("완전삭제", () => void purgeProjectFromSummary(project), "danger"),
        );
      } else {
        actions.append(
          projectActionButton("수정", () => void editProjectFromSummary(project)),
          projectActionButton("삭제", () => void archiveProjectFromSummary(project), "danger"),
        );
      }
      row.append(actions);
    }
    return row;
  });

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "project-summary-row";
    empty.innerHTML = state.projectSearch
      ? "<span><strong>검색 결과 없음</strong><small>프로젝트 이름 또는 ID를 다시 확인하세요.</small></span>"
      : "<span><strong>서버 프로젝트 없음</strong><small>관리자가 새 프로젝트를 생성하면 표시됩니다.</small></span>";
    items.push(empty);
  }
  els.projectSummaryList.replaceChildren(...items);
}

function projectActionButton(label, handler, variant = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${variant}`;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}

function renderProjectCreateForm() {
  if (document.activeElement !== els.projectCreateId) {
    els.projectCreateId.value = state.projectCreateId;
  }
  if (document.activeElement !== els.projectCreateName) {
    els.projectCreateName.value = state.projectCreateName;
  }
  if (document.activeElement !== els.projectUploadLimitMb) {
    els.projectUploadLimitMb.value = String(state.projectUploadLimitMb || 15);
  }
  if (document.activeElement !== els.projectCreateLabelSchema) {
    els.projectCreateLabelSchema.value = state.projectCreateLabelSchema;
  }
  els.createProjectButton.disabled = state.sessionRole !== ROLES.ADMIN || !canEnterProjects();
  els.projectCreateMessage.textContent = state.projectCreateMessage
    || (state.sessionRole === ROLES.ADMIN
      ? "관리자는 새 프로젝트를 만들고 작업도구로 진입할 수 있습니다."
      : "프로젝트 생성은 관리자 권한에서만 사용할 수 있습니다.");
}

function renderProjectHeader() {
  const versionLabel = state.projectId ? ` · ${state.taskId}/${state.versionId}` : "";
  els.projectName.textContent = `${state.projectName || "프로젝트 미선택"}${versionLabel}`;
}

function renderVersionContext() {
  replaceSelectOptions(els.taskSelector, state.taskSummaries, {
    valueKey: "task_id",
    label: (task) => task.name || task.task_id,
    selected: state.taskId,
    fallback: { value: state.taskId || DEFAULT_TASK_ID, label: state.taskId || DEFAULT_TASK_ID },
  });
  replaceSelectOptions(els.versionSelector, state.versionSummaries, {
    valueKey: "version_id",
    label: (version) => {
      const suffix = version.deleted_at ? " 삭제됨" : "";
      return `${version.version_id}${suffix}`;
    },
    selected: state.versionId,
    fallback: { value: state.versionId || DEFAULT_VERSION_ID, label: state.versionId || DEFAULT_VERSION_ID },
  });
  const canMutate = canAdminMutateProject();
  els.refreshVersionsButton.disabled = !state.projectId || !state.sessionAuthenticated;
  els.cloneVersionButton.disabled = !canMutate || !state.versionId;
  els.deleteVersionButton.disabled = !canMutate || !state.versionId || selectedVersionSummary()?.deleted_at;
  els.restoreVersionButton.disabled = !canMutate || !selectedVersionSummary()?.deleted_at;
  els.purgeVersionButton.disabled = !canMutate || !state.versionId;
}

function renderDashboard() {
  if (!els.dashboardScreen) return;
  const summary = createDashboardSummary({
    manifest: {
      project_id: state.projectId,
      name: state.projectName,
      images: state.images.map(toDashboardImage),
    },
  });
  els.dashboardProjectName.textContent = state.projectName || "운영 대시보드";
  els.dashboardWorkbenchButton.disabled = !canEnterWorkbench();
  els.dashboardHealthGrid.replaceChildren(
    dashboardMetric("전체", summary.totals.total),
    dashboardMetric("작업중", summary.totals.inProgress),
    dashboardMetric("제출", summary.totals.submitted),
    dashboardMetric("승인", summary.totals.approved),
    dashboardMetric("반려", summary.totals.rejected),
    dashboardMetric("Export", summary.totals.exportReady),
  );
  els.dashboardWorkloadBody.replaceChildren(...dashboardWorkloadRows(summary.workload));
  els.dashboardExportReadiness.replaceChildren(
    dashboardDefinition("기본", `${summary.exportReadiness.defaultPolicy.included}/${summary.exportReadiness.defaultPolicy.total}`),
    dashboardDefinition("승인만", `${summary.exportReadiness.approvedOnlyPolicy.included}/${summary.exportReadiness.approvedOnlyPolicy.total}`),
    dashboardDefinition("동기화", `${summary.exportReadiness.syncBlockers.length}건`),
  );
  els.dashboardReviewQuality.replaceChildren(
    dashboardDefinition("승인율", formatRate(summary.reviewQuality.approvalRate)),
    dashboardDefinition("반려율", formatRate(summary.reviewQuality.rejectionRate)),
    dashboardDefinition("반려 이벤트", String(summary.reviewQuality.rejections)),
    dashboardDefinition("주요 사유", summary.reviewQuality.topRejectReasons[0]?.reasonLabel || "-"),
  );
  els.dashboardBlockers.replaceChildren(...summary.blockers.slice(0, 6).map((blocker) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${escapeHtml(blocker.imageName || blocker.imageId || "-")}</strong><span>${escapeHtml(blocker.label)}</span>`;
    return item;
  }));
  if (summary.blockers.length === 0) {
    const item = document.createElement("li");
    item.textContent = "현재 주요 blocker 없음";
    els.dashboardBlockers.replaceChildren(item);
  }
  els.dashboardActivityList.replaceChildren(...dashboardActivityRows(summary.recentActivity));
}

function toDashboardImage(image) {
  return {
    ...image,
    original_file_name: image.original_file_name || image.fileName,
    image_path: image.image_path || "",
    current_mask_path: image.current_mask_path || "",
    mask_width: image.mask_width || image.width,
    mask_height: image.mask_height || image.height,
    mask_values_valid: image.mask_values_valid,
    object_url: image.objectUrl || image.object_url || "",
    mask_data_url: image.maskDataUrl || image.mask_data_url || "",
  };
}

function dashboardMetric(label, value) {
  const item = document.createElement("div");
  item.innerHTML = `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`;
  return item;
}

function dashboardDefinition(label, value) {
  const item = document.createElement("div");
  item.innerHTML = `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`;
  return item;
}

function formatRate(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function dashboardWorkloadRows(workload) {
  if (workload.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = "<td colspan=\"5\">배정된 작업 없음</td>";
    return [row];
  }
  return workload.map((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(item.userId)}</td>
      <td>${escapeHtml(item.role)}</td>
      <td>${item.assigned}</td>
      <td>${item.awaitingReview}</td>
      <td>${item.rejectedOrRework}</td>
    `;
    return row;
  });
}

function dashboardActivityRows(activity) {
  if (activity.length === 0) {
    const row = document.createElement("div");
    row.className = "project-summary-row";
    row.innerHTML = "<span><strong>최근 이벤트 없음</strong><small>제출/리뷰/재작업 이벤트가 여기에 표시됩니다.</small></span>";
    return [row];
  }
  return activity.slice(0, 8).map((event) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "project-summary-row";
    row.addEventListener("click", () => {
      if (event.imageId) void selectImage(event.imageId);
      routeToScreen(SCREENS.WORKBENCH);
    });
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(event.imageName || event.imageId || "-")}</strong>
        <small>${escapeHtml(event.action)} · ${escapeHtml(event.actor || "-")} · ${escapeHtml(event.createdAt || "")}</small>
      </span>
    `;
    return row;
  });
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
  let labelSchema;
  try {
    labelSchema = parseLabelSchemaText(state.projectCreateLabelSchema);
  } catch (error) {
    state.projectCreateMessage = error.message;
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
      uploadPolicy: {
        maxFileBytes: Math.max(1, Number(state.projectUploadLimitMb || 15)) * 1024 * 1024,
      },
      labelSchema,
    });
    setActiveProjectFromManifest(manifest, {
      clearImages: true,
      fallbackId: projectId,
      fallbackName: projectName,
    });
    state.projectCreateId = "";
    state.projectCreateName = "";
    state.projectUploadLimitMb = 15;
    state.projectCreateLabelSchema = "";
    state.projectCreateMessage = "프로젝트 생성 완료";
    await persistProject();
    void refreshProjectSummaries();
    render();
    routeToScreen(SCREENS.DASHBOARD);
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
    await refreshVersionContext();
    await refreshTrainingSources();
    routeToScreen(SCREENS.DASHBOARD);
    setSaveState("saved", "서버 프로젝트 선택됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    state.projectSummariesError = normalized.message;
    renderProjectSummaries();
    setSaveState("failed", `프로젝트 로딩 실패: ${normalized.message}`);
  }
}

async function editProjectFromSummary(project) {
  if (state.sessionRole !== ROLES.ADMIN || !project?.project_id) return;
  const name = window.prompt("프로젝트 이름", project.name || project.project_id);
  if (name === null) return;
  const description = window.prompt("프로젝트 설명", project.description || "");
  if (description === null) return;
  setSaveState("saving", "프로젝트 수정 중");
  try {
    const response = await apiClient.updateProjectSettings(project.project_id, {
      name,
      description,
      ifMatchRevision: project.revision || undefined,
    });
    if (project.project_id === state.projectId) {
      state.projectName = response.settings?.name || name || state.projectName;
      state.projectDescription = response.settings?.description || description || state.projectDescription;
      await persistProject();
    }
    await refreshProjectSummaries();
    render();
    setSaveState("saved", "프로젝트 수정됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `프로젝트 수정 실패: ${normalized.message}`);
  }
}

async function archiveProjectFromSummary(project) {
  if (state.sessionRole !== ROLES.ADMIN || !project?.project_id) return;
  const reason = window.prompt("프로젝트 삭제 사유", "wrong_project");
  if (reason === null) return;
  if (!window.confirm("프로젝트를 삭제됨 상태로 보냅니다. 복원 전까지 일반 목록과 작업에서 숨겨집니다. 계속할까요?")) return;
  setSaveState("saving", "프로젝트 삭제 중");
  try {
    await apiClient.archiveProject(project.project_id, {
      reason,
      ifMatchRevision: project.revision || undefined,
    });
    if (project.project_id === state.projectId) {
      await closeActiveProjectContext();
      routeToScreen(SCREENS.PROJECTS);
    }
    await refreshProjectSummaries();
    render();
    setSaveState("saved", "프로젝트 삭제됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `프로젝트 삭제 실패: ${normalized.message}`);
  }
}

async function restoreProjectFromSummary(project) {
  if (state.sessionRole !== ROLES.ADMIN || !project?.project_id) return;
  setSaveState("saving", "프로젝트 복원 중");
  try {
    await apiClient.restoreProject(project.project_id, {
      ifMatchRevision: project.revision || undefined,
    });
    await refreshProjectSummaries();
    render();
    setSaveState("saved", "프로젝트 복원됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `프로젝트 복원 실패: ${normalized.message}`);
  }
}

async function purgeProjectFromSummary(project) {
  if (state.sessionRole !== ROLES.ADMIN || !project?.project_id || !project.deleted_at) return;
  if (!window.confirm("삭제된 프로젝트 파일을 실제로 제거합니다. 복구할 수 없습니다. 계속할까요?")) return;
  setSaveState("saving", "프로젝트 완전삭제 중");
  try {
    await apiClient.purgeProject(project.project_id);
    if (project.project_id === state.projectId) {
      await closeActiveProjectContext();
      routeToScreen(SCREENS.PROJECTS);
    }
    await refreshProjectSummaries();
    render();
    setSaveState("saved", "프로젝트 완전삭제됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `프로젝트 완전삭제 실패: ${normalized.message}`);
  }
}

async function restoreServerManifest(manifest = {}) {
  revokeImageUrls();
  await projectStore.clearProject();
  setActiveProjectFromManifest(manifest);
  state.images = (manifest.images || []).map(rehydrateServerImageRecord);
  state.selectedId = state.images[0]?.id || null;
  state.filter = "all";
  state.imageSearch = "";
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
    state.filter = "all";
    state.imageSearch = "";
    state.savedAt = null;
    state.uploadRejections = [];
  }
  state.projectId = manifest.project_id || manifest.id || options.fallbackId || state.projectId;
  state.projectName = manifest.name || manifest.project_name || options.fallbackName || state.projectId;
  state.projectDescription = manifest.description || state.projectDescription || "";
  state.uploadPolicy = normalizeUploadPolicy(manifest.upload_policy || manifest.uploadPolicy || state.uploadPolicy);
  state.labelSchema = normalizeLabelSchema(manifest.label_schema || manifest.labelSchema || state.labelSchema);
  ensureSelectedClassId();
  const magicPreset = manifest.magic_tool_preset || manifest.magicToolPreset || {};
  state.settingsMagicTolerance = Number(magicPreset.color_tolerance || magicPreset.colorTolerance || state.settingsMagicTolerance);
  state.settingsMagicEdge = Number(magicPreset.edge_threshold || magicPreset.edgeThreshold || state.settingsMagicEdge);
  editor.setMagicOptions({
    colorTolerance: state.settingsMagicTolerance,
    edgeThreshold: state.settingsMagicEdge,
  });
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
  document.querySelectorAll("[data-session-logout]").forEach((button) => {
    button.disabled = !state.sessionAuthenticated;
  });
  els.sessionMessage.textContent = state.sessionAuthenticated
    ? `${state.sessionUserId} / ${state.sessionRole} / session`
    : `${state.sessionUserId || "미설정"} / ${state.sessionRole || "role 없음"} / 로그인 필요`;
  els.sessionMessage.classList.toggle("warning", !state.sessionAuthenticated);
}

function renderAssignmentPanel() {
  const image = getSelectedImage();
  renderAssignmentSelect(els.assignmentWorkerId, state.assignmentUsers.workers, state.assignmentWorkerId || image?.worker_id || DEFAULT_ACTORS.worker);
  renderAssignmentSelect(els.assignmentReviewerId, state.assignmentUsers.reviewers, state.assignmentReviewerId || image?.reviewer_id || DEFAULT_ACTORS.reviewer);
  els.assignButton.disabled = !image || !state.sessionAuthenticated || state.sessionRole !== ROLES.ADMIN;
  if (!image) {
    setAssignmentMessage("이미지를 선택하면 배정할 수 있습니다.", false);
  } else if (!state.sessionAuthenticated) {
    setAssignmentMessage("로그인 후 배정할 수 있습니다.", true);
  } else if (state.sessionRole !== ROLES.ADMIN) {
    setAssignmentMessage("admin 역할에서만 배정할 수 있습니다.", true);
  } else if (state.assignmentUsers.error) {
    setAssignmentMessage(`사용자 목록 로드 실패: ${state.assignmentUsers.error}`, true);
  } else if (image.assignment_server_synced === false) {
    setAssignmentMessage("배정 서버 동기화가 필요합니다.", true);
  } else {
    setAssignmentMessage(`작업자 ${image.worker_id || "미배정"} · 리뷰어 ${image.reviewer_id || "미배정"}`, false);
  }
}

function renderAssignmentSelect(select, users, selectedValue) {
  if (!select || document.activeElement === select) return;
  const selected = normalizeActorId(selectedValue);
  const options = users.length > 0 ? users : fallbackAssignmentUsers(select === els.assignmentWorkerId ? ROLES.WORKER : ROLES.REVIEWER);
  select.replaceChildren(...options.map((user) => {
    const option = document.createElement("option");
    option.value = user.user_id;
    option.textContent = `${user.display_name || user.user_id} (${user.user_id})`;
    return option;
  }));
  if (selected && !options.some((user) => user.user_id === selected)) {
    const option = document.createElement("option");
    option.value = selected;
    option.textContent = selected;
    select.append(option);
  }
  select.value = selected || options[0]?.user_id || "";
}

function fallbackAssignmentUsers(role) {
  if (role === ROLES.WORKER) {
    return [{ user_id: DEFAULT_ACTORS.worker, display_name: "Worker", role: ROLES.WORKER }];
  }
  if (role === ROLES.REVIEWER) {
    return [{ user_id: DEFAULT_ACTORS.reviewer, display_name: "Reviewer", role: ROLES.REVIEWER }];
  }
  return [];
}

function renderReviewPanel() {
  const image = getSelectedImage();
  const canReview = image?.status === "submitted" && Boolean(image.server_mask_synced);
  const canRework = image?.status === "rejected" && image.review_server_synced !== false;
  const reviewerReady = Boolean(getReviewActorId());

  if (document.activeElement !== els.reviewReason) {
    els.reviewReason.value = state.reviewReasonDraft || image?.reject_reason || "";
  }
  if (document.activeElement !== els.reviewReasonCode) {
    els.reviewReasonCode.value = image?.reject_reason_code || state.reviewReasonCode || REJECTION_REASON_CODES.ROUGH_BOUNDARY;
  }
  els.reviewReasonCode.disabled = !canReview;
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
    const label = image.reject_reason_label || rejectionReasonCodeLabel(image.reject_reason_code);
    const detail = [label, image.reject_reason].filter(Boolean).join(" · ");
    setReviewMessage(detail ? `반려: ${detail}` : "반려됨. 재작업을 시작할 수 있습니다.", true);
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

function renderLabelSelector() {
  const labels = activeLabelSchema();
  ensureSelectedClassId();
  applySelectedLabelColor();
  const image = getSelectedImage();
  const selectedAnnotation = selectedLabelAnnotation(image);
  const rows = labels.map((label) => renderLabelOption(label, image));

  els.labelSelector.replaceChildren(...rows);
  els.imageAnnotationList.replaceChildren(...renderImageAnnotationRows(image));

  const selected = labelByClassId(labels, state.selectedClassId);
  const baseMessage = selected ? `선택 라벨: ${selected.name} / class_id=${selected.class_id}` : "라벨을 선택하세요.";
  els.labelMessage.textContent = state.labelMessage || (selectedAnnotation ? `${baseMessage} / 저장된 마스크 있음` : baseMessage);
  els.labelMessage.classList.toggle("warning", !selected || !image);
}

function renderLabelOption(label, image) {
  const annotation = imageAnnotationForClass(image, label.class_id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "label-option";
  button.dataset.classId = String(label.class_id);
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", String(label.class_id === state.selectedClassId));
  button.disabled = label.enabled === false;
  button.addEventListener("click", () => {
    void selectClassLabel(label.class_id);
  });

  const swatch = document.createElement("span");
  swatch.className = "label-swatch";
  swatch.style.backgroundColor = label.color;

  const text = document.createElement("span");
  text.className = "label-text";
  text.textContent = label.name;

  const meta = document.createElement("span");
  meta.className = "label-meta";
  meta.textContent = annotation ? "mask" : `#${label.class_id}`;

  button.replaceChildren(swatch, text, meta);
  return button;
}

function renderImageAnnotationRows(image) {
  if (!image) {
    const row = document.createElement("div");
    row.className = "annotation-empty";
    row.textContent = "이미지 선택 전";
    return [row];
  }

  const annotations = selectedImageAnnotations(image);
  if (annotations.length === 0) {
    const row = document.createElement("div");
    row.className = "annotation-empty";
    row.textContent = "현재 이미지에 저장된 라벨 마스크 없음";
    return [row];
  }

  const labels = activeLabelSchema();
  return annotations.map((annotation) => {
    const label = labelByClassId(labels, annotation.class_id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "annotation-row";
    row.dataset.classId = String(annotation.class_id);
    row.addEventListener("click", () => {
      void selectClassLabel(annotation.class_id);
    });

    const swatch = document.createElement("span");
    swatch.className = "label-swatch";
    swatch.style.backgroundColor = label?.color || "#7C8792";

    const name = document.createElement("span");
    name.textContent = label?.name || annotation.class_name || `class ${annotation.class_id}`;

    const ratio = document.createElement("span");
    ratio.className = "label-meta";
    ratio.textContent = `${Math.round(Number(annotation.mask_ratio || 0) * 1000) / 10}%`;

    row.replaceChildren(swatch, name, ratio);
    return row;
  });
}

async function selectClassLabel(classId) {
  const result = validateClassId(activeLabelSchema(), classId);
  if (!result.valid) {
    state.labelMessage = result.reason === "disabled_class_id" ? "비활성 라벨입니다." : "알 수 없는 라벨입니다.";
    renderLabelSelector();
    return;
  }

  const image = getSelectedImage();
  if (image?.objectUrl && (editor.getMaskRatio() > 0 || image.active_mask_dirty)) {
    await saveEditorMaskForSelectedClass(image, { status: image.status, updateTimestamp: true });
  }
  state.selectedClassId = result.label.class_id;
  state.labelMessage = `선택 라벨: ${result.label.name} / class_id=${result.label.class_id}`;
  if (image?.objectUrl) {
    await loadSelectedClassMaskIntoEditor(image);
  }
  await persistProject();
  renderLabelSelector();
  renderValidation();
  updateStatusbar();
}

function selectedLabelAnnotation(image = getSelectedImage()) {
  return imageAnnotationForClass(image, state.selectedClassId);
}

function selectedLabel() {
  const labels = activeLabelSchema();
  return labelByClassId(labels, state.selectedClassId) || labels.find((label) => label.enabled !== false) || DEFAULT_LABEL_SCHEMA[0];
}

function selectedLabelColor() {
  return selectedLabel()?.color || DEFAULT_LABEL_SCHEMA[0].color;
}

function applySelectedLabelColor() {
  const label = selectedLabel();
  const color = label.color;
  editor.setOverlayColor(color);
  els.maskColorSwatch.style.backgroundColor = color;
  els.maskColorSwatch.setAttribute("aria-label", `마스크 색상 ${label.name} ${color}`);
  els.maskColorSwatch.title = `${label.name} / class_id=${label.class_id} / ${color}`;
}

async function saveEditorMaskForSelectedClass(image, options = {}) {
  const label = selectedLabel();
  const classId = state.selectedClassId;
  const blob = await editor.exportMaskPngBlob();
  const dataUrl = await blobToDataUrl(blob);
  const maskPath = annotationMaskPath({ imageId: image.id, classId, className: label.name });
  const maskRatio = editor.getMaskRatio();
  const updatedAt = new Date().toISOString();

  await projectStore.saveMaskBlob(annotationMaskBlobKey(image.id, state.selectedClassId), blob);
  await projectStore.saveMaskBlob(image.id, blob);

  image.annotations = upsertAnnotationRecord(image.annotations || [], {
    imageId: image.id,
    classId,
    className: label.name,
    maskPath,
    maskWidth: image.width,
    maskHeight: image.height,
    maskRatio,
    source: options.source || "manual",
    score: options.score,
    status: options.status || image.status || "in_progress",
    updatedAt,
  });
  image.maskDataUrl = dataUrl;
  image.maskPath = maskPath;
  image.current_mask_path = maskPath;
  image.mask_data_url = dataUrl;
  image.mask_width = image.width;
  image.mask_height = image.height;
  image.mask_values_valid = true;
  image.maskRatio = maskRatio;
  image.mask_ratio = maskRatio;
  image.status = options.status || image.status;
  image.active_mask_dirty = false;
  if (options.updateTimestamp !== false) {
    image.updatedAt = updatedAt;
    image.updated_at = updatedAt;
  }
  return { blob, dataUrl, maskPath };
}

async function loadSelectedClassMaskIntoEditor(image) {
  const maskDataUrl = await selectedClassMaskDataUrlForImage(image);
  await editor.loadImage(image.objectUrl, maskDataUrl || null);
  applySelectedLabelColor();
  return Boolean(maskDataUrl);
}

function selectedImageAnnotations(image = getSelectedImage()) {
  if (!image) return [];
  if (Array.isArray(image.annotations) && image.annotations.length > 0) {
    return image.annotations;
  }
  const defaultLabel = labelByClassId(activeLabelSchema(), DEFAULT_LABEL_SCHEMA[0].class_id);
  return migrateLegacyImageAnnotations(image, {
    classId: DEFAULT_LABEL_SCHEMA[0].class_id,
    className: defaultLabel?.name || "target",
  });
}

function imageAnnotationForClass(image, classId) {
  return selectedImageAnnotations(image).find((annotation) => Number(annotation.class_id) === Number(classId)) || null;
}

function activeLabelSchema() {
  state.labelSchema = normalizeLabelSchema(state.labelSchema);
  return state.labelSchema;
}

function ensureSelectedClassId() {
  const labels = normalizeLabelSchema(state.labelSchema);
  const selected = labelByClassId(labels, state.selectedClassId);
  if (!selected || selected.enabled === false) {
    state.selectedClassId = labels.find((label) => label.enabled !== false)?.class_id || DEFAULT_LABEL_SCHEMA[0].class_id;
  }
  state.labelSchema = labels;
}

function renderMaskTransferPanel() {
  const source = previousMaskSourceImage();
  const canEdit = [ROLES.ADMIN, ROLES.WORKER].includes(state.sessionRole);
  els.copyPreviousMaskButton.disabled = !canEdit || !getSelectedImage() || !source;
  const message = state.maskTransferMessage || (source
    ? `이전 source: ${source.original_file_name || source.fileName || source.id}`
    : "이전 프레임 마스크가 있으면 Shift + V로 가져올 수 있습니다.");
  els.maskTransferMessage.textContent = message;
  els.maskTransferMessage.classList.toggle("warning", state.maskTransferWarning);
}

function renderAiDraftPanel() {
  const canEdit = [ROLES.ADMIN, ROLES.WORKER].includes(state.sessionRole);
  const image = getSelectedImage();
  const label = selectedLabel();
  els.aiDraftButton.disabled = !canEdit || !image || !label;
  els.aiDraftMessage.textContent = state.aiDraftMessage || (label
    ? `대상 라벨: ${label.name} / class_id=${label.class_id}`
    : "라벨을 선택하세요.");
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

function renderTrainingSourcePicker() {
  const sources = state.trainingSources.length > 0
    ? state.trainingSources
    : [{
        project_id: state.projectId,
        project_name: state.projectName,
        task_id: state.taskId,
        version_id: state.versionId,
        total_images: state.images.length,
        exportable_images: getExportState().validImages.length,
      }].filter((source) => source.project_id);
  const rows = sources.map((source) => {
    const key = sourceKey(source);
    const label = document.createElement("label");
    label.className = "source-option";
    const checked = state.selectedTrainingSourceIds.has(key);
    label.innerHTML = `
      <input type="checkbox" ${checked ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(source.project_name || source.project_id || "-")}</strong>
        <small>${escapeHtml(source.task_id || DEFAULT_TASK_ID)} / ${escapeHtml(source.version_id || DEFAULT_VERSION_ID)} · ${Number(source.exportable_images || 0)}/${Number(source.total_images || 0)} export</small>
      </span>
    `;
    label.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) {
        state.selectedTrainingSourceIds.add(key);
      } else {
        state.selectedTrainingSourceIds.delete(key);
      }
    });
    return label;
  });
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list-row";
    empty.innerHTML = "<strong>source 없음</strong><small>project/task/version을 먼저 생성하세요.</small>";
    rows.push(empty);
  }
  els.trainingSourcePicker.replaceChildren(...rows);
  els.trainingExportButton.disabled = ![ROLES.ADMIN, ROLES.REVIEWER].includes(state.sessionRole);
}

function renderTrainingSetPanel() {
  if (document.activeElement !== els.trainingSetId) {
    els.trainingSetId.value = state.trainingSetId || suggestedTrainingSetId();
  }
  if (document.activeElement !== els.trainingSetName) {
    els.trainingSetName.value = state.trainingSetName || suggestedTrainingSetName();
  }
  if (document.activeElement !== els.trainingSetDescription) {
    els.trainingSetDescription.value = state.trainingSetDescription || "";
  }
  syncNumberInput(els.trainingSplitTrain, state.trainingSplitTrain);
  syncNumberInput(els.trainingSplitVal, state.trainingSplitVal);
  syncNumberInput(els.trainingSplitTest, state.trainingSplitTest);
  syncNumberInput(els.trainingSplitSeed, state.trainingSplitSeed);
  els.includeDeletedTrainingSets.checked = Boolean(state.includeDeletedTrainingSets && state.sessionRole === ROLES.ADMIN);
  const canManage = [ROLES.ADMIN, ROLES.REVIEWER].includes(state.sessionRole);
  els.createTrainingSetButton.disabled = !canManage;
  els.refreshTrainingSetsButton.disabled = !canManage;
  els.trainingSetList.replaceChildren(...trainingSetRows());
}

function trainingSetRows() {
  if (!Array.isArray(state.trainingSets) || state.trainingSets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list-row";
    empty.innerHTML = `<strong>${escapeHtml(state.trainingSetMessage || "저장된 Training set 없음")}</strong><small>source를 선택하고 저장하면 재내보내기 가능한 세트가 생깁니다.</small>`;
    return [empty];
  }
  return state.trainingSets.map((trainingSet) => {
    const row = document.createElement("article");
    row.className = `training-set-row${trainingSet.deleted_at ? " deleted" : ""}`;
    const counts = trainingSet.split_counts || {};
    row.innerHTML = `
      <header>
        <span>
          <strong>${escapeHtml(trainingSet.name || trainingSet.training_set_id)}</strong>
          <small>${escapeHtml(trainingSet.training_set_id)} · ${Number(trainingSet.total_items || 0)} items · train ${Number(counts.train || 0)} / val ${Number(counts.val || 0)} / test ${Number(counts.test || 0)}</small>
        </span>
      </header>
      <small>${escapeHtml(trainingSet.description || (trainingSet.deleted_at ? "보관됨" : "활성"))}</small>
      <div class="training-set-actions"></div>
    `;
    const actions = row.querySelector(".training-set-actions");
    actions.appendChild(trainingSetButton("ZIP", () => void exportSavedTrainingSet(trainingSet.training_set_id)));
    if (state.sessionRole === ROLES.ADMIN && trainingSet.deleted_at) {
      actions.appendChild(trainingSetButton("복원", () => void restoreSavedTrainingSet(trainingSet)));
    } else if (state.sessionRole === ROLES.ADMIN) {
      actions.appendChild(trainingSetButton("보관", () => void archiveSavedTrainingSet(trainingSet), "danger"));
    }
    return row;
  });
}

function trainingSetButton(label, onClick, variant = "secondary") {
  const button = document.createElement("button");
  button.className = `button ${variant} rework-button`;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderProjectSettingsPanel() {
  if (document.activeElement !== els.settingsProjectName) {
    els.settingsProjectName.value = state.projectName || "";
  }
  if (document.activeElement !== els.settingsProjectDescription) {
    els.settingsProjectDescription.value = state.projectDescription || "";
  }
  if (document.activeElement !== els.settingsUploadLimitMb) {
    els.settingsUploadLimitMb.value = String(Math.round(Number(state.uploadPolicy.maxFileBytes || UPLOAD_POLICY.maxFileBytes) / 1024 / 1024));
  }
  if (document.activeElement !== els.settingsAllowedFormats) {
    els.settingsAllowedFormats.value = allowedFormatText(state.uploadPolicy);
  }
  if (document.activeElement !== els.settingsLabelSchema) {
    els.settingsLabelSchema.value = formatLabelSchemaText(state.labelSchema);
  }
  if (document.activeElement !== els.settingsMagicTolerance) {
    els.settingsMagicTolerance.value = String(state.settingsMagicTolerance);
  }
  if (document.activeElement !== els.settingsMagicEdge) {
    els.settingsMagicEdge.value = String(state.settingsMagicEdge);
  }
  els.settingsMagicToleranceValue.textContent = String(els.settingsMagicTolerance.value || state.settingsMagicTolerance);
  els.settingsMagicEdgeValue.textContent = String(els.settingsMagicEdge.value || state.settingsMagicEdge);
  els.projectSettingsMessage.textContent = state.projectSettingsMessage || "프로젝트별 업로드/도구 기본값을 관리합니다.";
  els.saveProjectSettingsButton.disabled = !canAdminMutateProject();
}

function renderAccountAdminPanel() {
  const draft = state.adminUserDraft;
  if (document.activeElement !== els.adminUserId) els.adminUserId.value = draft.userId;
  if (document.activeElement !== els.adminDisplayName) els.adminDisplayName.value = draft.displayName;
  if (document.activeElement !== els.adminUserRole) els.adminUserRole.value = draft.role;
  if (document.activeElement !== els.adminUserActive) els.adminUserActive.checked = draft.active !== false;
  els.adminUserMessage.textContent = state.adminUserMessage || "로컬 MVP 사용자 계정을 관리합니다.";
  els.saveUserButton.disabled = state.sessionRole !== ROLES.ADMIN;
  els.deactivateUserButton.disabled = state.sessionRole !== ROLES.ADMIN || !draft.userId;
  els.adminUserList.replaceChildren(...state.adminUsers.map((user) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "project-summary-row";
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(user.display_name || user.user_id)}</strong>
        <small>${escapeHtml(user.user_id)} · ${escapeHtml(user.role)}${user.active === false ? " · inactive" : ""}</small>
      </span>
    `;
    row.addEventListener("click", () => {
      state.adminUserDraft = {
        userId: user.user_id,
        displayName: user.display_name || user.user_id,
        role: user.role,
        password: "",
        active: user.active !== false,
      };
      renderAccountAdminPanel();
    });
    return row;
  }));
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
  if (editor.isCameraPanActive()) {
    els.statusCoords.textContent = "이동 모드 Space";
    return;
  }
  els.statusCoords.textContent = point ? `좌표 ${Math.round(point.x)}, ${Math.round(point.y)}` : "좌표 -";
}

function setTool(tool) {
  editor.setTool(tool);
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
}

function handleShortcut(event) {
  if (isEditableShortcutTarget(event.target)) return;
  if (currentScreen() !== SCREENS.WORKBENCH || els.workbenchScreen.hidden) return;

  const rawKey = event.key;
  const key = rawKey.toLowerCase();
  const ctrl = event.metaKey || event.ctrlKey;
  const panDelta = panDeltaForKey(rawKey, event.shiftKey ? 96 : 48);

  if (event.code === "Space" && !ctrl) {
    event.preventDefault();
    activateSpacePan();
  } else if (panDelta) {
    event.preventDefault();
    editor.panBy(panDelta.dx, panDelta.dy);
    updateStatusbar();
  } else if (ctrl && key === "s") {
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
  } else if (key === "w") {
    setTool("magic");
  } else if (key === "m") {
    setTool("mask_move");
  } else if (event.shiftKey && key === "v") {
    event.preventDefault();
    void copyMaskFromPreviousImage();
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

function handleShortcutRelease(event) {
  if (event.code !== "Space") return;
  deactivateSpacePan();
}

function activateSpacePan() {
  editor.setCameraPanOverride(true);
  updatePointerStatus(null);
}

function deactivateSpacePan() {
  editor.clearCameraPanOverride();
  updatePointerStatus(null);
}

function isEditableShortcutTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
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

function setMaskTransferMessage(message, warning = false) {
  state.maskTransferMessage = message;
  state.maskTransferWarning = warning;
  els.maskTransferMessage.textContent = message;
  els.maskTransferMessage.classList.toggle("warning", warning);
}

function setAiDraftMessage(message, warning = false) {
  state.aiDraftMessage = message;
  els.aiDraftMessage.textContent = message;
  els.aiDraftMessage.classList.toggle("warning", warning);
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

function canAdminMutateProject() {
  return state.sessionAuthenticated && state.sessionRole === ROLES.ADMIN && Boolean(state.projectId);
}

function canEditImageCollection() {
  return state.sessionAuthenticated && [ROLES.ADMIN, ROLES.WORKER].includes(state.sessionRole);
}

async function toggleImageRemoval(imageId) {
  const image = state.images.find((item) => item.id === imageId);
  if (!image || !canEditImageCollection()) return;

  if (isDeletedImage(image)) {
    await restoreImage(image);
    return;
  }
  const reason = window.prompt(`"${image.fileName || image.id}" 이미지를 삭제 항목으로 이동합니다. 사유를 입력하세요.`, "wrong_upload");
  if (reason === null) return;
  if (!window.confirm("이 이미지는 목록과 export에서 제외됩니다. 파일은 물리 삭제하지 않고 복원할 수 있습니다. 진행할까요?")) return;
  await softRemoveImage(image, reason);
}

async function softRemoveImage(image, reason = "") {
  setSaveState("saving", "이미지 제거 중");
  try {
    let updated = {
      ...image,
      deleted_at: image.deleted_at || new Date().toISOString(),
      deleted_by: state.sessionUserId,
      delete_reason: String(reason || ""),
      updated_at: new Date().toISOString(),
    };
    if (state.backendProjectReady && image.server_image_synced !== false) {
      const response = await apiClient.removeImage(state.projectId, image.id, { reason });
      updated = { ...updated, ...(response.image || {}) };
    }
    updateImageRecord(updated);
    if (state.selectedId === image.id) {
      state.selectedId = nextSelectableImageId(image.id);
      if (state.selectedId) {
        await selectImage(state.selectedId, { updateRoute: false, markInProgress: false });
      } else {
        editor.clear();
        els.emptyState.hidden = false;
      }
    }
    await persistProject();
    render();
    setSaveState("saved", "이미지 제거됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `이미지 제거 실패: ${normalized.message}`);
  }
}

async function restoreImage(image) {
  setSaveState("saving", "이미지 복원 중");
  try {
    let updated = {
      ...image,
      deleted_at: "",
      deleted_by: "",
      delete_reason: "",
      updated_at: new Date().toISOString(),
    };
    if (state.backendProjectReady && image.server_image_synced !== false) {
      const response = await apiClient.restoreImage(state.projectId, image.id);
      updated = { ...updated, ...(response.image || {}) };
    }
    updateImageRecord(updated);
    state.selectedId = image.id;
    await persistProject();
    await selectImage(image.id, { updateRoute: false, markInProgress: false });
    render();
    setSaveState("saved", "이미지 복원됨");
  } catch (error) {
    const normalized = normalizeApiError(error);
    setSaveState("failed", `이미지 복원 실패: ${normalized.message}`);
  }
}

function updateImageRecord(updated) {
  state.images = state.images.map((image) => image.id === updated.id ? { ...image, ...updated } : image);
}

function nextSelectableImageId(currentId) {
  return activeImages().find((image) => image.id !== currentId)?.id || null;
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
  const image = state.images.find((item) => item.id === state.selectedId) || null;
  return image && !isDeletedImage(image) ? image : null;
}

function activeImages() {
  return state.images.filter((image) => !isDeletedImage(image));
}

function isDeletedImage(image = {}) {
  return Boolean(image.deleted_at || image.deletedAt);
}

function filterImagesByDiscovery(images = [], options = {}) {
  const query = normalizeSearchQuery(options.search);
  return images
    .filter((image) => !options.syncNeededOnly || hasSyncIssue(image))
    .filter((image) => {
      if (!query) return true;
      return [
        image.id,
        image.fileName,
        image.original_file_name,
        image.image_path,
      ].some((value) => normalizeSearchQuery(value).includes(query));
    });
}

function filterProjectsBySearch(projects = [], search = "") {
  const query = normalizeSearchQuery(search);
  if (!query) return projects;
  return projects.filter((project) => [
    project.project_id,
    project.id,
    project.name,
    project.project_name,
  ].some((value) => normalizeSearchQuery(value).includes(query)));
}

function normalizeTaskSummaries(tasks = []) {
  return tasks
    .map((task) => ({
      task_id: sanitizeUiId(task.task_id || task.taskId || task.id),
      name: String(task.name || task.task_id || task.id || "").trim(),
      current_version: sanitizeUiId(task.current_version || task.currentVersion || DEFAULT_VERSION_ID),
    }))
    .filter((task) => task.task_id);
}

function normalizeVersionSummaries(versions = []) {
  return versions
    .map((version) => ({
      ...version,
      version_id: sanitizeUiId(version.version_id || version.versionId || version.id),
      revision: Number(version.revision || 0),
      deleted_at: version.deleted_at || version.deletedAt || "",
    }))
    .filter((version) => version.version_id);
}

function replaceSelectOptions(select, items = [], options = {}) {
  const selected = options.selected || "";
  const values = items.length > 0 ? items : [options.fallback].filter(Boolean);
  const optionNodes = values.map((item) => {
    const node = document.createElement("option");
    const value = item.value || item[options.valueKey] || "";
    node.value = value;
    node.textContent = item.label || options.label?.(item) || value;
    node.selected = value === selected;
    return node;
  });
  select.replaceChildren(...optionNodes);
}

function selectedVersionSummary() {
  return state.versionSummaries.find((version) => version.version_id === state.versionId) || null;
}

function previousMaskSourceImage() {
  const image = getSelectedImage();
  if (!image) return null;
  const images = activeImages();
  const index = images.findIndex((item) => item.id === image.id);
  if (index <= 0) return null;
  return images
    .slice(0, index)
    .reverse()
    .find((candidate) => hasExistingMask(candidate)) || null;
}

function hasExistingMask(image = {}) {
  const annotation = imageAnnotationForClass(image, state.selectedClassId);
  return Boolean(
    annotation?.mask_path ||
    annotation?.mask_ratio > 0 ||
    image.maskDataUrl ||
    image.mask_data_url ||
    image.maskObjectUrl ||
    image.current_mask_path ||
    image.maskPath ||
    image.maskRatio > 0 ||
    image.mask_ratio > 0,
  );
}

async function maskDataUrlForImage(image) {
  const selectedClassMask = await selectedClassMaskDataUrlForImage(image);
  if (selectedClassMask) return selectedClassMask;
  if (image.maskDataUrl || image.mask_data_url) return image.maskDataUrl || image.mask_data_url;
  const stored = await maskDataUrlFromStore(image.id);
  if (stored) return stored;
  if (image.current_mask_path && state.projectId) {
    await restoreServerMaskBlob(image);
    return image.maskDataUrl || image.mask_data_url || "";
  }
  return "";
}

async function selectedClassMaskDataUrlForImage(image, classId = state.selectedClassId) {
  if (!image) return "";
  const annotation = imageAnnotationForClass(image, classId);
  const stored = await maskDataUrlFromStore(annotationMaskBlobKey(image.id, classId));
  if (stored) return stored;
  if (annotation?.mask_path && state.projectId) {
    try {
      const blob = await apiClient.getProjectFileBlob(state.projectId, annotation.mask_path);
      await projectStore.saveMaskBlob(annotationMaskBlobKey(image.id, classId), blob);
      return blobToDataUrl(blob);
    } catch (error) {
      const normalized = normalizeApiError(error);
      logger.warn("server_restore.annotation_mask.failed", {
        project_id: state.projectId,
        image_id: image.id,
        class_id: classId,
        error: normalized,
      });
    }
  }
  if (Number(classId) === Number(DEFAULT_LABEL_SCHEMA[0].class_id)) {
    if (image.maskDataUrl || image.mask_data_url) return image.maskDataUrl || image.mask_data_url;
    const legacyStored = await maskDataUrlFromStore(image.id);
    if (legacyStored) return legacyStored;
  }
  return "";
}

function selectedTrainingSources() {
  const sources = state.trainingSources.length > 0
    ? state.trainingSources
    : [{
        project_id: state.projectId,
        project_name: state.projectName,
        task_id: state.taskId,
        version_id: state.versionId,
        images: state.images.map(toDashboardImage),
      }].filter((source) => source.project_id);
  return sources
    .filter((source) => state.selectedTrainingSourceIds.has(sourceKey(source)))
    .map((source) => ({
      project_id: source.project_id,
      project_name: source.project_name || source.project_id,
      task_id: source.task_id || DEFAULT_TASK_ID,
      version_id: source.version_id || DEFAULT_VERSION_ID,
      images: source.images || [],
    }));
}

function currentTrainingSplit() {
  return {
    train: Number(state.trainingSplitTrain || 0),
    val: Number(state.trainingSplitVal || 0),
    test: Number(state.trainingSplitTest || 0),
    seed: Number(state.trainingSplitSeed || 42),
  };
}

function suggestedTrainingSetId() {
  return sanitizeUiId([state.projectId, state.taskId, state.versionId, new Date().toISOString().slice(0, 10)].filter(Boolean).join("_"));
}

function suggestedTrainingSetName() {
  return [state.projectName || state.projectId || "Training Set", state.taskId, state.versionId]
    .filter(Boolean)
    .join(" / ");
}

function syncNumberInput(input, value) {
  if (document.activeElement === input) return;
  input.value = String(value);
}

function sourceKey(source = {}) {
  return [
    source.project_id || source.projectId || "",
    source.task_id || source.taskId || DEFAULT_TASK_ID,
    source.version_id || source.versionId || DEFAULT_VERSION_ID,
  ].map(sanitizeUiId).join("/");
}

function nextVersionName(current) {
  const match = String(current || DEFAULT_VERSION_ID).match(/^(.*?)(\d+)$/);
  if (!match) return `${current || DEFAULT_VERSION_ID}_copy`;
  return `${match[1]}${Number(match[2]) + 1}`;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function allowedFormatText(policy = {}) {
  return (policy.allowedMimeTypes || policy.allowed_mime_types || UPLOAD_POLICY.allowedMimeTypes || []).join(",");
}

function parseLabelSchemaText(value) {
  const rows = String(value || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) {
    throw new Error("라벨을 1개 이상 입력하세요.");
  }

  const labels = rows.map((row, index) => {
    const parts = row.split(",").map((part) => part.trim());
    if (parts.length < 2) {
      throw new Error(`${index + 1}번째 라벨 형식이 잘못됐습니다.`);
    }
    const classId = Number(parts[0]);
    if (!Number.isInteger(classId) || classId < 1) {
      throw new Error(`${index + 1}번째 class_id는 1 이상의 정수여야 합니다.`);
    }
    if (!parts[1]) {
      throw new Error(`${index + 1}번째 라벨 이름을 입력하세요.`);
    }
    if (parts[2] && !/^#[0-9a-fA-F]{6}$/u.test(parts[2])) {
      throw new Error(`${index + 1}번째 라벨 색상은 #RRGGBB 형식이어야 합니다.`);
    }
    return {
      class_id: classId,
      name: parts[1],
      color: parts[2] || "#7C8792",
    };
  });

  const normalized = normalizeLabelSchema(labels);
  if (normalized.length !== labels.length) {
    throw new Error("중복되거나 잘못된 라벨이 있습니다.");
  }
  return normalized;
}

function formatLabelSchemaText(labels) {
  return normalizeLabelSchema(labels)
    .map((label) => `${label.class_id},${label.name},${label.color}`)
    .join("\n");
}

function sanitizeUiId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().toLocaleLowerCase();
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
    projectDescription: state.projectDescription,
    selectedId: state.selectedId,
    filter: state.filter,
    imageSearch: state.imageSearch,
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
    uploadPolicy: state.uploadPolicy,
    labelSchema: state.labelSchema,
    selectedClassId: state.selectedClassId,
    taskId: state.taskId,
    versionId: state.versionId,
    versionRevision: state.versionRevision,
    settingsMagicTolerance: state.settingsMagicTolerance,
    settingsMagicEdge: state.settingsMagicEdge,
    selectedTrainingSourceIds: Array.from(state.selectedTrainingSourceIds),
    trainingSetId: state.trainingSetId,
    trainingSetName: state.trainingSetName,
    trainingSetDescription: state.trainingSetDescription,
    trainingSplitTrain: state.trainingSplitTrain,
    trainingSplitVal: state.trainingSplitVal,
    trainingSplitTest: state.trainingSplitTest,
    trainingSplitSeed: state.trainingSplitSeed,
    includeDeletedTrainingSets: state.includeDeletedTrainingSets,
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
    state.projectDescription = saved.projectDescription || state.projectDescription || "";
    state.selectedId = saved.selectedId || null;
    state.filter = saved.filter || "all";
    state.imageSearch = String(saved.imageSearch || "");
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
    state.uploadPolicy = normalizeUploadPolicy(saved.uploadPolicy || {}, UPLOAD_POLICY);
    state.labelSchema = normalizeLabelSchema(saved.labelSchema || state.labelSchema);
    state.selectedClassId = Number(saved.selectedClassId || state.selectedClassId);
    ensureSelectedClassId();
    state.taskId = sanitizeUiId(saved.taskId) || state.taskId;
    state.versionId = sanitizeUiId(saved.versionId) || state.versionId;
    state.versionRevision = Number(saved.versionRevision || 0);
    state.settingsMagicTolerance = Number(saved.settingsMagicTolerance || state.settingsMagicTolerance);
    state.settingsMagicEdge = Number(saved.settingsMagicEdge || state.settingsMagicEdge);
    state.selectedTrainingSourceIds = new Set(Array.isArray(saved.selectedTrainingSourceIds) ? saved.selectedTrainingSourceIds : []);
    state.trainingSetId = sanitizeUiId(saved.trainingSetId) || "";
    state.trainingSetName = String(saved.trainingSetName || "");
    state.trainingSetDescription = String(saved.trainingSetDescription || "");
    state.trainingSplitTrain = Number(saved.trainingSplitTrain ?? state.trainingSplitTrain);
    state.trainingSplitVal = Number(saved.trainingSplitVal ?? state.trainingSplitVal);
    state.trainingSplitTest = Number(saved.trainingSplitTest ?? state.trainingSplitTest);
    state.trainingSplitSeed = Number(saved.trainingSplitSeed ?? state.trainingSplitSeed);
    state.includeDeletedTrainingSets = Boolean(saved.includeDeletedTrainingSets && state.sessionRole === ROLES.ADMIN);
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
  state.projectDescription = "";
  state.images = [];
  state.selectedId = null;
  state.filter = "all";
  state.imageSearch = "";
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
  state.uploadPolicy = { ...UPLOAD_POLICY };
  state.labelSchema = normalizeLabelSchema(DEFAULT_LABEL_SCHEMA);
  state.selectedClassId = DEFAULT_LABEL_SCHEMA[0].class_id;
  state.labelMessage = "";
  state.projectCreateId = "";
  state.projectCreateName = "";
  state.projectCreateLabelSchema = "";
  state.projectSearch = "";
  state.projectCreateMessage = "";
  await projectStore.clearProject();
  editor.clear();
  els.emptyState.hidden = false;
  setSaveState("saved", "초기화됨");
  render();
}

async function closeActiveProjectContext() {
  revokeImageUrls();
  state.projectId = "";
  state.projectName = "";
  state.projectDescription = "";
  state.images = [];
  state.selectedId = null;
  state.filter = "all";
  state.imageSearch = "";
  state.queueMode = QUEUE_MODES.ALL;
  state.savedAt = null;
  state.backendProjectReady = false;
  state.backendProjectError = "";
  state.lastExportMode = "";
  state.lastExportMessage = "";
  state.exportApprovedOnly = false;
  state.assignmentWorkerId = DEFAULT_ACTORS.worker;
  state.assignmentReviewerId = DEFAULT_ACTORS.reviewer;
  state.uploadRejections = [];
  state.uploadPolicy = { ...UPLOAD_POLICY };
  state.labelSchema = normalizeLabelSchema(DEFAULT_LABEL_SCHEMA);
  state.selectedClassId = DEFAULT_LABEL_SCHEMA[0].class_id;
  state.labelMessage = "";
  state.taskId = DEFAULT_TASK_ID;
  state.versionId = DEFAULT_VERSION_ID;
  state.taskSummaries = [];
  state.versionSummaries = [];
  state.versionRevision = 0;
  state.selectedTrainingSourceIds = new Set();
  await projectStore.clearProject();
  editor.clear();
  els.emptyState.hidden = false;
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
    active_mask_dirty,
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
    } else if (image.image_path && state.projectId) {
      await restoreServerImageBlob(image);
    }
  }

  if (!image.maskDataUrl && !image.maskObjectUrl) {
    const maskBlob = await projectStore.loadMaskBlob(image.id);
    if (maskBlob) {
      image.maskObjectUrl = URL.createObjectURL(maskBlob);
    } else if (image.current_mask_path && state.projectId) {
      await restoreServerMaskBlob(image);
    }
  }
}

async function restoreServerImageBlob(image) {
  try {
    const blob = await apiClient.getProjectFileBlob(state.projectId, image.image_path);
    await projectStore.saveImageBlob(image.id, blob);
    image.objectUrl = URL.createObjectURL(blob);
    image.object_url = image.objectUrl;
    image.server_restore_error = "";
  } catch (error) {
    const normalized = normalizeApiError(error);
    image.server_restore_error = normalized.message;
    logger.warn("server_restore.image.failed", {
      project_id: state.projectId,
      image_id: image.id,
      error: normalized,
    });
  }
}

async function restoreServerMaskBlob(image) {
  try {
    const blob = await apiClient.getProjectFileBlob(state.projectId, image.current_mask_path);
    await projectStore.saveMaskBlob(image.id, blob);
    image.maskObjectUrl = URL.createObjectURL(blob);
    image.maskDataUrl = await blobToDataUrl(blob);
    image.mask_data_url = image.maskDataUrl;
    image.server_restore_error = "";
  } catch (error) {
    const normalized = normalizeApiError(error);
    image.server_restore_error = normalized.message;
    logger.warn("server_restore.mask.failed", {
      project_id: state.projectId,
      image_id: image.id,
      error: normalized,
    });
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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
