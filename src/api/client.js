export function createMaskingApiClient(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = String(options.baseUrl || "").replace(/\/+$/, "");

  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetch implementation is required");
  }

  return {
    health() {
      return requestJson("/api/health");
    },
    createProject(input = {}) {
      return requestJson("/api/projects", {
        method: "POST",
        body: {
          id: input.projectId || input.id,
          name: input.name,
          description: input.description,
        },
      });
    },
    listProjects() {
      return requestJson("/api/projects");
    },
    uploadImage(projectId, input = {}) {
      assertRequired(projectId, "projectId");
      return requestJson(`/api/projects/${encodeURIComponent(projectId)}/images`, {
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
          reviewer_id: input.reviewerId || input.reviewer_id,
        },
      });
    },
    async downloadProjectExport(projectId, options = {}) {
      assertRequired(projectId, "projectId");
      const query = options.approvedOnly ? "?approved_only=1" : "";
      const response = await fetchImpl(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/export${query}`);
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
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    return response.json();
  }
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
