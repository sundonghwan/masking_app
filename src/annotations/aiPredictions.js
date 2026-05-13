import { labelByClassId, validateClassId } from "./labels.js";

export function normalizeAiPrediction(input = {}, labels = []) {
  const classId = Number(input.class_id ?? input.classId);
  const validation = validateClassId(labels, classId);
  if (!validation.valid) {
    return { valid: false, reason: validation.reason };
  }

  const maskDataUrl = String(input.mask_data_url || input.maskDataUrl || "").trim();
  if (!maskDataUrl.startsWith("data:image/")) {
    return { valid: false, reason: "mask_data_url_required" };
  }

  const label = labelByClassId(labels, classId);
  const score = normalizeScore(input.score);
  return {
    valid: true,
    prediction: {
      prediction_id: String(input.prediction_id || input.predictionId || "").trim(),
      class_id: classId,
      class_name: String(input.class_name || input.className || label?.name || `class_${classId}`).trim(),
      score,
      mask_data_url: maskDataUrl,
      mask_width: toNonNegativeInt(input.mask_width ?? input.maskWidth),
      mask_height: toNonNegativeInt(input.mask_height ?? input.maskHeight),
    },
  };
}

export function selectAiPredictionForClass(predictions = [], classId, labels = []) {
  const selectedClassId = Number(classId);
  const candidate = Array.isArray(predictions)
    ? predictions.find((prediction) => Number(prediction.class_id ?? prediction.classId) === selectedClassId)
    : null;
  if (!candidate) {
    return { valid: false, reason: "prediction_not_found" };
  }
  return normalizeAiPrediction(candidate, labels);
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0) return 0;
  if (number > 1) return 1;
  return number;
}

function toNonNegativeInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}
