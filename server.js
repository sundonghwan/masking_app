import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLogger, createRequestId } from "./src/observability/logger.js";
import { createApiRouter } from "./src/server/api.js";
import { createHttpError, sendJson } from "./src/server/httpUtils.js";
import { createFileStorage } from "./src/server/storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const PUBLIC_ROOT = __dirname;
const DATA_ROOT = process.env.MASKING_APP_DATA_DIR || path.join(__dirname, "data");

const logger = createLogger({ component: "server" });
const storage = createFileStorage({ rootDir: DATA_ROOT });
const routeApi = createApiRouter({ storage, logger });

const server = createServer(async (request, response) => {
  const startedAt = performance.now();
  const requestId = request.headers["x-request-id"] || createRequestId();
  let statusCode = 200;
  const originalWriteHead = response.writeHead.bind(response);
  response.writeHead = (nextStatusCode, ...args) => {
    statusCode = nextStatusCode;
    return originalWriteHead(nextStatusCode, ...args);
  };

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url, { requestId });
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    statusCode = error.statusCode || 500;
    sendJson(response, statusCode, {
      error: statusCode >= 500 ? "internal_server_error" : "request_error",
      message: error.message,
    });
    logger.error("api.request.failed", {
      request_id: requestId,
      method: request.method,
      path: request.url,
      status: statusCode,
      error,
    });
  } finally {
    logger.info("api.request.completed", {
      request_id: requestId,
      method: request.method,
      path: request.url,
      status: statusCode,
      duration_ms: Math.round(performance.now() - startedAt),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Masking App listening on http://localhost:${PORT}`);
  console.log(`Data root: ${DATA_ROOT}`);
});

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw createHttpError(405, "Only GET and HEAD are supported for static files");
  }

  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = safePublicPath(relative);
  const info = await stat(filePath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });

  if (!info || !info.isFile()) {
    throw createHttpError(404, "File not found");
  }

  response.writeHead(200, {
    "content-type": contentType(filePath),
    "content-length": info.size,
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function safePublicPath(relative) {
  const normalized = path.normalize(relative).replace(/^[/\\]+/, "");
  const fullPath = path.resolve(PUBLIC_ROOT, normalized);
  const fromRoot = path.relative(PUBLIC_ROOT, fullPath);
  if (fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw createHttpError(403, "Invalid static file path");
  }
  return fullPath;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html;charset=utf-8",
    ".css": "text/css;charset=utf-8",
    ".js": "text/javascript;charset=utf-8",
    ".json": "application/json;charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  }[ext] || "application/octet-stream";
}
