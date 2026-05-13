# Multi-Class Mask Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project label schemas and image-level class-labeled binary mask annotations so one image can contain multiple `class_id + mask` outputs.

**Architecture:** Keep the current binary `MaskEditor` as the per-annotation mask editor. Add class labels around each binary mask instead of converting the editor source of truth to indexed masks. Preserve legacy single-mask fields until class-aware export and migration are complete.

**Tech Stack:** Dependency-free browser JavaScript, Node HTTP server, filesystem storage, IndexedDB recovery, Node built-in tests.

---

## File Structure

- Create `src/annotations/labels.js`
  - Normalize project label schemas.
  - Validate unique positive integer `class_id` values.
  - Provide the default legacy label.
- Create `src/annotations/records.js`
  - Create and update image annotation records.
  - Generate deterministic annotation ids and class-aware mask paths.
  - Convert legacy image mask fields into annotation records.
- Modify `src/export/exporter.js`
  - Add class-aware annotation metadata creation while preserving legacy export.
- Modify `src/export/trainingSet.js`
  - Include `label_schema` and per-annotation class metadata in training-set manifests.
- Modify `src/server/storage.js`
  - Persist label schema and annotation fields in manifests.
  - Extend repair behavior to migrate legacy masks into default-label annotations.
- Modify `src/server/api.js`
  - Return and update label schema through project settings.
  - Validate class-aware mask save requests.
- Modify `src/api/client.js`
  - Add label schema to project settings payloads.
  - Add annotation-aware mask save payload fields.
- Modify `src/editor/maskEditor.js`
  - Keep binary mask behavior unchanged.
  - No indexed-mask rewrite in phase 1.
- Modify `src/app.js`
  - Add selected label state.
  - Load/save the selected label annotation mask.
  - Make previous-frame copy match by `class_id`.
- Modify `index.html`
  - Add label selector and image annotation list.
- Modify `src/styles.css`
  - Add compact label/annotation controls using the existing workbench style.
- Tests:
  - `tests/labelSchema.test.js`
  - `tests/annotationRecords.test.js`
  - existing `tests/exporter.test.js`
  - existing `tests/trainingSet.test.js`
  - existing `tests/serverApi.test.js`
  - existing `tests/appContracts.test.js`
  - existing `tests/maskEditor.test.js`

---

### Task 1: Label Schema Utilities

**Files:**
- Create: `src/annotations/labels.js`
- Create: `tests/labelSchema.test.js`

- [ ] **Step 1: Write failing label schema tests**

Add `tests/labelSchema.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LABEL_SCHEMA,
  normalizeLabelSchema,
  labelByClassId,
} from "../src/annotations/labels.js";

test("normalizes project label schemas with stable class ids", () => {
  const labels = normalizeLabelSchema([
    { class_id: "1", name: " crack ", color: "#EF4444" },
    { classId: 2, name: "corrosion", enabled: false },
  ]);

  assert.deepEqual(labels, [
    {
      class_id: 1,
      name: "crack",
      color: "#ef4444",
      description: "",
      enabled: true,
    },
    {
      class_id: 2,
      name: "corrosion",
      color: "#64748b",
      description: "",
      enabled: false,
    },
  ]);
});

test("default label schema keeps legacy single-mask projects editable", () => {
  assert.deepEqual(normalizeLabelSchema([]), DEFAULT_LABEL_SCHEMA);
  assert.equal(labelByClassId(DEFAULT_LABEL_SCHEMA, 1).name, "target");
});

test("label schema rejects duplicate or invalid class ids", () => {
  assert.throws(
    () => normalizeLabelSchema([{ class_id: 1, name: "a" }, { class_id: 1, name: "b" }]),
    /Duplicate class_id/,
  );
  assert.throws(
    () => normalizeLabelSchema([{ class_id: 0, name: "background" }]),
    /class_id must be a positive integer/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/labelSchema.test.js
```

Expected: fail because `src/annotations/labels.js` does not exist.

- [ ] **Step 3: Implement label schema utilities**

Create `src/annotations/labels.js`:

```js
export const DEFAULT_LABEL_SCHEMA = Object.freeze([
  Object.freeze({
    class_id: 1,
    name: "target",
    color: "#ef4444",
    description: "",
    enabled: true,
  }),
]);

const DEFAULT_COLOR = "#64748b";

export function normalizeLabelSchema(input = []) {
  const source = Array.isArray(input) && input.length > 0 ? input : DEFAULT_LABEL_SCHEMA;
  const seen = new Set();
  return source.map((label) => {
    const classId = Number(label.class_id ?? label.classId);
    if (!Number.isInteger(classId) || classId < 1) {
      throw new TypeError("class_id must be a positive integer");
    }
    if (seen.has(classId)) {
      throw new TypeError(`Duplicate class_id: ${classId}`);
    }
    seen.add(classId);
    return {
      class_id: classId,
      name: normalizeLabelName(label.name || `class_${classId}`),
      color: normalizeColor(label.color || DEFAULT_COLOR),
      description: String(label.description || ""),
      enabled: label.enabled !== false,
    };
  });
}

export function labelByClassId(labels = DEFAULT_LABEL_SCHEMA, classId) {
  const normalizedClassId = Number(classId);
  return normalizeLabelSchema(labels).find((label) => label.class_id === normalizedClassId) || null;
}

export function normalizeLabelName(value) {
  const name = String(value || "").trim().replace(/\s+/g, "_");
  return name || "target";
}

function normalizeColor(value) {
  const color = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT_COLOR;
}
```

- [ ] **Step 4: Run label schema tests**

Run:

```bash
node --test tests/labelSchema.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/annotations/labels.js tests/labelSchema.test.js
git commit -m "Add label schema utilities"
```

---

### Task 2: Annotation Record Utilities

**Files:**
- Create: `src/annotations/records.js`
- Create: `tests/annotationRecords.test.js`

- [ ] **Step 1: Write failing annotation record tests**

Add `tests/annotationRecords.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  annotationIdForClass,
  createAnnotationRecord,
  migrateLegacyImageAnnotations,
} from "../src/annotations/records.js";

const label = {
  class_id: 2,
  name: "corrosion",
  color: "#f59e0b",
  enabled: true,
};

test("creates deterministic class-aware annotation records", () => {
  const annotation = createAnnotationRecord({
    imageId: "image 1",
    imageWidth: 1280,
    imageHeight: 720,
    label,
    maskDataUrl: "data:image/png;base64,aaaa",
    maskRatio: 0.25,
    source: "manual",
    now: "2026-05-13T00:00:00.000Z",
  });

  assert.equal(annotation.annotation_id, "ann_image_1_class_2");
  assert.equal(annotation.class_id, 2);
  assert.equal(annotation.class_name, "corrosion");
  assert.equal(annotation.mask_path, "masks/image_1_class_2_corrosion_mask.png");
  assert.equal(annotation.mask_width, 1280);
  assert.equal(annotation.mask_height, 720);
  assert.equal(annotation.mask_ratio, 0.25);
  assert.equal(annotation.source, "manual");
});

test("migrates legacy image masks into default class annotations", () => {
  const image = {
    id: "legacy-image",
    current_mask_path: "masks/legacy-image_mask.png",
    mask_data_url: "data:image/png;base64,bbbb",
    mask_width: 10,
    mask_height: 12,
    mask_ratio: 0.5,
  };

  const annotations = migrateLegacyImageAnnotations(image, {
    imageWidth: 10,
    imageHeight: 12,
    now: "2026-05-13T00:00:00.000Z",
  });

  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].class_id, 1);
  assert.equal(annotations[0].mask_path, "masks/legacy-image_mask.png");
  assert.equal(annotations[0].mask_ratio, 0.5);
});

test("annotation ids are stable by image id and class id", () => {
  assert.equal(annotationIdForClass("frame 001", 7), "ann_frame_001_class_7");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/annotationRecords.test.js
```

Expected: fail because `src/annotations/records.js` does not exist.

- [ ] **Step 3: Implement annotation utilities**

Create `src/annotations/records.js`:

```js
import { DEFAULT_LABEL_SCHEMA, labelByClassId, normalizeLabelName } from "./labels.js";

export function annotationIdForClass(imageId, classId) {
  return `ann_${sanitizeId(imageId)}_class_${Number(classId)}`;
}

export function createAnnotationRecord(input = {}) {
  const label = input.label;
  if (!label) throw new TypeError("label is required");
  const imageId = sanitizeId(input.imageId);
  const classId = Number(label.class_id);
  const className = normalizeLabelName(label.name);
  const now = String(input.now || new Date().toISOString());
  return {
    annotation_id: annotationIdForClass(imageId, classId),
    class_id: classId,
    class_name: className,
    color: label.color || "#64748b",
    mask_path: input.maskPath || `masks/${imageId}_class_${classId}_${className}_mask.png`,
    mask_data_url: input.maskDataUrl || input.mask_data_url || "",
    mask_width: Number(input.maskWidth || input.mask_width || input.imageWidth || 0),
    mask_height: Number(input.maskHeight || input.mask_height || input.imageHeight || 0),
    mask_ratio: Number(input.maskRatio ?? input.mask_ratio ?? 0),
    source: input.source || "manual",
    score: input.score ?? null,
    status: input.status || "in_progress",
    created_at: input.createdAt || input.created_at || now,
    updated_at: now,
  };
}

export function migrateLegacyImageAnnotations(image = {}, options = {}) {
  if (Array.isArray(image.annotations) && image.annotations.length > 0) {
    return image.annotations;
  }
  const maskPath = image.current_mask_path || image.mask_path || image.maskPath || "";
  const maskDataUrl = image.mask_data_url || image.maskDataUrl || "";
  if (!maskPath && !maskDataUrl) return [];
  const label = labelByClassId(options.labelSchema || DEFAULT_LABEL_SCHEMA, 1);
  return [createAnnotationRecord({
    imageId: image.id || image.image_id,
    imageWidth: options.imageWidth || image.width || image.mask_width,
    imageHeight: options.imageHeight || image.height || image.mask_height,
    label,
    maskPath,
    maskDataUrl,
    maskWidth: image.mask_width || options.imageWidth,
    maskHeight: image.mask_height || options.imageHeight,
    maskRatio: image.mask_ratio ?? image.maskRatio ?? 0,
    source: "legacy",
    status: image.status || "in_progress",
    now: options.now,
  })];
}

function sanitizeId(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/_{2,}/g, "_") || "item";
}
```

- [ ] **Step 4: Run annotation record tests**

Run:

```bash
node --test tests/annotationRecords.test.js tests/labelSchema.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/annotations/records.js tests/annotationRecords.test.js
git commit -m "Add class-labeled annotation records"
```

---

### Task 3: Project Settings Label Schema API

**Files:**
- Modify: `src/server/api.js`
- Modify: `src/api/client.js`
- Modify: `tests/serverApi.test.js`
- Modify: `tests/apiClient.test.js`

- [ ] **Step 1: Add failing API/client tests**

Add a server API test:

```js
test("admin updates project label schema through settings", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  const adminHeaders = await loginHeaders(route, "admin");

  const response = await callJson(route, "PATCH", "/api/projects/project-1/settings", {
    label_schema: [
      { class_id: 1, name: "crack", color: "#ef4444" },
      { class_id: 2, name: "corrosion", color: "#f59e0b" },
    ],
  }, adminHeaders);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.settings.label_schema.length, 2);
  assert.equal((await storage.readProjectManifest("project-1")).label_schema[1].name, "corrosion");
});
```

Add an API client assertion to the existing project settings client test:

```js
label_schema: [
  { class_id: 1, name: "crack", color: "#ef4444" },
]
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/serverApi.test.js tests/apiClient.test.js
```

Expected: fail because settings do not persist `label_schema`.

- [ ] **Step 3: Implement settings label schema support**

Implementation requirements:

- import `normalizeLabelSchema` from `src/annotations/labels.js`
- in `PATCH /api/projects/:project_id/settings`, when body contains
  `label_schema` or `labelSchema`, persist normalized labels as `manifest.label_schema`
- in `src/api/client.js`, send `label_schema: input.labelSchema || input.label_schema`

- [ ] **Step 4: Run API tests**

Run:

```bash
node --test tests/serverApi.test.js tests/apiClient.test.js tests/labelSchema.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/api.js src/api/client.js tests/serverApi.test.js tests/apiClient.test.js
git commit -m "Add project label schema settings"
```

---

### Task 4: Selected Label State In Workbench

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Modify: `tests/appContracts.test.js`

- [ ] **Step 1: Add failing app contract test**

Add to `tests/appContracts.test.js`:

```js
test("workbench exposes class label selection for mask tools", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="labelSelector"/);
  assert.match(html, /id="imageAnnotationList"/);
  assert.match(app, /selectedClassId/);
  assert.match(app, /renderLabelSelector/);
  assert.match(app, /selectClassLabel/);
  assert.match(app, /selectedLabelAnnotation/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test tests/appContracts.test.js
```

Expected: fail because label UI/state does not exist.

- [ ] **Step 3: Add label selector UI**

In `index.html`, add an inspector section near tool controls:

```html
<section class="panel-section">
  <h2>라벨</h2>
  <div class="label-selector" id="labelSelector" role="listbox" aria-label="마스크 라벨"></div>
  <div class="annotation-list" id="imageAnnotationList"></div>
  <p class="sync-message" id="labelMessage">라벨을 선택한 뒤 마스크를 편집합니다.</p>
</section>
```

In `src/app.js`:

- add `selectedClassId: 1` to state
- add element refs for `labelSelector`, `imageAnnotationList`, `labelMessage`
- add `renderLabelSelector()`
- add `selectClassLabel(classId)`
- add `selectedLabelAnnotation(image)`
- call `renderLabelSelector()` from `render()`

- [ ] **Step 4: Add minimal label styles**

In `src/styles.css`, add compact styles:

```css
.label-selector,
.annotation-list {
  display: grid;
  gap: 6px;
}

.label-option,
.annotation-row {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.label-swatch {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
}
```

- [ ] **Step 5: Run app contract test**

Run:

```bash
node --test tests/appContracts.test.js
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add index.html src/app.js src/styles.css tests/appContracts.test.js
git commit -m "Add workbench label selector"
```

---

### Task 5: Save Selected Class Annotation Mask

**Files:**
- Modify: `src/app.js`
- Modify: `src/server/api.js`
- Modify: `tests/serverApi.test.js`
- Modify: `tests/appContracts.test.js`

- [ ] **Step 1: Add failing tests**

Server API test:

```js
test("mask save records class-labeled annotations", async () => {
  const { route, storage } = createApiHarness();
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());
  const workerHeaders = await loginHeaders(route, "worker");

  const response = await callJson(route, "PUT", "/api/images/image-1/mask", {
    project_id: "project-1",
    class_id: 2,
    class_name: "corrosion",
    mask_data_url: VALID_MASK_DATA_URL,
    status: "in_progress",
  }, workerHeaders);

  assert.equal(response.statusCode, 200);
  const image = (await storage.readProjectManifest("project-1")).images[0];
  assert.equal(image.annotations[0].class_id, 2);
  assert.match(image.annotations[0].mask_path, /class_2_corrosion_mask\.png/);
});
```

App contract test:

```js
assert.match(app, /selectedClassId/);
assert.match(app, /class_id: state\.selectedClassId/);
assert.match(app, /annotations/);
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/serverApi.test.js tests/appContracts.test.js
```

Expected: fail because mask save is still image-level only.

- [ ] **Step 3: Implement annotation-aware save**

Implementation requirements:

- browser `syncMaskToBackend` sends `class_id` and `class_name`
- server `PUT /api/images/:image_id/mask` writes mask path using
  `image_id_class_{class_id}_{class_name}_mask.png`
- server upserts `image.annotations[]` by `class_id`
- legacy fields `current_mask_path` and `mask_data_url` continue to update for
  compatibility with current UI/export until class-aware export is complete

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/serverApi.test.js tests/appContracts.test.js tests/annotationRecords.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/server/api.js tests/serverApi.test.js tests/appContracts.test.js
git commit -m "Save class-labeled annotation masks"
```

---

### Task 6: Previous-Frame Copy By Class ID

**Files:**
- Modify: `src/app.js`
- Modify: `tests/appContracts.test.js`
- Modify: `tests/maskEditor.test.js` only if editor behavior changes

- [ ] **Step 1: Add failing app contract assertion**

In the previous-frame mask copy test, assert:

```js
assert.match(app, /previousMaskSourceAnnotation/);
assert.match(app, /class_id === state\.selectedClassId/);
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test tests/appContracts.test.js
```

Expected: fail because previous copy only checks image-level masks.

- [ ] **Step 3: Implement class-aware previous copy**

Implementation requirements:

- add `previousMaskSourceAnnotation()`
- when selected class has a previous annotation, copy that annotation mask
- fallback to legacy previous mask only for default class `1`
- copied annotation source becomes `copied_previous`

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/appContracts.test.js tests/maskEditor.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/appContracts.test.js
git commit -m "Copy previous masks by class id"
```

---

### Task 7: Class-Aware Export Metadata

**Files:**
- Modify: `src/export/exporter.js`
- Modify: `src/export/trainingSet.js`
- Modify: `tests/exporter.test.js`
- Modify: `tests/trainingSet.test.js`

- [ ] **Step 1: Add failing export tests**

Add exporter test:

```js
test("annotations json nests class-labeled masks under images", () => {
  const image = createImageRecord({
    id: "image-1",
    imagePath: "images/image-1.png",
    width: 10,
    height: 10,
    status: "approved",
  });
  image.annotations = [
    {
      annotation_id: "ann_image_1_class_2",
      class_id: 2,
      class_name: "corrosion",
      mask_path: "masks/image-1_class_2_corrosion_mask.png",
      mask_width: 10,
      mask_height: 10,
      mask_ratio: 0.2,
    },
  ];

  const annotations = JSON.parse(createAnnotationsJson("project-1", [image], {
    labelSchema: [{ class_id: 2, name: "corrosion", color: "#f59e0b" }],
  }));

  assert.equal(annotations.label_schema[0].class_id, 2);
  assert.equal(annotations.items[0].annotations[0].class_id, 2);
  assert.equal(annotations.items[0].annotations[0].mask_path, "masks/image-1_class_2_corrosion_mask.png");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/exporter.test.js tests/trainingSet.test.js
```

Expected: fail because export metadata is image-level only.

- [ ] **Step 3: Implement class-aware export metadata**

Implementation requirements:

- `createAnnotationsJson` accepts `options.labelSchema`
- if image has `annotations[]`, output nested annotations
- if image is legacy-only, synthesize one default-label annotation
- training-set manifest items include `class_id`, `class_name`, and
  annotation-level `mask_path`

- [ ] **Step 4: Run export tests**

Run:

```bash
node --test tests/exporter.test.js tests/trainingSet.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/export/exporter.js src/export/trainingSet.js tests/exporter.test.js tests/trainingSet.test.js
git commit -m "Export class-labeled mask annotations"
```

---

### Task 8: AI Segmentation Prediction Contract

**Files:**
- Modify: `src/server/aiServing.js`
- Modify: `tests/serverApi.test.js`
- Modify: `tests/apiClient.test.js`

- [ ] **Step 1: Add failing AI contract test**

Update `generic AI serving contract is role protected and model agnostic`:

```js
assert.deepEqual(response.body.predictions, []);
assert.match(JSON.stringify(response.body.output_contract), /class_id/);
assert.match(JSON.stringify(response.body.output_contract), /mask_data_url/);
```

Add disabled-model response test:

```js
test("AI segmentation predictions must include class id and mask payload when provided", async () => {
  const result = createAiServingResponse({
    task: "segmentation",
    image: { data_url: VALID_IMAGE_DATA_URL, width: 2, height: 2 },
    predictions: [
      { class_id: 1, class_name: "crack", mask_data_url: VALID_MASK_DATA_URL, score: 0.9 },
    ],
  }, {
    enabled: true,
    provider: "stub",
    tasks: ["segmentation"],
  });

  assert.equal(result.statusCode, 202);
  assert.equal(result.body.predictions[0].class_id, 1);
  assert.match(result.body.predictions[0].mask_data_url, /^data:image\/png/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/serverApi.test.js
```

Expected: fail until AI response contract exposes segmentation prediction shape.

- [ ] **Step 3: Implement AI output contract**

Implementation requirements:

- capabilities should describe segmentation output as
  `predictions[].class_id + predictions[].mask_data_url`
- `POST /api/ai/infer` stub still returns empty predictions when no adapter is
  configured
- if a future adapter passes predictions into `createAiServingResponse`, validate
  class id and mask data URL shape

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/serverApi.test.js tests/apiClient.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/aiServing.js tests/serverApi.test.js tests/apiClient.test.js
git commit -m "Define class mask AI prediction contract"
```

---

### Task 9: Docs, Harness, And Full Verification

**Files:**
- Modify: `docs/FEATURE_STATUS.md`
- Modify: `docs/DEVELOPMENT_CHECKPOINTS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `harness/run_log.md`
- Create/update: `harness/tasks/YYYY-MM-DD-multi-class-mask-annotation.md`

- [ ] **Step 1: Update feature status**

Add completed items as each previous task lands:

```md
- [x] Project label schema for class-labeled masks
- [x] Image annotations with class_id and binary mask path
- [x] Workbench selected-label mask editing
- [x] Class-aware export metadata
- [x] AI segmentation output contract with class_id and mask_data_url
```

- [ ] **Step 2: Update architecture**

Add a section explaining:

```text
legacy binary mask = compatibility
annotations[] = new class-labeled source of truth
indexed masks = optional derived export
```

- [ ] **Step 3: Run full validation bundle**

Run:

```bash
./scripts/harness/lint-all.sh
./scripts/harness/typecheck-all.sh
./scripts/harness/test-target.sh
./scripts/harness/smoke-web.sh
git diff --check
```

Expected: all pass.

- [ ] **Step 4: Live smoke**

Run server:

```bash
MASKING_APP_HOST=127.0.0.1 MASKING_APP_AI_SERVING=1 npm run dev
```

Smoke:

```bash
curl -sS http://127.0.0.1:4173/api/health
curl -sS http://127.0.0.1:4173/api/ai/capabilities -H "authorization: Bearer <token>"
```

Expected:

- health returns deployment and AI serving status
- AI capabilities mention segmentation class/mask output

- [ ] **Step 5: Final commit and push**

```bash
git add docs/FEATURE_STATUS.md docs/DEVELOPMENT_CHECKPOINTS.md docs/ARCHITECTURE.md harness/run_log.md harness/tasks/YYYY-MM-DD-multi-class-mask-annotation.md
git commit -m "Document multi-class mask annotation completion"
git push
```

---

## Plan Self-Review

Spec coverage:

- B안, one image with many class-labeled masks: covered by Tasks 1, 2, 4, 5.
- Polygon hole problem: addressed by using binary mask images as source of truth.
- Tool label selection: covered by Task 4.
- Previous-frame copy class behavior: covered by Task 6.
- Export/training set class metadata: covered by Task 7.
- AI output `class_id + mask image`: covered by Task 8.
- Compatibility with current project: covered by Tasks 2, 5, 7.

Placeholder scan:

- No `TBD` or unbounded placeholder tasks.
- The only future work explicitly outside this plan is derived indexed export.

Risk:

- The plan is intentionally broad. If execution needs to be split, use Tasks
  1-5 as the first implementation batch and Tasks 6-9 as the second batch.
