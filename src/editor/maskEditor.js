const MASK_COLOR = [229, 72, 77];
const MIN_SCALE = 0.05;
const MAX_SCALE = 12;

export const MASK_EDITOR_DEFAULTS = {
  overlayColor: "#E5484D",
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
  const width = imageData.width;
  const height = imageData.height;
  const startX = Math.floor(start?.x ?? -1);
  const startY = Math.floor(start?.y ?? -1);
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return [];

  const tolerance = Math.max(0, Number(options.tolerance ?? 36));
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
    const index = (y * width + x) * 4;
    if (colorDistance(seed, [data[index], data[index + 1], data[index + 2]]) > tolerance) continue;
    region.push({ x, y });

    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = ny * width + nx;
      if (visited[key]) continue;
      visited[key] = 1;
      queue.push([nx, ny]);
    }
  }

  return region;
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
    this.overlayOpacity = options.overlayOpacity ?? 0.55;
    this.displayMode = "overlay";
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isPointerDown = false;
    this.isPanning = false;
    this.lastPoint = null;
    this.cursorPoint = null;
    this.beforeStroke = null;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 30;
    this.onChange = options.onChange || (() => {});
    this.onViewportChange = options.onViewportChange || (() => {});
    this.onPointerMove = options.onPointerMove || (() => {});

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
    this.tool = tool;
    this.redraw();
  }

  setBrushSize(size) {
    this.brushSize = size;
    this.redraw();
  }

  setOverlayOpacity(opacity) {
    this.overlayOpacity = opacity;
    this.redraw();
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
      const value = data[i + 3] > 0 || data[i] > 0 ? 255 : 0;
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
      const value = data[i + 3] > 0 || data[i] > 0 ? 255 : 0;
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
      if (imageData.data[i + 3] > 0 || imageData.data[i] > 0) masked += 1;
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
      overlayOpacity: this.overlayOpacity,
      displayMode: this.displayMode,
      viewport: this.getViewportState(),
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      maskRatio: this.getMaskRatio(),
    };
  }

  getMaskCanvas() {
    return this.maskCanvas;
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

  magicSelectAt(point, options = {}) {
    if (!this.image || !inBounds(point, this.image)) return 0;
    const source = this.sourceCtx.getImageData(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
    const region = selectConnectedRegionFromImageData(source, point, options);
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
      const active = mask.data[i + 3] > 0 || mask.data[i] > 0;
      if (!active) continue;
      overlay.data[i] = MASK_COLOR[0];
      overlay.data[i + 1] = MASK_COLOR[1];
      overlay.data[i + 2] = MASK_COLOR[2];
      overlay.data[i + 3] = this.displayMode === "mask" ? 255 : Math.round(this.overlayOpacity * 255);
    }

    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = this.maskCanvas.width;
    overlayCanvas.height = this.maskCanvas.height;
    overlayCanvas.getContext("2d").putImageData(overlay, 0, 0);
    ctx.drawImage(overlayCanvas, 0, 0);
  }

  drawCursor() {
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
      this.canvas.setPointerCapture(event.pointerId);
      const point = this.eventToImagePoint(event);
      this.isPointerDown = true;
      this.lastPoint = point;
      this.isPanning = this.tool === "pan" || event.spaceKey;

      if (["brush", "erase"].includes(this.tool)) {
        this.beforeStroke = this.snapshotMask();
        this.redoStack = [];
        this.paintAt(point);
        this.onChange();
      } else if (this.tool === "magic") {
        this.beforeStroke = this.snapshotMask();
        this.redoStack = [];
        const changed = this.magicSelectAt(point);
        if (changed > 0) this.onChange();
        if (changed === 0) this.beforeStroke = null;
        this.endPointer(event);
      }
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.image) return;
      const point = this.eventToImagePoint(event);
      this.cursorPoint = {
        ...point,
        screenX: event.offsetX,
        screenY: event.offsetY,
      };
      this.onPointerMove(inBounds(point, this.image) ? point : null);

      if (this.isPointerDown && this.isPanning) {
        this.offsetX += event.movementX;
        this.offsetY += event.movementY;
        this.redraw();
        this.onViewportChange(this.getViewportState());
        return;
      }

      if (this.isPointerDown && ["brush", "erase"].includes(this.tool)) {
        this.paintLine(this.lastPoint, point);
        this.lastPoint = point;
        this.onChange();
      } else {
        this.redraw();
      }
    });

    this.canvas.addEventListener("pointerup", (event) => this.endPointer(event));
    this.canvas.addEventListener("pointercancel", (event) => this.endPointer(event));
    this.canvas.addEventListener("wheel", (event) => {
      if (!this.image) return;
      event.preventDefault();
      this.zoomBy(event.deltaY < 0 ? 1.08 : 0.92, { x: event.offsetX, y: event.offsetY });
    }, { passive: false });
  }

  endPointer(event) {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    this.isPanning = false;

    if (this.beforeStroke && ["brush", "erase", "magic"].includes(this.tool)) {
      this.undoStack.push(this.beforeStroke);
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      this.beforeStroke = null;
    }

    if (event.pointerId != null) {
      try {
        this.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
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
    this.maskCtx.globalCompositeOperation = this.tool === "erase" ? "destination-out" : "source-over";
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

function colorDistance(left, right) {
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2]),
  );
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
