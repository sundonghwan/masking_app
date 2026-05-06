export function createMaskingApiClient(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = String(options.baseUrl || "").replace(/\/+$/, "");
  const getSession = options.getSession || (() => options.session || {});

  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetch implementation is required");
  }

  return {
    health() {
      return requestJson("/api/health");
    },
    login(input = {}) {
      return requestJson("/api/session/login", {
        method: "POST",
        body: {
          user_id: input.userId || input.user_id,
          password: input.password,
        },
        skipAuth: true,
      });
    },
    logout() {
      return requestJson("/api/session/logout", {
        method: "POST",
      });
    },
    me() {
      return requestJson("/api/session/me");
    },
    createProject(input = {}) {
      return requestJson("/api/projects", {
        method: "POST",
        body: {
          id: input.projectId || input.id,
          name: input.name,
          description: input.description,
          upload_policy: input.uploadPolicy || input.upload_policy,
        },
      });
    },
    listProjects(options = {}) {
      const includeDeleted = options.includeDeleted || options.include_deleted;
      const query = includeDeleted ? "?include_deleted=1" : "";
      return requestJson(`/api/projects${query}`);
    },
    listUsers(options = {}) {
      const role = String(options.role || "").trim();
      const query = role ? `?role=${encodeURIComponent(role)}` : "";
      return requestJson(`/api/users${query}`);
    },
    createUser(input = {}) {
      return requestJson("/api/users", {
        method: "POST",
        body: {
          user_id: input.userId || input.user_id,
          display_name: input.displayName || input.display_name,
          role: input.role,
          password: input.password,
          active: input.active,
        },
      });
    },
    updateUser(userId, input = {}) {
      assertRequired(userId, "userId");
      return requestJson(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        body: {
          display_name: input.displayName || input.display_name,
          role: input.role,
          password: input.password,
          active: input.active,
        },
      });
    },
    getProject(projectId) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}`);
    },
    updateProjectSettings(projectId, input = {}) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/settings`, {
        method: "PATCH",
        body: {
          name: input.name,
          description: input.description,
          upload_policy: input.uploadPolicy || input.upload_policy,
          magic_tool_preset: input.magicToolPreset || input.magic_tool_preset,
          if_match_revision: input.ifMatchRevision ?? input.if_match_revision,
        },
      });
    },
    archiveProject(projectId, input = {}) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        body: {
          delete_reason: input.reason || input.deleteReason || input.delete_reason,
          if_match_revision: input.ifMatchRevision ?? input.if_match_revision,
        },
      });
    },
    restoreProject(projectId, input = {}) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/restore`, {
        method: "POST",
        body: {
          if_match_revision: input.ifMatchRevision ?? input.if_match_revision,
        },
      });
    },
    purgeProject(projectId) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/purge`, {
        method: "POST",
      });
    },
    repairProjectManifest(projectId, input = {}) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/repair`, {
        method: "POST",
        body: {
          apply: input.apply === true,
        },
      });
    },
    getAiCapabilities() {
      return requestJson("/api/ai/capabilities");
    },
    requestAiInference(input = {}) {
      return requestJson("/api/ai/infer", {
        method: "POST",
        body: {
          task: input.task,
          image: {
            data_url: input.image?.dataUrl || input.image?.data_url,
            width: input.image?.width,
            height: input.image?.height,
          },
          options: input.options || {},
        },
      });
    },
    listProjectTasks(projectId) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks`);
    },
    createProjectTask(projectId, input = {}) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
        method: "POST",
        body: {
          task_id: input.taskId || input.task_id || input.id,
          name: input.name,
          description: input.description,
        },
      });
    },
    getProjectTask(projectId, taskId) {
      assertRequired(projectId, "projectId");
      assertRequired(taskId, "taskId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`);
    },
    listTaskVersions(projectId, taskId) {
      assertRequired(projectId, "projectId");
      assertRequired(taskId, "taskId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/versions`);
    },
    createTaskVersion(projectId, taskId, input = {}) {
      assertRequired(projectId, "projectId");
      assertRequired(taskId, "taskId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/versions`, {
        method: "POST",
        body: {
          version_id: input.versionId || input.version_id || input.id,
          status: input.status,
        },
      });
    },
    getTaskVersion(projectId, taskId, versionId) {
      assertRequired(projectId, "projectId");
      assertRequired(taskId, "taskId");
      assertRequired(versionId, "versionId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/versions/${encodeURIComponent(versionId)}`);
    },
    cloneTaskVersion(projectId, taskId, versionId, input = {}) {
      assertRequired(projectId, "projectId");
      assertRequired(taskId, "taskId");
      assertRequired(versionId, "versionId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/versions/${encodeURIComponent(versionId)}/clone`, {
        method: "POST",
        body: {
          new_version_id: input.newVersionId || input.new_version_id || input.versionId || input.version_id || input.id,
          if_match_revision: input.ifMatchRevision ?? input.if_match_revision,
        },
      });
    },
    deleteTaskVersion(projectId, taskId, versionId, input = {}) {
      assertRequired(projectId, "projectId");
      assertRequired(taskId, "taskId");
      assertRequired(versionId, "versionId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/versions/${encodeURIComponent(versionId)}`, {
        method: "DELETE",
        body: {
          delete_reason: input.reason || input.deleteReason || input.delete_reason,
          if_match_revision: input.ifMatchRevision ?? input.if_match_revision,
        },
      });
    },
    restoreTaskVersion(projectId, taskId, versionId, input = {}) {
      assertRequired(projectId, "projectId");
      assertRequired(taskId, "taskId");
      assertRequired(versionId, "versionId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/versions/${encodeURIComponent(versionId)}/restore`, {
        method: "POST",
        body: {
          if_match_revision: input.ifMatchRevision ?? input.if_match_revision,
        },
      });
    },
    purgeTaskVersion(projectId, taskId, versionId) {
      assertRequired(projectId, "projectId");
      assertRequired(taskId, "taskId");
      assertRequired(versionId, "versionId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/versions/${encodeURIComponent(versionId)}/purge`, {
        method: "POST",
      });
    },
    listTrainingSources() {
      return requestJson("/api/training-sources");
    },
    listTrainingSets(options = {}) {
      const includeDeleted = options.includeDeleted || options.include_deleted;
      const query = includeDeleted ? "?include_deleted=1" : "";
      return requestJson(`/api/training-sets${query}`);
    },
    createTrainingSet(input = {}) {
      return requestJson("/api/training-sets", {
        method: "POST",
        body: {
          training_set_id: input.trainingSetId || input.training_set_id || input.id,
          name: input.name,
          description: input.description,
          sources: input.sources || [],
          approved_only: Boolean(input.approvedOnly || input.approved_only),
          split: input.split,
        },
      });
    },
    getTrainingSet(trainingSetId) {
      assertRequired(trainingSetId, "trainingSetId");
      return requestJson(`/api/training-sets/${encodeURIComponent(trainingSetId)}`);
    },
    archiveTrainingSet(trainingSetId, input = {}) {
      assertRequired(trainingSetId, "trainingSetId");
      return requestJson(`/api/training-sets/${encodeURIComponent(trainingSetId)}`, {
        method: "DELETE",
        body: {
          delete_reason: input.reason || input.deleteReason || input.delete_reason,
          if_match_revision: input.ifMatchRevision ?? input.if_match_revision,
        },
      });
    },
    restoreTrainingSet(trainingSetId, input = {}) {
      assertRequired(trainingSetId, "trainingSetId");
      return requestJson(`/api/training-sets/${encodeURIComponent(trainingSetId)}/restore`, {
        method: "POST",
        body: {
          if_match_revision: input.ifMatchRevision ?? input.if_match_revision,
        },
      });
    },
    async getProjectFileBlob(projectId, relativePath) {
      assertRequired(projectId, "projectId");
      assertRequired(relativePath, "relativePath");
      const response = await fetchImpl(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/files?path=${encodeURIComponent(relativePath)}`, {
        method: "GET",
        headers: {
          ...sessionHeaders(getSession()),
        },
      });
      if (!response.ok) {
        throw await createApiError(response);
      }
      return response.blob();
    },
    uploadImage(projectId, input = {}) {
      assertRequired(projectId, "projectId");
      const path = `/api/projects/${encodeURIComponent(projectId)}/images`;
      if (input.file) {
        const form = new FormData();
        form.set("image_id", input.imageId || input.id || "");
        form.set("file_name", input.fileName || input.file_name || input.file.name);
        form.set("width", String(input.width || ""));
        form.set("height", String(input.height || ""));
        form.set("image", input.file, input.fileName || input.file_name || input.file.name);
        return requestJson(path, {
          method: "POST",
          form,
        });
      }
      return requestJson(path, {
        method: "POST",
        body: {
          image_id: input.imageId || input.id,
          file_name: input.fileName || input.file_name,
          data_url: input.dataUrl || input.data_url,
          width: input.width,
          height: input.height,
        },
      });
    },
    saveMask(projectId, imageId, input = {}) {
      assertRequired(projectId, "projectId");
      assertRequired(imageId, "imageId");
      return requestJson(`/api/images/${encodeURIComponent(imageId)}/mask`, {
        method: "PUT",
        body: {
          project_id: projectId,
          data_url: input.dataUrl || input.data_url,
          status: input.status,
          mask_ratio: input.maskRatio ?? input.mask_ratio,
          revision_event: input.revisionEvent || input.revision_event,
        },
      });
    },
    reviewImage(projectId, imageId, input = {}) {
      assertRequired(projectId, "projectId");
      assertRequired(imageId, "imageId");
      return requestJson(`/api/images/${encodeURIComponent(imageId)}/review`, {
        method: "PUT",
        body: {
          project_id: projectId,
          action: input.action,
          reason: input.reason || input.reject_reason,
          reason_code: input.reasonCode || input.reason_code,
        },
      });
    },
    removeImage(projectId, imageId, input = {}) {
      assertRequired(projectId, "projectId");
      assertRequired(imageId, "imageId");
      return requestJson(`/api/images/${encodeURIComponent(imageId)}`, {
        method: "DELETE",
        body: {
          project_id: projectId,
          delete_reason: input.reason || input.deleteReason || input.delete_reason,
        },
      });
    },
    restoreImage(projectId, imageId) {
      assertRequired(projectId, "projectId");
      assertRequired(imageId, "imageId");
      return requestJson(`/api/images/${encodeURIComponent(imageId)}/restore`, {
        method: "POST",
        body: {
          project_id: projectId,
        },
      });
    },
    assignImage(projectId, imageId, input = {}) {
      assertRequired(projectId, "projectId");
      assertRequired(imageId, "imageId");
      return requestJson(`/api/images/${encodeURIComponent(imageId)}/assignment`, {
        method: "PUT",
        body: {
          project_id: projectId,
          worker_id: input.workerId || input.worker_id,
          reviewer_id: input.reviewerId || input.reviewer_id,
        },
      });
    },
    async downloadProjectExport(projectId, options = {}) {
      assertRequired(projectId, "projectId");
      const query = options.approvedOnly ? "?approved_only=1" : "";
      const response = await fetchImpl(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/export${query}`, {
        method: "GET",
        headers: {
          ...sessionHeaders(getSession()),
          ...(options.headers || {}),
        },
      });
      if (!response.ok) {
        throw await createApiError(response);
      }
      return response.blob();
    },
    async downloadTrainingSetExport(input = {}) {
      const path = input.trainingSetId || input.training_set_id
        ? `/api/training-sets/${encodeURIComponent(input.trainingSetId || input.training_set_id)}/export`
        : "/api/training-sets/export";
      const savedExport = Boolean(input.trainingSetId || input.training_set_id);
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: savedExport ? "GET" : "POST",
        headers: {
          accept: "application/zip",
          ...(savedExport ? {} : { "content-type": "application/json" }),
          ...sessionHeaders(getSession()),
          ...(input.headers || {}),
        },
        body: savedExport ? undefined : JSON.stringify({
          sources: input.sources || [],
          approved_only: Boolean(input.approvedOnly || input.approved_only),
        }),
      });
      if (!response.ok) {
        throw await createApiError(response);
      }
      return response.blob();
    },
  };

  async function requestJson(path, options = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        accept: "application/json",
        ...sessionHeaders(options.skipAuth ? {} : getSession()),
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: options.form || (options.body ? JSON.stringify(options.body) : undefined),
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    return response.json();
  }
}

function sessionHeaders(session = {}) {
  const token = String(session.token || "").trim();
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export function normalizeApiError(error) {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) {
    return new ApiError(error.message || "Network request failed", {
      status: 0,
      code: "network_error",
      cause: error,
    });
  }
  return new ApiError("Network request failed", {
    status: 0,
    code: "network_error",
  });
}

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status || 0;
    this.code = options.code || "api_error";
    this.details = options.details || null;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

async function createApiError(response) {
  const payload = await readErrorPayload(response);
  return new ApiError(payload.message || `API request failed with status ${response.status}`, {
    status: response.status,
    code: payload.error || "api_error",
    details: payload,
  });
}

async function readErrorPayload(response) {
  try {
    return await response.json();
  } catch {
    return {
      error: "api_error",
      message: response.statusText || "API request failed",
    };
  }
}

function assertRequired(value, label) {
  if (!String(value || "").trim()) {
    throw new TypeError(`${label} is required`);
  }
}
