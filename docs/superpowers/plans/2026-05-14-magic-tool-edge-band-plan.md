# Magic Tool Edge Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the magic tool include a small detected contour band together with the clicked interior region.

**Architecture:** Keep the current flood-fill and Sobel edge map. Add a focused post-processing helper that expands from selected interior pixels into nearby high-edge pixels, bounded by radius and `maxPixels`, before smoothing.

**Tech Stack:** Browser ES modules, `src/editor/maskEditor.js`, Node built-in test runner.

---

### Task 1: Add Regression Test

**Files:**
- Modify: `tests/maskEditor.test.js`

- [ ] **Step 1: Add failing edge-band test**

Add a test near the existing `selectEdgeAwareRegionFromImageData` tests:

```js
test("selectEdgeAwareRegionFromImageData includes adjacent border edge band", async () => {
  const { selectEdgeAwareRegionFromImageData } = await import("../src/editor/maskEditor.js");
  const imageData = new TestImageData(7, 5);
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const isBorder = x === 1 || x === 5 || y === 1 || y === 3;
      const isInterior = x >= 2 && x <= 4 && y === 2;
      const value = isInterior ? 80 : (isBorder ? 20 : 220);
      imageData.data.set([value, value, value, 255], (y * imageData.width + x) * 4);
    }
  }

  const region = selectEdgeAwareRegionFromImageData(imageData, { x: 3, y: 2 }, {
    colorTolerance: 0,
    edgeThreshold: 80,
    edgeBandRadius: 2,
    maxPixels: 100,
    smoothIterations: 0,
  });

  assert.equal(region.some((pixel) => pixel.x === 3 && pixel.y === 2), true);
  assert.equal(region.some((pixel) => pixel.x === 1 && pixel.y === 2), true);
  assert.equal(region.some((pixel) => pixel.x === 5 && pixel.y === 2), true);
  assert.equal(region.some((pixel) => pixel.x === 0), false);
  assert.equal(region.some((pixel) => pixel.x === 6), false);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/maskEditor.test.js
```

Expected: fail because the current algorithm does not include the border band.

### Task 2: Implement Edge Band Expansion

**Files:**
- Modify: `src/editor/maskEditor.js`

- [ ] **Step 1: Add default option**

Add `edgeBandRadius: 2` and `edgeBandColorTolerance: 75` to `MAGIC_DEFAULTS`.

- [ ] **Step 2: Thread option into region growth**

Pass `edgeBandRadius` and `edgeBandColorTolerance` from
`selectEdgeAwareRegionFromImageData` into `growRegionFromImageData`.

- [ ] **Step 3: Add edge-band helper**

Add a helper that receives the selected region, edge map, threshold, dimensions,
radius, and max pixel count. It should add only high-edge pixels within the
radius of existing region pixels and within the edge-band color tolerance.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/maskEditor.test.js
```

Expected: pass.

### Task 3: Validate And Commit

**Files:**
- Modify: `harness/run_log.md`
- Create or update: `harness/tasks/2026-05-14-magic-tool-edge-band.md`

- [ ] **Step 1: Run focused and standard checks**

Run:

```bash
node --test tests/maskEditor.test.js
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
git diff --check
```

- [ ] **Step 2: Record harness evidence**

Record the regression, implementation, and validation commands in the task file
and `harness/run_log.md`.

- [ ] **Step 3: Commit and push**

Run:

```bash
git add src/editor/maskEditor.js tests/maskEditor.test.js docs/superpowers/specs/2026-05-14-magic-tool-edge-band-design.md docs/superpowers/plans/2026-05-14-magic-tool-edge-band-plan.md harness/tasks/2026-05-14-magic-tool-edge-band.md harness/run_log.md
git commit -m "Improve magic tool border selection"
git push
```
