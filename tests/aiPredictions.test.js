import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_LABEL_SCHEMA } from "../src/annotations/labels.js";
import { normalizeAiPrediction, selectAiPredictionForClass } from "../src/annotations/aiPredictions.js";

test("normalizes AI segmentation predictions with class mask data", () => {
  const result = normalizeAiPrediction({
    prediction_id: "pred_1",
    class_id: 2,
    score: "0.91",
    mask_data_url: "data:image/png;base64,aaaa",
    mask_width: 1280,
    mask_height: 720,
  }, DEFAULT_LABEL_SCHEMA);

  assert.equal(result.valid, true);
  assert.equal(result.prediction.class_id, 2);
  assert.equal(result.prediction.class_name, "defect");
  assert.equal(result.prediction.score, 0.91);
  assert.equal(result.prediction.mask_data_url, "data:image/png;base64,aaaa");
});

test("rejects predictions with unknown class ids or missing mask data", () => {
  assert.deepEqual(
    normalizeAiPrediction({ class_id: 99, mask_data_url: "data:image/png;base64,aaaa" }, DEFAULT_LABEL_SCHEMA),
    { valid: false, reason: "unknown_class_id" },
  );
  assert.deepEqual(
    normalizeAiPrediction({ class_id: 1 }, DEFAULT_LABEL_SCHEMA),
    { valid: false, reason: "mask_data_url_required" },
  );
});

test("selects the prediction for the requested class id", () => {
  const prediction = selectAiPredictionForClass([
    { class_id: 2, mask_data_url: "data:image/png;base64,bbbb" },
    { class_id: 1, mask_data_url: "data:image/png;base64,aaaa" },
  ], 1, DEFAULT_LABEL_SCHEMA);

  assert.equal(prediction.valid, true);
  assert.equal(prediction.prediction.class_id, 1);
  assert.equal(prediction.prediction.class_name, "target");
});
