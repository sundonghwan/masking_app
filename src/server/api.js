import { createZipBlob } from "../export/zip.js";
import { createTrainingSetZipEntries } from "../export/trainingSet.js";
import {
  createAnnotationsJson,
  createExportPaths,
  filterActiveImages,
  createExportSummaryJson,
  createImageRecord,
  createProjectRecord,
  createValidationSummary,
  serializeJson,
} from "../export/exporter.js";
import { createHttpError, methodNotAllowed, notFound, readJsonBody, readRawBody, sendBuffer, sendJson } from "./httpUtils.js";
import { parseImageMetadata, parseImageMetadataFromDataUrl, validateClientDimensions } from "./imageMetadata.js";
import { validateMaskContract } from "./maskValidation.js";
import { applyReviewTransition } from "../review/policy.js";
import { UPLOAD_REASONS, normalizeUploadPolicy, validateImageDataUrlUpload, validateUploadCandidate } from "../upload/policy.js";
import {
  DEFAULT_ACTORS,
  ROLES,
  normalizeActorId,
  normalizeRole,
  publicMvpUser,
  userHasRole,
} from "../config/runtimeDefaults.js";
import { LOCAL_MVP_USER_ACCOUNTS, validateDirectoryCredentials } from "./auth.js";

export function createApiRouter({ storage, logger = null, userDirectory = null, sessionStore = null } = {}) {
  const sessions = new Map();

  return async function routeApi(request, response, url, context = {}) {
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
      return sendJson(response, 200, { ok: true, service: "masking-app-backend" });
    }

    if (url.pathname === "/api/session/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      const account = await validateDirectoryCredentials(userDirectory, {
        user_id: body.user_id || body.userId,
        password: body.password,
      });
      if (!account) {
        return sendJson(response, 401, {
          error: "unauthorized",
          message: "Invalid user ID or password",
        });
      }
      const session = await createSession(account);
      return sendJson(response, 201, { session });
    }

    if (url.pathname === "/api/session/logout" && request.method === "POST") {
      const session = await readSession(request);
      if (session.token) {
        if (sessionStore?.deleteSession) {
          await sessionStore.deleteSession(session.token);
        } else {
          sessions.delete(session.token);
        }
      }
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/session/me" && request.method === "GET") {
      const session = await readSession(request);
      if (!session.authenticated) {
        return sendJson(response, 401, {
          error: "unauthorized",
          message: "A valid session token is required",
        });
      }
      return sendJson(response, 200, { session: publicSession(session) });
    }

    if (url.pathname === "/api/users" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;

      const users = userDirectory?.listUsers
        ? await userDirectory.listUsers({ role: url.searchParams.get("role") || "" })
        : listFallbackUsers(url.searchParams.get("role") || "");
      return sendJson(response, 200, {
        users,
        total_users: users.length,
      });
    }

    if (url.pathname === "/api/training-sets/export" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      return exportTrainingSet(response, body, context);
    }

    if (url.pathname === "/api/projects" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;

      const body = await readJsonBody(request);
      const requestedProjectId = body.project_id || body.id;
      if (!requestedProjectId) {
        return sendJson(response, 400, {
          error: "project_id_required",
          message: "Project ID is required",
        });
      }
      const project = createProjectRecord({
        id: requestedProjectId,
        name: body.name || body.project_name || body.project_id || body.id,
        description: body.description || "",
      });
      const manifest = await storage.ensureProject(project.id, { name: project.name });
      manifest.upload_policy = normalizeUploadPolicy(body.upload_policy || body.uploadPolicy || {}, manifest.upload_policy);
      await storage.writeProjectManifest(project.id, manifest);
      return sendJson(response, 201, { ...manifest, ...project, images: manifest.images || [] });
    }

    if (url.pathname === "/api/projects" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;

      const projects = await storage.listProjects();
      return sendJson(response, 200, {
        projects,
        total_projects: projects.length,
      });
    }

    if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
      return routeProject(request, response, parts.slice(2), context, url);
    }

    if (parts[0] === "api" && parts[1] === "images" && parts[2]) {
      return routeImage(request, response, parts.slice(2), context);
    }

    return notFound(response);
  };

  async function routeProject(request, response, parts, context, url) {
    const projectId = parts[0];

    if (parts.length === 1 && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;

      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      return sendJson(response, 200, manifest);
    }

    if (parts[1] === "tasks") {
      return routeProjectTasks(request, response, projectId, parts.slice(2));
    }

    if (parts.length === 2 && parts[1] === "images" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.ADMIN])) return;

      const upload = await readImageUpload(request);
      const existingManifest = await storage.readProjectManifest(projectId);
      if (!existingManifest) {
        logger?.warn("image.upload.project_not_found", {
          request_id: context.requestId,
          project_id: projectId,
        });
        return sendJson(response, 404, {
          error: "project_not_found",
          message: "Project must be created before image upload",
        });
      }
      const uploadPolicy = normalizeUploadPolicy(existingManifest.upload_policy || {});
      const uploadValidation = upload.file
        ? validateUploadCandidate({
            fileName: upload.fileName || `${upload.imageId || "image"}.png`,
            mimeType: upload.mimeType,
            sizeBytes: upload.buffer.length,
          }, uploadPolicy)
        : validateImageDataUrlUpload({
            fileName: upload.fileName || `${upload.imageId || "image"}.png`,
            dataUrl: upload.dataUrl,
          }, uploadPolicy);
      if (!uploadValidation.valid) {
        logger?.warn("image.upload.validation_failed", {
          request_id: context.requestId,
          project_id: projectId,
          reasons: uploadValidation.reasons,
          checks: uploadValidation.checks,
        });
        return sendJson(response, uploadValidationStatusCode(uploadValidation), {
          error: "image_upload_validation_failed",
          message: "Image upload does not satisfy the current upload policy",
          validation: uploadValidation,
        });
      }
      const imageMetadata = upload.file
        ? { ...parseImageMetadata(upload.buffer, upload.mimeType), mimeType: upload.mimeType, sizeBytes: upload.buffer.length }
        : parseImageMetadataFromDataUrl(upload.dataUrl);
      if (!imageMetadata.valid) {
        logger?.warn("image.upload.metadata_failed", {
          request_id: context.requestId,
          project_id: projectId,
          reason: imageMetadata.reason,
        });
        return sendJson(response, 422, {
          error: "image_metadata_validation_failed",
          message: "Uploaded image metadata could not be extracted",
          validation: imageMetadata,
        });
      }
      const dimensionValidation = validateClientDimensions({
        width: upload.width,
        height: upload.height,
      }, imageMetadata);
      if (!dimensionValidation.valid) {
        logger?.warn("image.upload.dimension_mismatch", {
          request_id: context.requestId,
          project_id: projectId,
          client: dimensionValidation.client,
          server: dimensionValidation.server,
        });
        return sendJson(response, 422, {
          error: "image_dimension_mismatch",
          message: "Client image dimensions do not match server-extracted image metadata",
          validation: dimensionValidation,
        });
      }

      const manifest = existingManifest;
      const nextImageId = upload.imageId || `image_${String((manifest.images || []).length + 1).padStart(4, "0")}`;
      const written = upload.file
        ? await storage.writeImageBuffer(projectId, nextImageId, upload.fileName || `${nextImageId}.png`, upload.buffer, { mimeType: upload.mimeType })
        : await storage.writeImageFromDataUrl(projectId, nextImageId, upload.fileName || `${nextImageId}.png`, upload.dataUrl);
      const image = createImageRecord({
        id: nextImageId,
        projectId,
        originalFileName: upload.fileName || `${nextImageId}.png`,
        imagePath: written.relativePath,
        width: imageMetadata.width,
        height: imageMetadata.height,
        status: "not_started",
        workerId: session.userId || DEFAULT_ACTORS.worker,
      });
      manifest.images = [...(manifest.images || []).filter((item) => item.id !== image.id), image];
      manifest.updated_at = new Date().toISOString();
      await storage.writeProjectManifest(projectId, manifest);
      return sendJson(response, 201, image);
    }

    if (parts.length === 2 && parts[1] === "export" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      return exportProject(response, projectId, context, {
        approvedOnly: url.searchParams.get("approved_only") === "1",
      });
    }

    if (parts.length === 2 && parts[1] === "files" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;
      const relativePath = url.searchParams.get("path") || "";
      if (!relativePath) {
        return sendJson(response, 400, {
          error: "file_path_required",
          message: "Project file path is required",
        });
      }
      const buffer = await storage.readProjectFile(projectId, relativePath);
      return sendBuffer(response, 200, buffer, {
        "content-type": fileContentType(relativePath),
      });
    }

    return notFound(response);
  }

  async function routeProjectTasks(request, response, projectId, parts) {
    if (parts.length === 0 && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;

      const tasks = await storage.listProjectTasks(projectId);
      return sendJson(response, 200, {
        tasks,
        total_tasks: tasks.length,
      });
    }

    if (parts.length === 0 && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;

      const body = await readJsonBody(request);
      const taskId = body.task_id || body.taskId || body.id;
      if (!taskId) {
        return sendJson(response, 400, {
          error: "task_id_required",
          message: "Task ID is required",
        });
      }
      const task = await storage.ensureTaskMetadata(projectId, taskId, {
        name: body.name || body.task_name || taskId,
        description: body.description || "",
        createdBy: session.userId,
        currentVersion: body.current_version || body.currentVersion,
      });
      return sendJson(response, 201, { task });
    }

    const taskId = decodePathSegment(parts[0]);
    if (parts.length === 1 && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;

      const task = await storage.readTaskMetadata(projectId, taskId);
      if (!task) throw createHttpError(404, "Task not found");
      return sendJson(response, 200, { task });
    }

    if (parts[1] === "versions") {
      return routeTaskVersions(request, response, projectId, taskId, parts.slice(2));
    }

    return notFound(response);
  }

  async function routeTaskVersions(request, response, projectId, taskId, parts) {
    if (parts.length === 0 && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;

      const versions = await storage.listTaskVersions(projectId, taskId);
      return sendJson(response, 200, {
        versions,
        total_versions: versions.length,
      });
    }

    if (parts.length === 0 && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;

      const body = await readJsonBody(request);
      const versionId = body.version_id || body.versionId || body.id;
      if (!versionId) {
        return sendJson(response, 400, {
          error: "version_id_required",
          message: "Version ID is required",
        });
      }
      const version = await storage.ensureVersionManifest(projectId, taskId, versionId, {
        status: body.status || "in_progress",
        createdBy: session.userId,
      });
      return sendJson(response, 201, { version });
    }

    if (parts.length === 1 && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;

      const version = await storage.readVersionManifest(projectId, taskId, decodePathSegment(parts[0]));
      if (!version) throw createHttpError(404, "Version not found");
      return sendJson(response, 200, { version });
    }

    return notFound(response);
  }

  async function routeImage(request, response, parts, context) {
    const imageId = parts[0];

    if (parts.length === 1 && request.method === "DELETE") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const projectId = body.project_id;
      const image = await updateProjectImageDeletion(response, projectId, imageId, {
        mode: "delete",
        actor: session.userId,
        reason: body.delete_reason || body.deleteReason || body.reason,
      });
      if (!image) return;
      logger?.info("image.soft_delete.completed", {
        request_id: context.requestId,
        project_id: projectId,
        image_id: imageId,
        deleted_by: image.deleted_by,
      });
      return sendJson(response, 200, { image });
    }

    if (parts.length === 2 && parts[1] === "restore" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const projectId = body.project_id;
      const image = await updateProjectImageDeletion(response, projectId, imageId, {
        mode: "restore",
      });
      if (!image) return;
      logger?.info("image.restore.completed", {
        request_id: context.requestId,
        project_id: projectId,
        image_id: imageId,
        restored_by: session.userId,
      });
      return sendJson(response, 200, { image });
    }

    if (parts.length === 2 && parts[1] === "mask" && request.method === "PUT") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const projectId = body.project_id;
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      const image = (manifest.images || []).find((item) => item.id === imageId);
      if (!image) throw createHttpError(404, "Image not found");

      const decoded = storage.decodeMaskDataUrl(body.data_url);
      const validation = validateMaskContract({
        imageMeta: image,
        maskPngBuffer: decoded.buffer,
      });
      if (!validation.valid) {
        logger?.warn("mask.validation.failed", {
          request_id: context.requestId,
          project_id: projectId,
          image_id: imageId,
          reasons: validation.reasons,
          checks: validation.checks,
        });
        return sendJson(response, maskValidationStatusCode(validation), {
          error: "mask_validation_failed",
          message: "Mask does not satisfy the current image mask contract",
          validation,
        });
      }
      const written = await storage.writeMaskBuffer(projectId, imageId, decoded.buffer, { mimeType: decoded.mimeType });

      const updated = {
        ...image,
        current_mask_path: written.relativePath,
        mask_width: validation.mask.width,
        mask_height: validation.mask.height,
        mask_values_valid: validation.checks.binary_pixels === "passed" ? true : null,
        mask_pixel_validation: validation.checks.binary_pixels,
        mask_ratio: body.mask_ratio || image.mask_ratio || 0,
        status: body.status || image.status,
        updated_at: new Date().toISOString(),
      };
      const revisionEvent = normalizeRevisionEvent(body.revision_event, {
        fromStatus: image.status,
        toStatus: updated.status,
        actorId: session.userId,
        now: updated.updated_at,
      });
      if (revisionEvent) {
        updated.review_events = [
          ...(Array.isArray(image.review_events) ? image.review_events : []),
          revisionEvent,
        ];
        updated.revision_started_at = revisionEvent.created_at;
        updated.revision_source_status = revisionEvent.from_status;
      }
      manifest.images = manifest.images.map((item) => item.id === imageId ? updated : item);
      manifest.updated_at = updated.updated_at;
      await storage.writeProjectManifest(projectId, manifest);
      logger?.info("mask.save.completed", {
        request_id: context.requestId,
        project_id: projectId,
        image_id: imageId,
        status: updated.status,
        mask_path: updated.current_mask_path,
        pixel_validation: updated.mask_pixel_validation,
      });
      return sendJson(response, 200, { image: updated, validation });
    }

    if (parts.length === 2 && parts[1] === "review" && request.method === "PUT") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const projectId = body.project_id;
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      const image = (manifest.images || []).find((item) => item.id === imageId);
      if (!image) throw createHttpError(404, "Image not found");

      const result = applyReviewTransition(image, {
        action: body.action,
        reason: body.reason || body.reject_reason,
        reason_code: body.reason_code || body.reasonCode,
        reviewer_id: session.userId,
      });
      if (!result.valid) {
        logger?.warn("review.transition.failed", {
          request_id: context.requestId,
          project_id: projectId,
          image_id: imageId,
          action: body.action,
          reasons: result.validation.reasons,
          checks: result.validation.checks,
        });
        return sendJson(response, 422, {
          error: "review_transition_failed",
          message: "Review transition is not allowed for the current image state",
          validation: result.validation,
        });
      }

      manifest.images = manifest.images.map((item) => item.id === imageId ? result.image : item);
      manifest.updated_at = result.image.updated_at;
      await storage.writeProjectManifest(projectId, manifest);
      logger?.info("review.transition.completed", {
        request_id: context.requestId,
        project_id: projectId,
        image_id: imageId,
        action: result.validation.action,
        status: result.image.status,
      });
      return sendJson(response, 200, { image: result.image, validation: result.validation });
    }

    if (parts.length === 2 && parts[1] === "assignment" && request.method === "PUT") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const projectId = body.project_id;
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      const image = (manifest.images || []).find((item) => item.id === imageId);
      if (!image) throw createHttpError(404, "Image not found");

      const workerId = normalizeActorId(body.worker_id || image.worker_id || DEFAULT_ACTORS.worker);
      const reviewerId = normalizeActorId(body.reviewer_id || image.reviewer_id || "");
      const workerValid = await hasUserRole(workerId, ROLES.WORKER);
      const reviewerValid = await hasUserRole(reviewerId, ROLES.REVIEWER);
      if (!workerValid || !reviewerValid) {
        return sendJson(response, 422, {
          error: "assignment_validation_failed",
          message: "Assignment target roles are invalid",
          validation: {
            worker_id: workerValid,
            reviewer_id: reviewerValid,
          },
        });
      }

      const now = new Date().toISOString();
      const updated = {
        ...image,
        worker_id: workerId,
        reviewer_id: reviewerId,
        assigned_by: session.userId,
        assigned_at: now,
        updated_at: now,
      };
      manifest.images = manifest.images.map((item) => item.id === imageId ? updated : item);
      manifest.updated_at = now;
      await storage.writeProjectManifest(projectId, manifest);
      logger?.info("assignment.completed", {
        request_id: context.requestId,
        project_id: projectId,
        image_id: imageId,
        worker_id: updated.worker_id,
        reviewer_id: updated.reviewer_id,
      });
      return sendJson(response, 200, { image: updated });
    }

    return notFound(response);
  }

  async function readSession(request) {
    const token = bearerToken(request);
    const stored = token
      ? sessionStore?.readSession
        ? await sessionStore.readSession(token)
        : sessions.get(token)
      : null;
    if (stored) {
      return {
        ...stored,
        token,
        authenticated: true,
      };
    }
    return {
      user_id: "",
      userId: "",
      role: "",
      token: "",
      authenticated: false,
    };
  }

  function requireRole(response, session, allowedRoles) {
    if (session.authenticated && session.userId && allowedRoles.includes(session.role)) return true;
    sendJson(response, 403, {
      error: "forbidden",
      message: "The current role cannot perform this action",
      required_roles: allowedRoles,
      role: session.role || "",
    });
    return false;
  }

  async function createSession(input = {}) {
    const userId = normalizeActorId(input.userId || input.user_id || DEFAULT_ACTORS.admin);
    const role = normalizeRole(input.role, ROLES.WORKER);
    const createdAt = new Date().toISOString();
    const session = sessionStore?.createSession
      ? await sessionStore.createSession({ user_id: userId, role })
      : {
      token: createSessionToken(),
      user_id: userId,
      userId,
      role,
      created_at: createdAt,
    };
    if (!sessionStore?.createSession) sessions.set(session.token, session);
    return publicSession(session);
  }

  function publicSession(session = {}) {
    return {
      token: session.token,
      user_id: session.userId || session.user_id,
      userId: session.userId || session.user_id,
      role: session.role,
      created_at: session.created_at,
    };
  }

  function createSessionToken() {
    return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function bearerToken(request) {
    const value = String(request.headers.authorization || request.headers.Authorization || "");
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
  }

  function decodePathSegment(value) {
    try {
      return decodeURIComponent(String(value || ""));
    } catch {
      return String(value || "");
    }
  }

  function fileContentType(relativePath) {
    const lower = String(relativePath || "").toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    return "application/octet-stream";
  }

  async function hasUserRole(userId, role) {
    if (userDirectory?.userHasRole) return userDirectory.userHasRole(userId, role);
    return userHasRole(userId, role);
  }

  function listFallbackUsers(role = "") {
    const normalizedRole = normalizeRole(role, "");
    return LOCAL_MVP_USER_ACCOUNTS
      .filter((user) => user.active !== false)
      .filter((user) => !normalizedRole || user.role === normalizedRole)
      .map(publicMvpUser)
      .sort((left, right) => left.user_id.localeCompare(right.user_id));
  }

  async function readImageUpload(request) {
    const contentType = String(request.headers["content-type"] || "");
    if (contentType.toLowerCase().startsWith("multipart/form-data")) {
      return readMultipartImageUpload(request, contentType);
    }
    const body = await readJsonBody(request);
    return {
      file: false,
      imageId: body.image_id,
      fileName: body.file_name,
      dataUrl: body.data_url,
      width: body.width,
      height: body.height,
      projectName: body.project_name,
    };
  }

  async function readMultipartImageUpload(request, contentType) {
    const boundary = multipartBoundary(contentType);
    if (!boundary) throw createHttpError(400, "Multipart boundary is required");
    const body = await readRawBody(request);
    const parts = parseMultipartBody(body, boundary);
    const fields = {};
    let file = null;
    for (const part of parts) {
      if (part.filename) {
        file = part;
      } else {
        fields[part.name] = part.data.toString("utf8");
      }
    }
    if (!file) throw createHttpError(400, "Multipart image file is required");
    return {
      file: true,
      imageId: fields.image_id,
      fileName: fields.file_name || file.filename,
      width: fields.width,
      height: fields.height,
      projectName: fields.project_name,
      mimeType: file.contentType,
      buffer: file.data,
    };
  }

  function multipartBoundary(contentType) {
    const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    return match ? (match[1] || match[2] || "").trim() : "";
  }

  function parseMultipartBody(body, boundary) {
    const marker = Buffer.from(`--${boundary}`);
    const parts = [];
    let offset = 0;
    while (offset < body.length) {
      const start = body.indexOf(marker, offset);
      if (start < 0) break;
      let partStart = start + marker.length;
      if (body.subarray(partStart, partStart + 2).toString() === "--") break;
      if (body.subarray(partStart, partStart + 2).toString() === "\r\n") partStart += 2;
      const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), partStart);
      if (headerEnd < 0) break;
      const next = body.indexOf(marker, headerEnd + 4);
      if (next < 0) break;
      const headers = body.subarray(partStart, headerEnd).toString("utf8");
      let data = body.subarray(headerEnd + 4, next);
      if (data.subarray(data.length - 2).toString() === "\r\n") data = data.subarray(0, data.length - 2);
      const disposition = headers.match(/content-disposition:[^\r\n]+/i)?.[0] || "";
      const name = disposition.match(/name="([^"]+)"/i)?.[1] || "";
      const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
      const contentType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || "application/octet-stream";
      if (name) parts.push({ name, filename, contentType, data });
      offset = next;
    }
    return parts;
  }

  function maskValidationStatusCode(validation) {
    return validation.checks.png_header === "failed" ? 400 : 422;
  }

  function uploadValidationStatusCode(validation) {
    return validation.reasons.includes(UPLOAD_REASONS.FILE_TOO_LARGE) ? 413 : 400;
  }

  function normalizeRevisionEvent(event, context = {}) {
    if (!event || typeof event !== "object") return null;
    if (event.action !== "revision_start") return null;
    return {
      action: "revision_start",
      reviewer_id: normalizeActorId(context.actorId || event.reviewer_id || event.reviewerId),
      reason: String(event.reason || "mask_revision").slice(0, 240),
      from_status: String(event.from_status || event.fromStatus || context.fromStatus || ""),
      to_status: String(event.to_status || event.toStatus || context.toStatus || "in_progress"),
      created_at: event.created_at || event.createdAt || context.now || new Date().toISOString(),
    };
  }

  async function updateProjectImageDeletion(response, projectId, imageId, operation) {
    if (!projectId) {
      return sendJson(response, 400, {
        error: "project_id_required",
        message: "Project ID is required",
      });
    }
    const manifest = await storage.readProjectManifest(projectId);
    if (!manifest) throw createHttpError(404, "Project not found");
    const existing = (manifest.images || []).find((item) => item.id === imageId);
    if (!existing) throw createHttpError(404, "Image not found");

    if (operation.mode === "delete") {
      if (storage.softDeleteProjectImage) {
        return storage.softDeleteProjectImage(projectId, imageId, {
          deletedBy: operation.actor,
          reason: operation.reason,
        });
      }
      const now = new Date().toISOString();
      const updated = {
        ...existing,
        deleted_at: existing.deleted_at || now,
        deleted_by: String(operation.actor || ""),
        delete_reason: String(operation.reason || ""),
        updated_at: now,
      };
      manifest.images = manifest.images.map((item) => item.id === imageId ? updated : item);
      manifest.updated_at = now;
      await storage.writeProjectManifest(projectId, manifest);
      return updated;
    }

    if (storage.restoreProjectImage) {
      return storage.restoreProjectImage(projectId, imageId);
    }
    const now = new Date().toISOString();
    const updated = {
      ...existing,
      deleted_at: "",
      deleted_by: "",
      delete_reason: "",
      updated_at: now,
    };
    manifest.images = manifest.images.map((item) => item.id === imageId ? updated : item);
    manifest.updated_at = now;
    await storage.writeProjectManifest(projectId, manifest);
    return updated;
  }

  async function exportProject(response, projectId, context, options = {}) {
    const manifest = await storage.readProjectManifest(projectId);
    if (!manifest) throw createHttpError(404, "Project not found");
    const project = createProjectRecord({
      id: manifest.project_id,
      name: manifest.name,
      description: manifest.description,
      createdAt: manifest.created_at,
      updatedAt: manifest.updated_at,
    });
    const images = filterActiveImages(manifest.images || []);
    const validationSummary = createValidationSummary(project, images, { approvedOnly: options.approvedOnly });
    const annotations = createAnnotationsJson(project, images, { approvedOnly: options.approvedOnly });
    const summary = createExportSummaryJson(project, images, { validationSummary, approvedOnly: options.approvedOnly });
    const entries = [
      { path: "annotations.json", data: serializeJson(annotations) },
      { path: "export_summary.json", data: serializeJson(summary) },
    ];

    for (const [index, image] of images.entries()) {
      const item = validationSummary.items[index];
      if (!item?.exportable) continue;
      const exportPaths = createExportPaths(image, { index });
      entries.push({ path: exportPaths.image_path, data: await storage.readProjectFile(projectId, image.image_path) });
      entries.push({ path: exportPaths.mask_path, data: await storage.readProjectFile(projectId, image.current_mask_path) });
    }

    const zip = await createZipBlob(entries);
    const buffer = Buffer.from(await zip.arrayBuffer());
    logger?.info("export.completed", {
      request_id: context.requestId,
      project_id: projectId,
      total_images: summary.total_images,
      exported_images: summary.exported_images,
      excluded_images: summary.excluded_images,
      bytes: buffer.length,
    });
    return sendBuffer(response, 200, buffer, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="export_${projectId}.zip"`,
    });
  }

  async function exportTrainingSet(response, body = {}, context = {}) {
    if (!Array.isArray(body.sources) || body.sources.length === 0) {
      return sendJson(response, 400, {
        error: "training_sources_required",
        message: "At least one training export source is required",
      });
    }
    const sources = await loadTrainingSources(body.sources || []);
    const trainingSet = createTrainingSetZipEntries(sources, {
      approvedOnly: body.approved_only === true || body.approvedOnly === true,
    });
    const files = [];
    for (const entry of trainingSet.entries) {
      if (Object.hasOwn(entry, "data")) {
        files.push({ path: entry.path, data: entry.data });
        continue;
      }
      const data = await readTrainingSourceFile(entry);
      files.push({ path: entry.path, data });
    }
    const zip = await createZipBlob(files);
    const buffer = Buffer.from(await zip.arrayBuffer());
    logger?.info("training_set.export.completed", {
      request_id: context.requestId,
      sources: trainingSet.source_versions.sources.length,
      items: trainingSet.training_set.items.length,
    });
    return sendBuffer(response, 200, buffer, {
      "content-type": "application/zip",
      "content-disposition": "attachment; filename=\"training-set-export.zip\"",
    });
  }

  async function loadTrainingSources(sources) {
    const loaded = [];
    for (const source of sources) {
      const projectId = source.project_id || source.projectId;
      const taskId = source.task_id || source.taskId || "legacy_project";
      const versionId = source.version_id || source.versionId || "legacy";
      let manifest = null;
      if (storage.readVersionManifest && source.task_id && source.version_id) {
        manifest = await storage.readVersionManifest(projectId, taskId, versionId);
      }
      if (!manifest) {
        manifest = await storage.readProjectManifest(projectId);
      }
      if (!manifest) throw createHttpError(404, `Training export source not found: ${projectId}`);
      loaded.push({
        project_id: manifest.project_id || projectId,
        project_name: manifest.name || source.project_name || source.projectName || projectId,
        task_id: manifest.task_id || taskId,
        version_id: manifest.version_id || versionId,
        images: Array.isArray(manifest.images) ? manifest.images : [],
      });
    }
    return loaded;
  }

  async function readTrainingSourceFile(entry) {
    if (
      storage.readVersionFile &&
      entry.source_task_id !== "legacy_project" &&
      entry.source_version_id !== "legacy"
    ) {
      return storage.readVersionFile(
        entry.source_project_id,
        entry.source_task_id,
        entry.source_version_id,
        entry.source_path,
      );
    }
    return storage.readProjectFile(entry.source_project_id, entry.source_path);
  }
}
