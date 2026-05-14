import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLogger, createRequestId, defaultSink } from "./src/observability/logger.js";
import { createJsonlFileSink } from "./src/observability/runtimeLogSink.js";
import { createApiRouter } from "./src/server/api.js";
import { createAuditStore } from "./src/server/auditStore.js";
import { resolveDeploymentProfile } from "./src/server/deploymentProfile.js";
import { applyHttpSecurityHeaders, createHttpSecurityPolicy, handleCorsPreflight } from "./src/server/httpSecurity.js";
import { createHttpError, sendJson } from "./src/server/httpUtils.js";
import { assertProductionStartupSafety } from "./src/server/productionSafety.js";
import { createSessionStore } from "./src/server/sessionStore.js";
import { createMetadataDbConfig, createMetadataDbPool, runMetadataMigrations } from "./src/server/metadataDb.js";
import { createFileStorage } from "./src/server/storage.js";
import { createObjectStorageClient, createObjectStorageConfig, ensureObjectBucket } from "./src/server/objectStorage.js";
import { createObjectDbStorage } from "./src/server/objectDbStorage.js";
import { createUserDirectory } from "./src/server/userDirectory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deploymentProfile = resolveDeploymentProfile(process.env, { cwd: __dirname });
const PORT = deploymentProfile.port;
const HOST = deploymentProfile.host === "localhost" ? undefined : deploymentProfile.host;
const PUBLIC_ROOT = deploymentProfile.publicRoot;
const DATA_ROOT = deploymentProfile.dataRoot;

const logger = createLogger({
  component: "server",
  sink: process.env.MASKING_APP_LOG_FILE
    ? createJsonlFileSink({ logFile: process.env.MASKING_APP_LOG_FILE, mirrorSink: defaultSink })
    : defaultSink,
});
const storage = await createRuntimeStorage(deploymentProfile);
const userDirectory = createUserDirectory({ rootDir: DATA_ROOT });
const sessionStore = createSessionStore({ rootDir: DATA_ROOT });
const auditStore = createAuditStore({ rootDir: DATA_ROOT });
const routeApi = createApiRouter({ storage, logger, userDirectory, sessionStore, auditStore, deploymentProfile });
const httpSecurityPolicy = createHttpSecurityPolicy(process.env);

await assertProductionStartupSafety({
  profile: deploymentProfile,
  cwd: __dirname,
  env: process.env,
});

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
    applyHttpSecurityHeaders(response, request, httpSecurityPolicy);
    if (handleCorsPreflight(request, response, httpSecurityPolicy)) return;

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

const listenArgs = HOST ? [PORT, HOST] : [PORT];
server.listen(...listenArgs, () => {
  console.log(`Masking App listening on http://localhost:${PORT}`);
  console.log(`Data root: ${DATA_ROOT}`);
  console.log(`Deployment mode: ${deploymentProfile.mode}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(async () => {
      if (typeof storage.close === "function") {
        await storage.close();
      }
      process.exit(0);
    });
  });
}

async function createRuntimeStorage(profile) {
  if (profile.storage?.backend !== "object-db") {
    return createFileStorage({ rootDir: DATA_ROOT });
  }
  const dbConfig = createMetadataDbConfig({ databaseUrl: profile.storage.databaseUrl });
  const pool = createMetadataDbPool(dbConfig);
  await runMetadataMigrations(pool);
  const objectConfig = createObjectStorageConfig({
    objectEndpoint: profile.storage.objectEndpoint,
    objectRegion: profile.storage.objectRegion,
    objectBucket: profile.storage.objectBucket,
    objectAccessKey: profile.storage.objectAccessKey,
    objectSecretKey: profile.storage.objectSecretKey,
  });
  const objectClient = createObjectStorageClient(objectConfig);
  await ensureObjectBucket(objectClient, objectConfig.bucket, { region: objectConfig.region });
  return createObjectDbStorage({
    pool,
    objectClient,
    bucket: objectConfig.bucket,
  });
}

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw createHttpError(405, "Only GET and HEAD are supported for static files");
  }

  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (isPrivateStaticPath(relative)) {
    throw createHttpError(404, "File not found");
  }
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

function isPrivateStaticPath(relative) {
  const normalized = path.normalize(relative).replace(/^[/\\]+/, "");
  return normalized === "server.js"
    || normalized.startsWith(`src${path.sep}server${path.sep}`)
    || normalized.startsWith(`tests${path.sep}`)
    || normalized.startsWith(`harness${path.sep}`)
    || normalized.startsWith(`docs${path.sep}`);
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
