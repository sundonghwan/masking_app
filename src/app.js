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
import { REVIEW_ACTIONS, applyReviewTransition, reviewReasonLabel } from "./review/policy.js";
import { createProjectStore } from "./storage/projectStore.js";
import { UPLOAD_POLICY, formatBytes, uploadReasonLabel, validateBrowserUploadFile } from "./upload/policy.js";

const state = {
  projectId: "mask_project_001",
  projectName: "Rail Defect Masking",
  images: [],
  selectedId: null,
  filter: "all",
  savedAt: null,
  autosaveTimer: null,
  backendProjectReady: false,
  uploadRejections: [],
  reviewReasonDraft: "",
  exportApprovedOnly: false,
  projectSummaries: [],
  projectSummariesError: "",
};

const apiClient = createMaskingApiClient();
const logger = createLogger({ component: "frontend" });
const projectStore = createProjectStore();

const els = {
  imageInput: document.querySelector("#imageInput"),
  uploadDropzone: document.querySelector("#uploadDropzone"),
  uploadRejections: document.querySelector("#uploadRejections"),
  refreshProjectsButton: document.querySelector("#refreshProjectsButton"),
  projectSummaryList: document.querySelector("#projectSummaryList"),
  imageList: document.querySelector("#imageList"),
  progressText: document.querySelector("#progressText"),
  editorCanvas: document.querySelector("#editorCanvas"),
  emptyState: document.querySelector("#emptyState"),
  saveStatus: document.querySelector("#saveStatus"),
  saveDot: document.querySelector("#saveDot"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  downloadMaskButton: document.querySelector("#downloadMaskButton"),
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
  void ensureBackendProject();
  bindEvents();
  void refreshProjectSummaries();
  render();

  if (state.images.length > 0) {
    await selectImage(state.selectedId || state.images[0].id);
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
  els.submitButton.addEventListener("click", () => void submitCurrentImage());
  els.exportButton.addEventListener("click", () => void exportProject());
  els.clearProjectButton.addEventListener("click", clearProject);
  els.retrySyncButton.addEventListener("click", () => void retrySelectedSync());
  els.refreshProjectsButton.addEventListener("click", () => void refreshProjectSummaries());
  els.approveButton.addEventListener("click", () => void reviewSelectedImage(REVIEW_ACTIONS.APPROVE));
  els.rejectButton.addEventListener("click", () => void reviewSelectedImage(REVIEW_ACTIONS.REJECT));
  els.reworkButton.addEventListener("click", () => void reviewSelectedImage(REVIEW_ACTIONS.REWORK));
  els.reviewReason.addEventListener("input", () => {
    state.reviewReasonDraft = els.reviewReason.value;
  });
  els.approvedOnlyExport.addEventListener("change", () => {
    state.exportApprovedOnly = els.approvedOnlyExport.checked;
    void persistProject();
    render();
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

async function selectImage(imageId) {
  const image = state.images.find((item) => item.id === imageId);
  if (!image) return;

  state.selectedId = image.id;
  state.reviewReasonDraft = image.reject_reason || "";
  image.status = image.status === "not_started" ? "in_progress" : image.status;
  setSaveState("saving", "이미지 로딩");
  await ensureObjectUrls(image);
  await editor.loadImage(image.objectUrl, image.maskDataUrl || image.maskObjectUrl);
  els.emptyState.hidden = true;
  await persistProject();
  render();
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
      dataUrl: await blobToDataUrl(file),
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

    const result = await apiClient.saveMask(state.projectId, image.id, {
      dataUrl,
      status,
      maskRatio: image.maskRatio ?? image.mask_ratio,
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

  render();
  setSaveState(hasSyncIssue(image) ? "failed" : "saved", hasSyncIssue(image) ? "동기화 확인 필요" : "동기화 완료");
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
  if (action === REVIEW_ACTIONS.REWORK && image.review_server_synced === false) {
    setReviewMessage("반려 상태 서버 동기화 후 재작업할 수 있습니다.", true);
    return;
  }

  const result = applyReviewTransition(image, {
    action,
    reason: state.reviewReasonDraft,
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
  renderFilters();
  renderUploadRejections();
  renderProjectSummaries();
  renderImageList();
  renderMetadata();
  renderValidation();
  renderReviewPanel();
  renderExportPolicy();
  renderSyncStatus();
  updateStatusbar();
}

function renderFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  });
}

function renderImageList() {
  const filtered = state.images.filter((image) => state.filter === "all" || image.status === state.filter);
  const submittedCount = state.images.filter((image) => image.status === "submitted").length;
  els.progressText.textContent = `${submittedCount}/${state.images.length} 제출`;

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
    const row = document.createElement("div");
    row.className = `project-summary-row ${project.project_id === state.projectId ? "current" : ""}`;
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
    empty.innerHTML = "<span><strong>서버 프로젝트 없음</strong><small>동기화 후 표시됩니다.</small></span>";
    items.push(empty);
  }
  els.projectSummaryList.replaceChildren(...items);
}

function renderMetadata() {
  const image = getSelectedImage();
  els.metaImageId.textContent = image?.id || "-";
  els.metaFilename.textContent = image?.fileName || "-";
  els.metaSize.textContent = image ? `${image.width}×${image.height}` : "-";
  els.metaStatus.textContent = image ? statusLabel(image.status) : "-";
}

function renderReviewPanel() {
  const image = getSelectedImage();
  const canReview = image?.status === "submitted" && Boolean(image.server_mask_synced);
  const canRework = image?.status === "rejected" && image.review_server_synced !== false;

  if (document.activeElement !== els.reviewReason) {
    els.reviewReason.value = state.reviewReasonDraft || image?.reject_reason || "";
  }
  els.reviewReason.disabled = !image || image.status === "approved";
  els.approveButton.disabled = !canReview;
  els.rejectButton.disabled = !canReview;
  els.reworkButton.disabled = !canRework;

  if (!image) {
    setReviewMessage("제출된 이미지를 선택하면 리뷰할 수 있습니다.", false);
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

function reviewStatusMessage(image) {
  return {
    approved: "승인 완료",
    rejected: "반려 완료",
    in_progress: "재작업 시작",
  }[image.status] || "리뷰 상태 저장됨";
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
    image.review_server_synced === false
  ));
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
    savedAt: state.savedAt ? state.savedAt.toISOString() : null,
    backendProjectReady: state.backendProjectReady,
    backendProjectError: state.backendProjectError || "",
    lastExportMode: state.lastExportMode || "",
    lastExportMessage: state.lastExportMessage || "",
    exportApprovedOnly: Boolean(state.exportApprovedOnly),
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
    state.savedAt = saved.savedAt ? new Date(saved.savedAt) : null;
    state.backendProjectReady = Boolean(saved.backendProjectReady);
    state.backendProjectError = saved.backendProjectError || "";
    state.lastExportMode = saved.lastExportMode || "";
    state.lastExportMessage = saved.lastExportMessage || "";
    state.exportApprovedOnly = Boolean(saved.exportApprovedOnly);
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
  state.images.forEach((image) => URL.revokeObjectURL(image.objectUrl));
  state.images.forEach((image) => {
    if (image.maskObjectUrl) URL.revokeObjectURL(image.maskObjectUrl);
  });
  state.images = [];
  state.selectedId = null;
  state.savedAt = null;
  state.backendProjectReady = false;
  state.backendProjectError = "";
  state.lastExportMode = "";
  state.lastExportMessage = "";
  state.exportApprovedOnly = false;
  state.uploadRejections = [];
  await projectStore.clearProject();
  editor.clear();
  els.emptyState.hidden = false;
  setSaveState("saved", "초기화됨");
  render();
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
