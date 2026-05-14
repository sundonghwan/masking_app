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

class TestImage {
  constructor() {
    this.naturalWidth = TestImage.nextNaturalWidth || 1;
    this.naturalHeight = TestImage.nextNaturalHeight || 1;
    this.onload = null;
    this.onerror = null;
  }

  set src(value) {
    this._src = value;
    queueMicrotask(() => {
      if (typeof this.onload === "function") this.onload();
    });
  }
}

TestImage.nextNaturalWidth = 1;
TestImage.nextNaturalHeight = 1;

function installCanvasDocument() {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      if (tagName !== "canvas") throw new Error(`Unsupported test element: ${tagName}`);
      return new TestCanvas();
    },
  };
  return () => {
    globalThis.document = previousDocument;
  };
}

class TestCanvas {
  constructor() {
    this.width = 200;
    this.height = 120;
    this.listeners = new Map();
    this.context = new TestCanvasContext(this);
    this.capturedPointers = new Set();
    this.style = {};
  }

  getContext() {
    return this.context;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatchPointer(type, event = {}) {
    const listener = this.listeners.get(type);
    assert.equal(typeof listener, "function", `missing ${type} listener`);
    listener({
      pointerId: 1,
      offsetX: 50,
      offsetY: 40,
      movementX: 0,
      movementY: 0,
      ...event,
    });
  }

  setPointerCapture(pointerId) {
    this.capturedPointers.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.capturedPointers.delete(pointerId);
  }
}

class TestCanvasContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.imageData = null;
    this.drawCalls = 0;
  }

  clearRect() {}
  fillRect() {}
  save() {}
  restore() {}
  translate() {}
  scale() {}
  beginPath() {}
  arc(x, y, radius) {
    this.lastArc = { x, y, radius };
  }
  fill() {
    if (!this.lastArc) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const imageData = this.getImageData(0, 0, width, height);
    const x = Math.max(0, Math.min(width - 1, Math.round(this.lastArc.x)));
    const y = Math.max(0, Math.min(height - 1, Math.round(this.lastArc.y)));
    const index = (y * width + x) * 4;
    if (this.globalCompositeOperation === "destination-out") {
      imageData.data[index + 3] = 0;
    } else {
      imageData.data[index] = 255;
      imageData.data[index + 1] = 255;
      imageData.data[index + 2] = 255;
      imageData.data[index + 3] = 255;
    }
    this.putImageData(imageData);
  }
  stroke() {}
  setLineDash() {}

  drawImage() {
    this.drawCalls += 1;
  }

  getImageData(x, y, width, height) {
    if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) {
      this.imageData = new TestImageData(width, height);
    }
    const copy = new TestImageData(width, height);
    copy.data.set(this.imageData.data);
    return copy;
  }

  putImageData(imageData) {
    this.imageData = new TestImageData(imageData.width, imageData.height);
    this.imageData.data.set(imageData.data);
  }
}

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

test("magic tool options can be updated for dataset sensitivity", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const editor = new MaskEditor(new TestCanvas());

    editor.setMagicOptions({ colorTolerance: 12, edgeThreshold: 88 });

    assert.equal(editor.magicOptions.colorTolerance, 12);
    assert.equal(editor.magicOptions.edgeThreshold, 88);
  } finally {
    restoreDocument();
  }
});

test("mask overlay color can follow the selected label without changing mask data", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const editor = new MaskEditor(new TestCanvas(), { overlayColor: "#12ab34" });

    assert.equal(editor.getState().overlayColor, "#12AB34");

    editor.setOverlayColor("#0044aa");

    assert.equal(editor.getState().overlayColor, "#0044AA");
    assert.equal(editor.getMaskRatio(), 0);
    assert.equal(editor.getState().canUndo, false);
  } finally {
    restoreDocument();
  }
});

test("camera pan override moves viewport without changing tool, mask, onChange, or undo", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const canvas = new TestCanvas();
    let changeCount = 0;
    let viewportCount = 0;
    const editor = new MaskEditor(canvas, {
      onChange: () => { changeCount += 1; },
      onViewportChange: () => { viewportCount += 1; },
    });
    editor.image = { naturalWidth: 100, naturalHeight: 80 };
    editor.maskCanvas.width = 100;
    editor.maskCanvas.height = 80;
    editor.scale = 1;
    editor.offsetX = 0;
    editor.offsetY = 0;
    editor.setTool("brush");

    editor.setCameraPanOverride(true);
    canvas.dispatchPointer("pointerdown", { offsetX: 20, offsetY: 10 });
    canvas.dispatchPointer("pointermove", { offsetX: 32, offsetY: 17, movementX: 12, movementY: 7 });
    canvas.dispatchPointer("pointerup");

    assert.equal(editor.getState().tool, "brush");
    assert.equal(editor.getState().cameraPanOverride, true);
    assert.deepEqual(editor.getViewportState(), { scale: 1, offsetX: 12, offsetY: 7 });
    assert.equal(editor.getMaskRatio(), 0);
    assert.equal(changeCount, 0);
    assert.equal(viewportCount, 1);
    assert.equal(editor.getState().canUndo, false);

    editor.setCameraPanOverride(false);
    assert.equal(editor.getState().cameraPanOverride, false);
  } finally {
    restoreDocument();
  }
});

test("spacebar pressed during an active brush stroke does not convert that stroke to camera pan", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const canvas = new TestCanvas();
    let changeCount = 0;
    let viewportCount = 0;
    const editor = new MaskEditor(canvas, {
      onChange: () => { changeCount += 1; },
      onViewportChange: () => { viewportCount += 1; },
    });
    editor.image = { naturalWidth: 100, naturalHeight: 80 };
    editor.maskCanvas.width = 100;
    editor.maskCanvas.height = 80;
    editor.scale = 1;
    editor.offsetX = 0;
    editor.offsetY = 0;
    editor.setTool("brush");

    canvas.dispatchPointer("pointerdown", { offsetX: 20, offsetY: 10 });
    editor.setCameraPanOverride(true);
    canvas.dispatchPointer("pointermove", { offsetX: 32, offsetY: 17, movementX: 12, movementY: 7 });
    canvas.dispatchPointer("pointerup");

    assert.equal(editor.getState().tool, "brush");
    assert.deepEqual(editor.getViewportState(), { scale: 1, offsetX: 0, offsetY: 0 });
    assert.equal(changeCount >= 2, true);
    assert.equal(viewportCount, 0);
    assert.equal(editor.getState().canUndo, true);
  } finally {
    restoreDocument();
  }
});

test("two finger touch gesture pans and zooms viewport without painting the mask", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const canvas = new TestCanvas();
    let changeCount = 0;
    let viewportCount = 0;
    const editor = new MaskEditor(canvas, {
      onChange: () => { changeCount += 1; },
      onViewportChange: () => { viewportCount += 1; },
    });
    editor.image = { naturalWidth: 100, naturalHeight: 80 };
    editor.maskCanvas.width = 100;
    editor.maskCanvas.height = 80;
    editor.scale = 1;
    editor.offsetX = 0;
    editor.offsetY = 0;
    editor.setTool("brush");

    canvas.dispatchPointer("pointerdown", { pointerId: 1, pointerType: "touch", offsetX: 20, offsetY: 20 });
    canvas.dispatchPointer("pointerdown", { pointerId: 2, pointerType: "touch", offsetX: 60, offsetY: 20 });
    canvas.dispatchPointer("pointermove", { pointerId: 1, pointerType: "touch", offsetX: 10, offsetY: 30 });
    canvas.dispatchPointer("pointermove", { pointerId: 2, pointerType: "touch", offsetX: 90, offsetY: 30 });
    canvas.dispatchPointer("pointerup", { pointerId: 1 });
    canvas.dispatchPointer("pointerup", { pointerId: 2 });

    assert.equal(editor.getState().tool, "brush");
    assert.equal(editor.getViewportState().scale, 2);
    assert.deepEqual(editor.getViewportState(), { scale: 2, offsetX: -30, offsetY: -10 });
    assert.equal(editor.getMaskRatio(), 0);
    assert.equal(changeCount, 0);
    assert.equal(viewportCount >= 1, true);
    assert.equal(editor.getState().canUndo, false);
  } finally {
    restoreDocument();
  }
});

test("magic tool touch waits for tap end so two finger gesture does not apply selection", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const canvas = new TestCanvas();
    let changeCount = 0;
    const editor = new MaskEditor(canvas, {
      onChange: () => { changeCount += 1; },
    });
    editor.image = { naturalWidth: 20, naturalHeight: 20 };
    editor.maskCanvas.width = 20;
    editor.maskCanvas.height = 20;
    editor.sourceCanvas.width = 20;
    editor.sourceCanvas.height = 20;
    editor.scale = 1;
    editor.offsetX = 0;
    editor.offsetY = 0;
    editor.setTool("magic");

    canvas.dispatchPointer("pointerdown", { pointerId: 1, pointerType: "touch", offsetX: 4, offsetY: 4 });
    assert.equal(editor.getMaskRatio(), 0);
    canvas.dispatchPointer("pointerdown", { pointerId: 2, pointerType: "touch", offsetX: 10, offsetY: 4 });
    canvas.dispatchPointer("pointermove", { pointerId: 1, pointerType: "touch", offsetX: 2, offsetY: 6 });
    canvas.dispatchPointer("pointermove", { pointerId: 2, pointerType: "touch", offsetX: 14, offsetY: 6 });
    canvas.dispatchPointer("pointerup", { pointerId: 1 });
    canvas.dispatchPointer("pointerup", { pointerId: 2 });

    assert.equal(editor.getState().tool, "magic");
    assert.equal(editor.getMaskRatio(), 0);
    assert.equal(changeCount, 0);
    assert.equal(editor.getState().canUndo, false);
    assert.equal(editor.getViewportState().scale, 2);
  } finally {
    restoreDocument();
  }
});

test("magic tool touch single tap applies selection on pointer up", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const canvas = new TestCanvas();
    let changeCount = 0;
    const editor = new MaskEditor(canvas, {
      onChange: () => { changeCount += 1; },
    });
    editor.image = { naturalWidth: 8, naturalHeight: 8 };
    editor.maskCanvas.width = 8;
    editor.maskCanvas.height = 8;
    editor.sourceCanvas.width = 8;
    editor.sourceCanvas.height = 8;
    editor.scale = 1;
    editor.offsetX = 0;
    editor.offsetY = 0;
    editor.setTool("magic");

    canvas.dispatchPointer("pointerdown", { pointerId: 1, pointerType: "touch", offsetX: 2, offsetY: 2 });
    assert.equal(editor.getMaskRatio(), 0);
    canvas.dispatchPointer("pointerup", { pointerId: 1 });

    assert.equal(editor.getMaskRatio() > 0, true);
    assert.equal(changeCount, 1);
    assert.equal(editor.getState().canUndo, true);
  } finally {
    restoreDocument();
  }
});

test("pen eraser button temporarily erases without changing the selected brush tool", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const canvas = new TestCanvas();
    const editor = new MaskEditor(canvas);
    editor.image = { naturalWidth: 10, naturalHeight: 10 };
    editor.maskCanvas.width = 10;
    editor.maskCanvas.height = 10;
    editor.scale = 1;
    editor.offsetX = 0;
    editor.offsetY = 0;
    const seed = new TestImageData(10, 10);
    seed.data.set([255, 255, 255, 255], ((4 * 10 + 5) * 4));
    editor.maskCtx.putImageData(seed, 0, 0);
    editor.setTool("brush");

    canvas.dispatchPointer("pointerdown", {
      pointerId: 1,
      pointerType: "pen",
      button: 5,
      buttons: 32,
      offsetX: 5,
      offsetY: 4,
    });
    canvas.dispatchPointer("pointerup", { pointerId: 1 });

    const erased = editor.maskCtx.getImageData(0, 0, 10, 10);
    assert.equal(erased.data[((4 * 10 + 5) * 4) + 3], 0);
    assert.equal(editor.getState().tool, "brush");
    assert.equal(editor.getState().canUndo, true);
  } finally {
    restoreDocument();
  }
});

test("mask move tool drags the current mask without moving the camera", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const canvas = new TestCanvas();
    let changeCount = 0;
    let viewportCount = 0;
    const editor = new MaskEditor(canvas, {
      onChange: () => { changeCount += 1; },
      onViewportChange: () => { viewportCount += 1; },
    });
    editor.image = { naturalWidth: 6, naturalHeight: 4 };
    editor.maskCanvas.width = 6;
    editor.maskCanvas.height = 4;
    editor.scale = 1;
    editor.offsetX = 0;
    editor.offsetY = 0;
    const seed = new TestImageData(6, 4);
    seed.data.set([255, 255, 255, 255], 0);
    editor.maskCtx.putImageData(seed, 0, 0);
    editor.setTool("mask_move");

    canvas.dispatchPointer("pointerdown", { offsetX: 0, offsetY: 0 });
    canvas.dispatchPointer("pointermove", { offsetX: 2, offsetY: 1, movementX: 2, movementY: 1 });
    canvas.dispatchPointer("pointerup");

    const moved = editor.maskCtx.getImageData(0, 0, 6, 4);
    assert.equal(moved.data[3], 0);
    assert.equal(moved.data[((1 * 6 + 2) * 4) + 3], 255);
    assert.deepEqual(editor.getViewportState(), { scale: 1, offsetX: 0, offsetY: 0 });
    assert.equal(changeCount, 1);
    assert.equal(viewportCount, 0);
    assert.equal(editor.getState().canUndo, true);

    editor.undo();
    const restored = editor.maskCtx.getImageData(0, 0, 6, 4);
    assert.equal(restored.data[3], 255);
    assert.equal(restored.data[((1 * 6 + 2) * 4) + 3], 0);
  } finally {
    restoreDocument();
  }
});

test("loading a copied mask validates dimensions and records undo history", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const editor = new MaskEditor(new TestCanvas());
    editor.image = { naturalWidth: 4, naturalHeight: 3 };
    editor.maskCanvas.width = 4;
    editor.maskCanvas.height = 3;
    const copied = new TestImageData(4, 3);
    copied.data.set([255, 255, 255, 255], ((2 * 4 + 1) * 4));

    editor.replaceMaskFromImageData(copied);

    const loaded = editor.maskCtx.getImageData(0, 0, 4, 3);
    assert.equal(loaded.data[((2 * 4 + 1) * 4)], 255);
    assert.equal(editor.getState().canUndo, true);

    assert.throws(
      () => editor.replaceMaskFromImageData(new TestImageData(5, 3)),
      /Mask dimensions must match current image/,
    );
  } finally {
    restoreDocument();
  }
});

test("loading a copied mask data URL resizes to the current image dimensions", async () => {
  const restoreDocument = installCanvasDocument();
  const previousImage = globalThis.Image;
  globalThis.Image = TestImage;
  TestImage.nextNaturalWidth = 2;
  TestImage.nextNaturalHeight = 2;
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const editor = new MaskEditor(new TestCanvas());
    editor.image = { naturalWidth: 4, naturalHeight: 3 };
    editor.maskCanvas.width = 4;
    editor.maskCanvas.height = 3;

    const replaced = await editor.replaceMaskFromDataUrl("data:image/png;base64,AAAA");

    assert.equal(replaced, true);
    assert.equal(editor.maskCtx.imageData.width, 4);
    assert.equal(editor.maskCtx.imageData.height, 3);
    assert.equal(editor.getState().canUndo, true);
  } finally {
    globalThis.Image = previousImage;
    restoreDocument();
  }
});

test("mask ratio treats transparent white pixels as inactive", async () => {
  const restoreDocument = installCanvasDocument();
  try {
    const { MaskEditor } = await import("../src/editor/maskEditor.js");
    const editor = new MaskEditor(new TestCanvas());
    editor.image = { naturalWidth: 2, naturalHeight: 1 };
    editor.maskCanvas.width = 2;
    editor.maskCanvas.height = 1;
    const mask = new TestImageData(2, 1);
    mask.data.set([
      255, 255, 255, 0,
      255, 255, 255, 255,
    ]);

    editor.maskCtx.putImageData(mask, 0, 0);

    assert.equal(editor.getMaskRatio(), 0.5);
  } finally {
    restoreDocument();
  }
});
