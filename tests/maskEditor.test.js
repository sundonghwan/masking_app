import assert from "node:assert/strict";
import test from "node:test";

class TestImageData {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

globalThis.ImageData = TestImageData;

test("mask editor module exports the browser engine API", async () => {
  const module = await import("../src/editor/maskEditor.js");

  assert.equal(typeof module.createMaskEditor, "function");
  assert.equal(typeof module.MaskEditor, "function");
  assert.equal(typeof module.normalizeMaskImageData, "function");
  assert.equal(module.MASK_EDITOR_DEFAULTS.overlayColor, "#E5484D");
});

test("normalizeMaskImageData converts source pixels to binary alpha mask", async () => {
  const { normalizeMaskImageData } = await import("../src/editor/maskEditor.js");
  const imageData = new TestImageData(3, 1);

  imageData.data.set([
    255, 255, 255, 255,
    10, 10, 10, 255,
    255, 255, 255, 0,
  ]);

  const normalized = normalizeMaskImageData(imageData);

  assert.deepEqual([...normalized.data], [
    255, 255, 255, 255,
    255, 255, 255, 0,
    255, 255, 255, 0,
  ]);
});

test("panDeltaForKey maps arrow keys without touching mask state", async () => {
  const { panDeltaForKey } = await import("../src/editor/maskEditor.js");

  assert.deepEqual(panDeltaForKey("ArrowLeft", 24), { dx: 24, dy: 0 });
  assert.deepEqual(panDeltaForKey("ArrowRight", 24), { dx: -24, dy: 0 });
  assert.deepEqual(panDeltaForKey("ArrowUp", 24), { dx: 0, dy: 24 });
  assert.deepEqual(panDeltaForKey("ArrowDown", 24), { dx: 0, dy: -24 });
  assert.equal(panDeltaForKey("a", 24), null);
});

test("selectConnectedRegionFromImageData returns local connected region only", async () => {
  const { selectConnectedRegionFromImageData } = await import("../src/editor/maskEditor.js");
  const imageData = new TestImageData(4, 2);
  imageData.data.set([
    10, 10, 10, 255,
    11, 11, 11, 255,
    200, 200, 200, 255,
    10, 10, 10, 255,
    12, 12, 12, 255,
    13, 13, 13, 255,
    201, 201, 201, 255,
    10, 10, 10, 255,
  ]);

  const region = selectConnectedRegionFromImageData(imageData, { x: 0, y: 0 }, { tolerance: 5 });

  assert.deepEqual(region, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ]);
});

test("selectConnectedRegionFromImageData respects max pixel cap", async () => {
  const { selectConnectedRegionFromImageData } = await import("../src/editor/maskEditor.js");
  const imageData = new TestImageData(3, 3);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data.set([10, 10, 10, 255], i);
  }

  const region = selectConnectedRegionFromImageData(imageData, { x: 1, y: 1 }, { tolerance: 0, maxPixels: 3 });

  assert.equal(region.length, 3);
});

test("selectEdgeAwareRegionFromImageData uses diagonal neighbors for natural expansion", async () => {
  const { selectEdgeAwareRegionFromImageData } = await import("../src/editor/maskEditor.js");
  const imageData = new TestImageData(3, 3);
  imageData.data.set([
    10, 10, 10, 255,
    200, 200, 200, 255,
    200, 200, 200, 255,
    200, 200, 200, 255,
    10, 10, 10, 255,
    200, 200, 200, 255,
    200, 200, 200, 255,
    200, 200, 200, 255,
    10, 10, 10, 255,
  ]);

  const region = selectEdgeAwareRegionFromImageData(imageData, { x: 0, y: 0 }, {
    colorTolerance: 0,
    edgeThreshold: Infinity,
    smoothIterations: 0,
  });

  assert.deepEqual(region, [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ]);
});

test("selectEdgeAwareRegionFromImageData stops at strong image edges", async () => {
  const { selectEdgeAwareRegionFromImageData } = await import("../src/editor/maskEditor.js");
  const imageData = new TestImageData(7, 5);
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const value = x <= 2 ? 20 : 220;
      imageData.data.set([value, value, value, 255], (y * imageData.width + x) * 4);
    }
  }

  const region = selectEdgeAwareRegionFromImageData(imageData, { x: 1, y: 2 }, {
    colorTolerance: 255,
    edgeThreshold: 80,
    maxPixels: 100,
    smoothIterations: 0,
  });

  assert.ok(region.length > 0);
  assert.equal(region.some((pixel) => pixel.x >= 4), false);
});

test("constructor rejects missing visible canvas", async () => {
  const { createMaskEditor } = await import("../src/editor/maskEditor.js");

  assert.throws(
    () => createMaskEditor(),
    /requires a visible canvas/,
  );
});
