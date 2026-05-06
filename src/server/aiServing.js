const DEFAULT_CAPABILITIES = {
  enabled: false,
  provider: "stub",
  tasks: ["detection", "segmentation", "classification"],
  maxImageBytes: 5 * 1024 * 1024,
};

export function createAiCapabilities(profile = {}) {
  const config = normalizeAiServingConfig(profile.aiServing || profile);
  return {
    enabled: config.enabled,
    provider: config.provider,
    tasks: config.tasks,
    max_image_bytes: config.maxImageBytes,
    maxImageBytes: config.maxImageBytes,
    model_required: false,
    output_contracts: {
      detection: "predictions[].box + score + label",
      segmentation: "predictions[].mask + score + label",
      classification: "predictions[].label + score",
    },
  };
}

export function createAiServingResponse(input = {}, profile = {}) {
  const config = normalizeAiServingConfig(profile.aiServing || profile);
  if (!config.enabled) {
    return {
      statusCode: 503,
      body: {
        error: "ai_serving_disabled",
        message: "AI serving is disabled in the current deployment profile",
      },
    };
  }

  const task = String(input.task || "").trim();
  if (!config.tasks.includes(task)) {
    return {
      statusCode: 400,
      body: {
        error: "unsupported_ai_task",
        message: "Requested AI task is not enabled",
        supported_tasks: config.tasks,
      },
    };
  }

  const image = input.image || {};
  const dataUrl = image.data_url || image.dataUrl || "";
  if (!String(dataUrl).startsWith("data:image/")) {
    return {
      statusCode: 400,
      body: {
        error: "image_data_url_required",
        message: "AI inference requests require image.data_url",
      },
    };
  }

  if (estimateDataUrlBytes(dataUrl) > config.maxImageBytes) {
    return {
      statusCode: 413,
      body: {
        error: "ai_image_too_large",
        message: "AI inference image exceeds the deployment profile limit",
        max_image_bytes: config.maxImageBytes,
      },
    };
  }

  return {
    statusCode: 202,
    body: {
      status: "accepted",
      task,
      provider: config.provider,
      model: null,
      predictions: [],
      diagnostics: {
        mode: "stub",
        message: "Generic AI serving contract accepted the request; no model adapter is configured.",
      },
    },
  };
}

function normalizeAiServingConfig(input = {}) {
  return {
    enabled: Boolean(input.enabled ?? DEFAULT_CAPABILITIES.enabled),
    provider: String(input.provider || DEFAULT_CAPABILITIES.provider),
    tasks: Array.isArray(input.tasks) && input.tasks.length > 0 ? input.tasks.map(String) : [...DEFAULT_CAPABILITIES.tasks],
    maxImageBytes: Number(input.maxImageBytes || input.max_image_bytes || DEFAULT_CAPABILITIES.maxImageBytes),
  };
}

function estimateDataUrlBytes(dataUrl) {
  const payload = String(dataUrl).split(",", 2)[1] || "";
  return Math.floor((payload.length * 3) / 4);
}
