const DEFAULT_OVERLAY_COLOR = "#E5484D";
const DEFAULT_OVERLAY_RGB = [229, 72, 77];
const MIN_SCALE = 0.05;
const MAX_SCALE = 12;
const TOOL_TOGGLE_DOUBLE_TAP_MS = 320;
const TOOL_TOGGLE_DOUBLE_TAP_RADIUS = 18;
const MAGIC_DEFAULTS = {
  colorTolerance: 42,
  edgeThreshold: 55,
  edgeBandRadius: 2,
  edgeBandColorTolerance: 75,
  maxPixels: 70000,
  smoothIterations: 1,
};
const FOUR_NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const EIGHT_NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export const MASK_EDITOR_DEFAULTS = {
  overlayColor: DEFAULT_OVERLAY_COLOR,
  overlayOpacity: 0.55,
  brushSize: 32,
  minScale: MIN_SCALE,
  maxScale: MAX_SCALE,
};

export function createMaskEditor(options = {}) {
  if (!options.canvas) {
    throw new Error("createMaskEditor requires a visible canvas");
  }
  return new MaskEditor(options.canvas, options);
}

export function normalizeMaskImageData(imageData) {
  for (let i = 0; i < imageData.data.length; i += 4) {
    const active = imageData.data[i] > 127 || imageData.data[i + 1] > 127 || imageData.data[i + 2] > 127;
    imageData.data[i] = 255;
    imageData.data[i + 1] = 255;
    imageData.data[i + 2] = 255;
    imageData.data[i + 3] = active && imageData.data[i + 3] > 0 ? 255 : 0;
  }
  return imageData;
}

export function panDeltaForKey(key, step = 48) {
  const amount = Number.isFinite(Number(step)) ? Math.max(1, Math.abs(Number(step))) : 48;
  if (key === "ArrowLeft") return { dx: amount, dy: 0 };
  if (key === "ArrowRight") return { dx: -amount, dy: 0 };
  if (key === "ArrowUp") return { dx: 0, dy: amount };
  if (key === "ArrowDown") return { dx: 0, dy: -amount };
  return null;
}

export function selectConnectedRegionFromImageData(imageData, start, options = {}) {
  return growRegionFromImageData(imageData, start, {
    colorTolerance: options.tolerance ?? options.colorTolerance ?? 36,
    edgeThreshold: Infinity,
    maxPixels: options.maxPixels ?? 50000,
    useEightNeighbors: false,
    smoothIterations: 0,
  });
}

export function selectEdgeAwareRegionFromImageData(imageData, start, options = {}) {
  const colorTolerance = options.colorTolerance ?? options.tolerance ?? MAGIC_DEFAULTS.colorTolerance;
  const edgeThreshold = options.edgeThreshold ?? MAGIC_DEFAULTS.edgeThreshold;
  const edgeBandRadius = options.edgeBandRadius ?? MAGIC_DEFAULTS.edgeBandRadius;
  const edgeBandColorTolerance = options.edgeBandColorTolerance ?? MAGIC_DEFAULTS.edgeBandColorTolerance;
  const maxPixels = options.maxPixels ?? MAGIC_DEFAULTS.maxPixels;
  const smoothIterations = options.smoothIterations ?? MAGIC_DEFAULTS.smoothIterations;
  const edgeMap = createEdgeMagnitudeMap(imageData);

  return growRegionFromImageData(imageData, start, {
    colorTolerance,
    edgeThreshold,
    edgeBandRadius,
    edgeBandColorTolerance,
    edgeMap,
    maxPixels,
    useEightNeighbors: true,
    smoothIterations,
  });
}

function growRegionFromImageData(imageData, start, options = {}) {
  const width = imageData.width;
  const height = imageData.height;
  const startX = Math.floor(start?.x ?? -1);
  const startY = Math.floor(start?.y ?? -1);
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return [];

  const tolerance = Math.max(0, Number(options.colorTolerance ?? 36));
  const edgeThreshold = Number(options.edgeThreshold ?? Infinity);
  const maxPixels = Math.max(1, Number(options.maxPixels ?? 50000));
  const data = imageData.data;
  const startIndex = (startY * width + startX) * 4;
  const seed = [data[startIndex], data[startIndex + 1], data[startIndex + 2]];
  const visited = new Uint8Array(width * height);
  const queue = [[startX, startY]];
  const region = [];
  let head = 0;
  visited[startY * width + startX] = 1;

  while (head < queue.length && region.length < maxPixels) {
    const [x, y] = queue[head];
    head += 1;
    const pixelKey = y * width + x;
    const index = pixelKey * 4;
    if (colorDistance(seed, [data[index], data[index + 1], data[index + 2]]) > tolerance) continue;
    if (options.edgeMap && options.edgeMap[pixelKey] > edgeThreshold && !(x === startX && y === startY)) continue;
    region.push({ x, y });

    const neighbors = options.useEightNeighbors ? EIGHT_NEIGHBORS : FOUR_NEIGHBORS;
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = ny * width + nx;
      if (visited[key]) continue;
      if (options.edgeMap && Math.max(options.edgeMap[pixelKey], options.edgeMap[key]) > edgeThreshold) continue;
      visited[key] = 1;
      queue.push([nx, ny]);
    }
  }

  const edgeBandRegion = addEdgeBandToRegion(region, {
    data,
    seed,
    edgeMap: options.edgeMap,
    edgeThreshold,
    edgeBandRadius: options.edgeBandRadius,
    edgeBandColorTolerance: options.edgeBandColorTolerance,
    colorTolerance: tolerance,
    width,
    height,
    maxPixels,
  });

  if (options.smoothIterations > 0 && edgeBandRegion.length > 0 && edgeBandRegion.length < maxPixels) {
    return smoothRegion(edgeBandRegion, width, height, options.smoothIterations);
  }
  return edgeBandRegion;
}

export class MaskEditor {
  constructor(canvas, options = {}) {
    if (!canvas) {
      throw new Error("MaskEditor requires a visible canvas");
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.image = null;
    this.imageUrl = null;
    this.maskCanvas = document.createElement("canvas");
    this.maskCtx = this.maskCanvas.getContext("2d", { willReadFrequently: true });
    this.sourceCanvas = document.createElement("canvas");
    this.sourceCtx = this.sourceCanvas.getContext("2d", { willReadFrequently: true });
    this.tool = "brush";
    this.brushSize = options.brushSize || 32;
    this.magicOptions = { ...MAGIC_DEFAULTS, ...(options.magicOptions || {}) };
    this.overlayColor = normalizeOverlayColor(options.overlayColor);
    this.overlayRgb = overlayColorToRgb(this.overlayColor);
    this.overlayOpacity = options.overlayOpacity ?? 0.55;
    this.displayMode = "overlay";
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isPointerDown = false;
    this.isPanning = false;
    this.spacePanHeld = false;
    this.activePointerMode = "idle";
    this.activePointers = new Map();
    this.touchGesture = null;
    this.activeStrokeTool = null;
    this.activePointerStart = null;
    this.activePointerMoved = false;
    this.activePointerEventType = "";
    this.lastToolToggleTap = null;
    this.deferStrokeStart = false;
    this.lastPoint = null;
    this.cursorPoint = null;
    this.beforeStroke = null;
    this.maskMoveStartPoint = null;
    this.maskMoveSource = null;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 30;
    this.onChange = options.onChange || (() => {});
    this.onViewportChange = options.onViewportChange || (() => {});
    this.onPointerMove = options.onPointerMove || (() => {});
    this.onToolChange = options.onToolChange || (() => {});

    this.bindCanvasEvents();
    this.redraw();
  }

  async loadImage(url, maskDataUrl = null) {
    this.imageUrl = url;
    this.image = await loadImage(url);
    this.maskCanvas.width = this.image.naturalWidth;
    this.maskCanvas.height = this.image.naturalHeight;
    this.sourceCanvas.width = this.image.naturalWidth;
    this.sourceCanvas.height = this.image.naturalHeight;
    this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.sourceCtx.clearRect(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
    this.sourceCtx.drawImage(this.image, 0, 0);

    if (maskDataUrl) {
      const mask = await loadImage(maskDataUrl);
      this.maskCtx.drawImage(mask, 0, 0, this.maskCanvas.width, this.maskCanvas.height);
      this.normalizeMask();
    }

    this.undoStack = [];
    this.redoStack = [];
    this.fitToCanvas();
  }

  clear() {
    this.image = null;
    this.imageUrl = null;
    this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.sourceCtx.clearRect(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
    this.undoStack = [];
    this.redoStack = [];
    this.redraw();
  }

  setTool(tool) {
    const changed = this.tool !== tool;
    this.tool = tool;
    this.updateCanvasCursor();
    this.redraw();
    if (changed) this.onToolChange(tool);
  }

  setBrushSize(size) {
    this.brushSize = size;
    this.redraw();
  }

  setOverlayOpacity(opacity) {
    this.overlayOpacity = opacity;
    this.redraw();
  }

  setOverlayColor(color) {
    this.overlayColor = normalizeOverlayColor(color);
    this.overlayRgb = overlayColorToRgb(this.overlayColor);
    this.redraw();
  }

  setMagicOptions(options = {}) {
    this.magicOptions = {
      ...this.magicOptions,
      ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined && value !== null)),
    };
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    this.redraw();
  }

  fitToCanvas() {
    if (!this.image) {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.redraw();
      return;
    }

    const pad = 36;
    const scaleX = (this.canvas.width - pad * 2) / this.image.naturalWidth;
    const scaleY = (this.canvas.height - pad * 2) / this.image.naturalHeight;
    this.scale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, MAX_SCALE);
    this.offsetX = (this.canvas.width - this.image.naturalWidth * this.scale) / 2;
    this.offsetY = (this.canvas.height - this.image.naturalHeight * this.scale) / 2;
    this.redraw();
    this.onViewportChange(this.getViewportState());
  }

  zoomBy(factor, origin = null) {
    if (!this.image) return;
    const before = origin ? this.screenToImage(origin.x, origin.y) : null;
    this.scale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);

    if (before && Number.isFinite(before.x) && Number.isFinite(before.y)) {
      this.offsetX = origin.x - before.x * this.scale;
      this.offsetY = origin.y - before.y * this.scale;
    }

    this.redraw();
    this.onViewportChange(this.getViewportState());
  }

  undo() {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;
    this.redoStack.push(this.snapshotMask());
    this.restoreMask(snapshot);
    this.redraw();
  }

  redo() {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return;
    this.undoStack.push(this.snapshotMask());
    this.restoreMask(snapshot);
    this.redraw();
  }

  async exportMaskPngBlob() {
    return this.exportMaskBlob();
  }

  async exportMaskBlob() {
    const out = document.createElement("canvas");
    out.width = this.maskCanvas.width;
    out.height = this.maskCanvas.height;
    const outCtx = out.getContext("2d");
    const source = this.maskCtx.getImageData(0, 0, out.width, out.height);
    const data = source.data;

    for (let i = 0; i < data.length; i += 4) {
      const value = maskPixelActive(data, i) ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }

    outCtx.putImageData(source, 0, 0);
    return new Promise((resolve) => out.toBlob(resolve, "image/png"));
  }

  createGrayscaleExportCanvas() {
    const out = document.createElement("canvas");
    out.width = this.maskCanvas.width;
    out.height = this.maskCanvas.height;
    const outCtx = out.getContext("2d");
    const source = this.maskCtx.getImageData(0, 0, out.width, out.height);
    const data = source.data;

    for (let i = 0; i < data.length; i += 4) {
      const value = maskPixelActive(data, i) ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }

    outCtx.putImageData(source, 0, 0);
    return out;
  }

  getMaskRatio() {
    if (!this.image || this.maskCanvas.width === 0 || this.maskCanvas.height === 0) return 0;
    const imageData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    let masked = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (maskPixelActive(imageData.data, i)) masked += 1;
    }
    return masked / (this.maskCanvas.width * this.maskCanvas.height);
  }

  getViewportState() {
    return {
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    };
  }

  getState() {
    return {
      tool: this.tool,
      brushSize: this.brushSize,
      overlayColor: this.overlayColor,
      overlayOpacity: this.overlayOpacity,
      displayMode: this.displayMode,
      viewport: this.getViewportState(),
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      maskRatio: this.getMaskRatio(),
      cameraPanOverride: this.spacePanHeld,
      activePointerMode: this.activePointerMode,
    };
  }

  getMaskCanvas() {
    return this.maskCanvas;
  }

  replaceMaskFromImageData(imageData, options = {}) {
    if (!this.image) throw new Error("Cannot replace mask before an image is loaded");
    if (imageData.width !== this.maskCanvas.width || imageData.height !== this.maskCanvas.height) {
      throw new Error("Mask dimensions must match current image");
    }
    const before = this.snapshotMask();
    this.maskCtx.putImageData(normalizeMaskImageData(imageData), 0, 0);
    if (options.recordHistory !== false && before) {
      this.undoStack.push(before);
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      this.redoStack = [];
    }
    this.redraw();
    return true;
  }

  async replaceMaskFromDataUrl(maskDataUrl, options = {}) {
    if (!this.image) throw new Error("Cannot replace mask before an image is loaded");
    const mask = await loadImage(maskDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = this.maskCanvas.width;
    canvas.height = this.maskCanvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
    return this.replaceMaskFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), options);
  }

  translateMaskBy(deltaX, deltaY, options = {}) {
    if (!this.image) return false;
    const dx = Math.round(deltaX);
    const dy = Math.round(deltaY);
    if (dx === 0 && dy === 0) return false;
    const source = options.source || this.snapshotMask();
    const translated = translateMaskImageData(source, dx, dy);
    if (options.recordHistory !== false) {
      const before = this.snapshotMask();
      if (before) {
        this.undoStack.push(before);
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
        this.redoStack = [];
      }
    }
    this.maskCtx.putImageData(translated, 0, 0);
    this.redraw();
    return true;
  }

  markSaved() {
    this.redoStack = [];
  }

  canvasToImage(point) {
    return this.screenToImage(point.x, point.y);
  }

  imageToCanvas(point) {
    return {
      x: point.x * this.scale + this.offsetX,
      y: point.y * this.scale + this.offsetY,
    };
  }

  setViewport(viewport) {
    this.scale = clamp(viewport.scale ?? this.scale, MIN_SCALE, MAX_SCALE);
    this.offsetX = viewport.offsetX ?? this.offsetX;
    this.offsetY = viewport.offsetY ?? this.offsetY;
    this.redraw();
    this.onViewportChange(this.getViewportState());
  }

  zoomAtCanvasPoint(canvasPoint, factor) {
    this.zoomBy(factor, { x: canvasPoint.x, y: canvasPoint.y });
  }

  panBy(deltaX, deltaY) {
    this.offsetX += deltaX;
    this.offsetY += deltaY;
    this.redraw();
    this.onViewportChange(this.getViewportState());
  }

  setCameraPanOverride(active) {
    this.spacePanHeld = Boolean(active);
    this.updateCanvasCursor();
    this.redraw();
  }

  isCameraPanActive() {
    return this.spacePanHeld || this.activePointerMode === "camera_pan";
  }

  clearCameraPanOverride() {
    this.spacePanHeld = false;
    if (this.activePointerMode === "camera_pan") {
      this.endCameraPan();
      this.isPointerDown = false;
    }
    this.updateCanvasCursor();
    this.redraw();
  }

  magicSelectAt(point, options = {}) {
    if (!this.image || !inBounds(point, this.image)) return 0;
    const source = this.sourceCtx.getImageData(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
    const region = selectEdgeAwareRegionFromImageData(source, point, {
      ...this.magicOptions,
      ...options,
    });
    if (region.length === 0) return 0;

    const mask = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    for (const pixel of region) {
      const index = (pixel.y * mask.width + pixel.x) * 4;
      mask.data[index] = 255;
      mask.data[index + 1] = 255;
      mask.data[index + 2] = 255;
      mask.data[index + 3] = 255;
    }
    this.maskCtx.putImageData(mask, 0, 0);
    this.redraw();
    return region.length;
  }

  setOverlay(options = {}) {
    if (options.opacity != null) this.setOverlayOpacity(options.opacity);
  }

  render() {
    this.redraw();
  }

  beginStroke(point, options = {}) {
    if (options.tool) this.setTool(options.tool);
    this.beforeStroke = this.snapshotMask();
    this.lastPoint = point;
    this.paintAt(point);
  }

  addStrokePoint(point) {
    this.paintLine(this.lastPoint, point);
    this.lastPoint = point;
  }

  endStroke() {
    if (this.beforeStroke) {
      this.undoStack.push(this.beforeStroke);
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      this.beforeStroke = null;
      this.redoStack = [];
    }
  }

  cancelStroke() {
    if (this.beforeStroke) {
      this.restoreMask(this.beforeStroke);
      this.beforeStroke = null;
      this.redraw();
    }
  }

  redraw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#E9EDF1";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.image) return;

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    if (this.displayMode !== "mask") {
      ctx.drawImage(this.image, 0, 0);
    } else {
      ctx.fillStyle = "#101820";
      ctx.fillRect(0, 0, this.image.naturalWidth, this.image.naturalHeight);
    }

    if (this.displayMode !== "original") {
      this.drawMaskOverlay(ctx);
    }

    ctx.restore();
    this.drawCursor();
  }

  drawMaskOverlay(ctx) {
    const mask = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    const overlay = new ImageData(this.maskCanvas.width, this.maskCanvas.height);

    for (let i = 0; i < mask.data.length; i += 4) {
      const active = maskPixelActive(mask.data, i);
      if (!active) continue;
      overlay.data[i] = this.overlayRgb[0];
      overlay.data[i + 1] = this.overlayRgb[1];
      overlay.data[i + 2] = this.overlayRgb[2];
      overlay.data[i + 3] = this.displayMode === "mask" ? 255 : Math.round(this.overlayOpacity * 255);
    }

    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = this.maskCanvas.width;
    overlayCanvas.height = this.maskCanvas.height;
    overlayCanvas.getContext("2d").putImageData(overlay, 0, 0);
    ctx.drawImage(overlayCanvas, 0, 0);
  }

  drawCursor() {
    this.updateCanvasCursor();
    if (!this.cursorPoint || !this.image || !["brush", "erase"].includes(this.tool)) return;
    const ctx = this.ctx;
    const radius = (this.brushSize * this.scale) / 2;
    ctx.save();
    ctx.strokeStyle = this.tool === "erase" ? "#FFFFFF" : "#111827";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(this.cursorPoint.screenX, this.cursorPoint.screenY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  bindCanvasEvents() {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.image) return;
      const rightClickPan = mouseRequestsCameraPan(event);
      if (rightClickPan) preventEventDefault(event);
      this.canvas.setPointerCapture(event.pointerId);
      this.activePointers.set(event.pointerId, eventCanvasPoint(event));
      if (this.activePointers.size >= 2) {
        this.beginTouchGesture();
        return;
      }

      if (this.shouldToggleToolFromTap(event)) {
        this.toggleBrushEraseTool();
        this.lastToolToggleTap = null;
        this.activePointers.delete(event.pointerId);
        this.releasePointer(event);
        return;
      }

      const point = this.eventToImagePoint(event);
      this.isPointerDown = true;
      this.lastPoint = point;
      this.activePointerStart = eventCanvasPoint(event);
      this.activePointerMoved = false;
      this.activePointerEventType = event.pointerType || "";
      this.activePointerMode = "idle";
      this.activeStrokeTool = stylusRequestsEraser(event) ? "erase" : this.tool;

      if (rightClickPan || this.spacePanHeld || this.activeStrokeTool === "pan") {
        this.beginCameraPan(event);
        return;
      }

      if (this.activeStrokeTool === "mask_move") {
        this.beginMaskMove(point);
        return;
      }

      if (["brush", "erase"].includes(this.activeStrokeTool)) {
        this.activePointerMode = this.activeStrokeTool === "erase" ? "erase" : "paint";
        this.beforeStroke = this.snapshotMask();
        this.redoStack = [];
        this.deferStrokeStart = pointerStartsDeferredPaint(event);
        if (!this.deferStrokeStart) {
          this.paintAt(point);
          this.onChange();
        }
      } else if (this.activeStrokeTool === "magic") {
        this.beforeStroke = this.snapshotMask();
        this.redoStack = [];
        if (pointerStartsDeferredPaint(event)) {
          this.activePointerMode = "magic_pending";
          this.redraw();
          return;
        }
        this.activePointerMode = "magic";
        const changed = this.magicSelectAt(point);
        if (changed > 0) this.onChange();
        if (changed === 0) this.beforeStroke = null;
        this.endPointer(event);
      }
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.image) return;
      if (this.activePointers.has(event.pointerId)) {
        this.activePointers.set(event.pointerId, eventCanvasPoint(event));
      }
      if (this.activePointerMode === "touch_gesture") {
        this.updateTouchGesture();
        return;
      }

      const point = this.eventToImagePoint(event);
      if (this.activePointerStart) {
        const current = eventCanvasPoint(event);
        const distance = Math.hypot(current.x - this.activePointerStart.x, current.y - this.activePointerStart.y);
        if (distance > TOOL_TOGGLE_DOUBLE_TAP_RADIUS) this.activePointerMoved = true;
      }
      this.cursorPoint = {
        ...point,
        screenX: event.offsetX,
        screenY: event.offsetY,
      };
      this.onPointerMove(inBounds(point, this.image) ? point : null);

      if (this.isPointerDown && this.activePointerMode === "camera_pan") {
        this.updateCameraPan(event);
        return;
      }

      if (this.isPointerDown && this.activePointerMode === "mask_move") {
        this.updateMaskMove(point);
        return;
      }

      if (this.isPointerDown && this.activePointerMode === "magic_pending") {
        this.lastPoint = point;
        this.redraw();
        return;
      }

      if (this.isPointerDown && ["paint", "erase"].includes(this.activePointerMode)) {
        if (this.deferStrokeStart) {
          this.paintAt(this.lastPoint);
          this.deferStrokeStart = false;
        }
        this.paintLine(this.lastPoint, point);
        this.lastPoint = point;
        this.onChange();
      } else {
        this.redraw();
      }
    });

    this.canvas.addEventListener("pointerup", (event) => this.endPointer(event));
    this.canvas.addEventListener("pointercancel", (event) => this.endPointer(event));
    this.canvas.addEventListener("contextmenu", (event) => {
      preventEventDefault(event);
    });
    this.canvas.addEventListener("wheel", (event) => {
      if (!this.image) return;
      event.preventDefault();
      this.zoomBy(event.deltaY < 0 ? 1.08 : 0.92, { x: event.offsetX, y: event.offsetY });
    }, { passive: false });
  }

  beginTouchGesture() {
    if (this.beforeStroke && ["paint", "erase", "magic", "mask_move"].includes(this.activePointerMode) && !this.deferStrokeStart) {
      this.undoStack.push(this.beforeStroke);
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      this.maskMoveStartPoint = null;
      this.maskMoveSource = null;
    }
    this.beforeStroke = null;
    this.isPointerDown = false;
    this.isPanning = true;
    this.activeStrokeTool = null;
    this.deferStrokeStart = false;
    this.activePointerMode = "touch_gesture";
    this.touchGesture = {
      ...touchGestureFromPointers(this.activePointers),
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    };
    this.updateCanvasCursor();
  }

  updateTouchGesture() {
    if (!this.touchGesture || this.activePointers.size < 2) return;
    const current = touchGestureFromPointers(this.activePointers);
    const factor = current.distance > 0 && this.touchGesture.distance > 0
      ? current.distance / this.touchGesture.distance
      : 1;
    const nextScale = clamp(this.touchGesture.scale * factor, MIN_SCALE, MAX_SCALE);
    const imageAtStartCenter = {
      x: (this.touchGesture.center.x - this.touchGesture.offsetX) / this.touchGesture.scale,
      y: (this.touchGesture.center.y - this.touchGesture.offsetY) / this.touchGesture.scale,
    };
    this.scale = nextScale;
    this.offsetX = current.center.x - imageAtStartCenter.x * this.scale;
    this.offsetY = current.center.y - imageAtStartCenter.y * this.scale;
    this.redraw();
    this.onViewportChange(this.getViewportState());
  }

  endTouchGesture() {
    this.isPanning = false;
    this.touchGesture = null;
    if (this.activePointerMode === "touch_gesture") {
      this.activePointerMode = "idle";
    }
    this.updateCanvasCursor();
    this.redraw();
  }

  beginCameraPan(event) {
    this.activePointerMode = "camera_pan";
    this.isPanning = true;
    this.lastPoint = { x: event.offsetX, y: event.offsetY };
    this.updateCanvasCursor();
    this.redraw();
  }

  updateCameraPan(event) {
    const movementX = Number.isFinite(event.movementX) ? event.movementX : 0;
    const movementY = Number.isFinite(event.movementY) ? event.movementY : 0;
    this.panBy(movementX, movementY);
  }

  endCameraPan() {
    this.isPanning = false;
    if (this.activePointerMode === "camera_pan") {
      this.activePointerMode = "idle";
    }
    this.updateCanvasCursor();
  }

  beginMaskMove(point) {
    this.activePointerMode = "mask_move";
    this.maskMoveStartPoint = point;
    this.maskMoveSource = this.snapshotMask();
    this.beforeStroke = this.maskMoveSource;
    this.redoStack = [];
    this.updateCanvasCursor();
    this.redraw();
  }

  updateMaskMove(point) {
    if (!this.maskMoveStartPoint || !this.maskMoveSource) return;
    const dx = point.x - this.maskMoveStartPoint.x;
    const dy = point.y - this.maskMoveStartPoint.y;
    const changed = this.translateMaskBy(dx, dy, {
      source: this.maskMoveSource,
      recordHistory: false,
    });
    if (changed) this.onChange();
  }

  endPointer(event) {
    this.activePointers.delete(event.pointerId);
    if (this.activePointerMode === "touch_gesture") {
      if (this.activePointers.size < 2) this.endTouchGesture();
      this.releasePointer(event);
      return;
    }

    if (!this.isPointerDown) return;
    const finishedPointerMode = this.activePointerMode;
    if (finishedPointerMode === "magic_pending") {
      const changed = this.magicSelectAt(this.lastPoint);
      if (changed > 0) {
        this.onChange();
        this.undoStack.push(this.beforeStroke);
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      }
      this.beforeStroke = null;
      this.isPointerDown = false;
      this.isPanning = false;
      this.activePointerMode = "idle";
      this.activeStrokeTool = null;
      this.activePointerStart = null;
      this.activePointerMoved = false;
      this.activePointerEventType = "";
      this.updateCanvasCursor();
      this.releasePointer(event);
      return;
    }

    this.isPointerDown = false;
    if (finishedPointerMode === "camera_pan") {
      this.endCameraPan();
    } else {
      this.isPanning = false;
      this.activePointerMode = "idle";
      this.updateCanvasCursor();
    }

    if (this.beforeStroke && ["paint", "erase", "magic", "mask_move"].includes(finishedPointerMode) && !this.deferStrokeStart) {
      this.undoStack.push(this.beforeStroke);
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      this.beforeStroke = null;
    }
    if (this.deferStrokeStart) this.beforeStroke = null;
    if (this.shouldRecordToolToggleTap(event, finishedPointerMode)) {
      this.lastToolToggleTap = {
        ...eventCanvasPoint(event),
        timeStamp: eventTimeStamp(event),
      };
    } else if (finishedPointerMode !== "touch_gesture") {
      this.lastToolToggleTap = null;
    }
    this.maskMoveStartPoint = null;
    this.maskMoveSource = null;
    this.activeStrokeTool = null;
    this.activePointerStart = null;
    this.activePointerMoved = false;
    this.activePointerEventType = "";
    this.deferStrokeStart = false;

    this.releasePointer(event);
  }

  shouldToggleToolFromTap(event) {
    if (!isStylusLikePointer(event) || !["brush", "erase"].includes(this.tool)) return false;
    if (!this.lastToolToggleTap) return false;
    const current = eventCanvasPoint(event);
    const elapsed = eventTimeStamp(event) - this.lastToolToggleTap.timeStamp;
    const distance = Math.hypot(current.x - this.lastToolToggleTap.x, current.y - this.lastToolToggleTap.y);
    return elapsed >= 0 && elapsed <= TOOL_TOGGLE_DOUBLE_TAP_MS && distance <= TOOL_TOGGLE_DOUBLE_TAP_RADIUS;
  }

  shouldRecordToolToggleTap(event, finishedPointerMode) {
    return isStylusLikePointer({ pointerType: this.activePointerEventType || event.pointerType })
      && ["paint", "erase"].includes(finishedPointerMode)
      && this.deferStrokeStart
      && !this.activePointerMoved;
  }

  toggleBrushEraseTool() {
    this.setTool(this.tool === "erase" ? "brush" : "erase");
  }

  releasePointer(event) {
    if (event.pointerId == null) return;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }

  eventToImagePoint(event) {
    return this.screenToImage(event.offsetX, event.offsetY);
  }

  screenToImage(x, y) {
    return {
      x: (x - this.offsetX) / this.scale,
      y: (y - this.offsetY) / this.scale,
    };
  }

  paintLine(from, to) {
    if (!from || !to) return;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, this.brushSize / 4)));

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.paintAt({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  }

  paintAt(point) {
    if (!inBounds(point, this.image)) return;
    const radius = this.brushSize / 2;
    this.maskCtx.save();
    const paintTool = this.activeStrokeTool || this.tool;
    this.maskCtx.globalCompositeOperation = paintTool === "erase" ? "destination-out" : "source-over";
    this.maskCtx.fillStyle = "rgba(255,255,255,1)";
    this.maskCtx.beginPath();
    this.maskCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.maskCtx.fill();
    this.maskCtx.restore();
    this.redraw();
  }

  snapshotMask() {
    if (!this.image) return null;
    return this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
  }

  restoreMask(snapshot) {
    if (!snapshot) return;
    this.maskCanvas.width = snapshot.width;
    this.maskCanvas.height = snapshot.height;
    this.maskCtx.putImageData(snapshot, 0, 0);
  }

  normalizeMask() {
    const imageData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.maskCtx.putImageData(normalizeMaskImageData(imageData), 0, 0);
  }

  updateCanvasCursor() {
    if (!this.canvas?.style) return;
    if (this.activePointerMode === "camera_pan") {
      this.canvas.style.cursor = "grabbing";
    } else if (this.activePointerMode === "touch_gesture") {
      this.canvas.style.cursor = "grabbing";
    } else if (this.activePointerMode === "mask_move") {
      this.canvas.style.cursor = "grabbing";
    } else if (this.spacePanHeld || this.tool === "pan") {
      this.canvas.style.cursor = "grab";
    } else if (this.tool === "mask_move") {
      this.canvas.style.cursor = "move";
    } else if (["brush", "erase"].includes(this.tool)) {
      this.canvas.style.cursor = "crosshair";
    } else {
      this.canvas.style.cursor = "default";
    }
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function eventCanvasPoint(event) {
  return {
    x: Number(event.offsetX || 0),
    y: Number(event.offsetY || 0),
  };
}

function touchGestureFromPointers(pointers) {
  const [first, second] = [...pointers.values()];
  const center = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
  return {
    center,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

function stylusRequestsEraser(event) {
  if (event.pointerType !== "pen") return false;
  return event.button === 5 || event.button === 2 || Boolean((event.buttons || 0) & 32) || Boolean((event.buttons || 0) & 2);
}

function mouseRequestsCameraPan(event) {
  return event.pointerType === "mouse" && (event.button === 2 || Boolean((event.buttons || 0) & 2));
}

function preventEventDefault(event) {
  if (typeof event.preventDefault === "function") event.preventDefault();
}

function pointerStartsDeferredPaint(event) {
  if (stylusRequestsEraser(event)) return false;
  return isStylusLikePointer(event);
}

function isStylusLikePointer(event) {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

function eventTimeStamp(event) {
  return Number.isFinite(event.timeStamp) ? Number(event.timeStamp) : Date.now();
}

function maskPixelActive(data, index) {
  return data[index + 3] > 0;
}

function translateMaskImageData(source, deltaX, deltaY) {
  const output = new ImageData(source.width, source.height);
  for (let y = 0; y < source.height; y += 1) {
    const targetY = y + deltaY;
    if (targetY < 0 || targetY >= source.height) continue;
    for (let x = 0; x < source.width; x += 1) {
      const targetX = x + deltaX;
      if (targetX < 0 || targetX >= source.width) continue;
      const sourceIndex = (y * source.width + x) * 4;
      const targetIndex = (targetY * source.width + targetX) * 4;
      output.data[targetIndex] = source.data[sourceIndex];
      output.data[targetIndex + 1] = source.data[sourceIndex + 1];
      output.data[targetIndex + 2] = source.data[sourceIndex + 2];
      output.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }
  return normalizeMaskImageData(output);
}

function createEdgeMagnitudeMap(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const gray = createBlurredGrayscale(imageData);
  const edges = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const topLeft = sampleGray(gray, width, height, x - 1, y - 1);
      const top = sampleGray(gray, width, height, x, y - 1);
      const topRight = sampleGray(gray, width, height, x + 1, y - 1);
      const left = sampleGray(gray, width, height, x - 1, y);
      const right = sampleGray(gray, width, height, x + 1, y);
      const bottomLeft = sampleGray(gray, width, height, x - 1, y + 1);
      const bottom = sampleGray(gray, width, height, x, y + 1);
      const bottomRight = sampleGray(gray, width, height, x + 1, y + 1);
      const gx = -topLeft + topRight - (2 * left) + (2 * right) - bottomLeft + bottomRight;
      const gy = -topLeft - (2 * top) - topRight + bottomLeft + (2 * bottom) + bottomRight;
      edges[y * width + x] = Math.hypot(gx, gy);
    }
  }

  return edges;
}

function sampleGray(gray, width, height, x, y) {
  const safeX = clamp(x, 0, width - 1);
  const safeY = clamp(y, 0, height - 1);
  return gray[safeY * width + safeX];
}

function createBlurredGrayscale(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const raw = new Float32Array(width * height);
  const blurred = new Float32Array(width * height);

  for (let i = 0; i < raw.length; i += 1) {
    const sourceIndex = i * 4;
    raw[i] = (0.299 * imageData.data[sourceIndex]) +
      (0.587 * imageData.data[sourceIndex + 1]) +
      (0.114 * imageData.data[sourceIndex + 2]);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          total += raw[ny * width + nx];
          count += 1;
        }
      }
      blurred[y * width + x] = total / count;
    }
  }

  return blurred;
}

function addEdgeBandToRegion(region, options = {}) {
  if (!options.edgeMap || region.length === 0) return region;
  const width = Number(options.width || 0);
  const height = Number(options.height || 0);
  const edgeThreshold = Number(options.edgeThreshold ?? Infinity);
  const edgeBandRadius = Math.max(0, Math.floor(Number(options.edgeBandRadius || 0)));
  const maxPixels = Math.max(1, Number(options.maxPixels ?? region.length));
  const data = options.data;
  const seed = options.seed;
  const edgeBandColorTolerance = Math.max(
    Number(options.colorTolerance || 0),
    Number(options.edgeBandColorTolerance ?? MAGIC_DEFAULTS.edgeBandColorTolerance),
  );
  if (!width || !height || !data || !seed || !Number.isFinite(edgeThreshold) || edgeBandRadius <= 0 || region.length >= maxPixels) {
    return region;
  }

  const selected = new Uint8Array(width * height);
  const expanded = [...region];
  for (const pixel of region) {
    selected[pixel.y * width + pixel.x] = 1;
  }

  for (const pixel of region) {
    for (let dy = -edgeBandRadius; dy <= edgeBandRadius; dy += 1) {
      for (let dx = -edgeBandRadius; dx <= edgeBandRadius; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = pixel.x + dx;
        const y = pixel.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const key = y * width + x;
        if (selected[key]) continue;
        if (!hasNearbyStrongEdge(options.edgeMap, width, height, x, y, edgeThreshold)) continue;
        const sourceIndex = key * 4;
        const candidate = [data[sourceIndex], data[sourceIndex + 1], data[sourceIndex + 2]];
        if (colorDistance(seed, candidate) > edgeBandColorTolerance) continue;
        selected[key] = 1;
        expanded.push({ x, y });
        if (expanded.length >= maxPixels) return expanded;
      }
    }
  }

  return expanded;
}

function hasNearbyStrongEdge(edgeMap, width, height, x, y, edgeThreshold) {
  for (const [dx, dy] of EIGHT_NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (edgeMap[ny * width + nx] > edgeThreshold) return true;
  }
  return edgeMap[y * width + x] > edgeThreshold;
}

function smoothRegion(region, width, height, iterations) {
  let mask = new Uint8Array(width * height);
  for (const pixel of region) {
    mask[pixel.y * width + pixel.x] = 1;
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Uint8Array(mask);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const key = y * width + x;
        const activeNeighbors = countActiveNeighbors(mask, width, x, y);
        if (!mask[key] && activeNeighbors >= 5) next[key] = 1;
        if (mask[key] && activeNeighbors <= 1) next[key] = 0;
      }
    }
    mask = next;
  }

  const smoothed = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) smoothed.push({ x, y });
    }
  }
  return smoothed;
}

function countActiveNeighbors(mask, width, x, y) {
  let count = 0;
  for (const [dx, dy] of EIGHT_NEIGHBORS) {
    count += mask[(y + dy) * width + x + dx];
  }
  return count;
}

function colorDistance(left, right) {
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2]),
  );
}

function normalizeOverlayColor(color) {
  const value = String(color || DEFAULT_OVERLAY_COLOR).trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return DEFAULT_OVERLAY_COLOR;
  return value.toUpperCase();
}

function overlayColorToRgb(color) {
  const normalized = normalizeOverlayColor(color);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  if (![red, green, blue].every(Number.isFinite)) return DEFAULT_OVERLAY_RGB;
  return [red, green, blue];
}

function inBounds(point, image) {
  return Boolean(
    image &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= image.naturalWidth &&
    point.y <= image.naturalHeight,
  );
}
