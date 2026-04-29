import { createZipBlob } from "../export/zip.js";
import {
  createAnnotationsJson,
  createExportPaths,
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
import { UPLOAD_REASONS, validateImageDataUrlUpload, validateUploadCandidate } from "../upload/policy.js";
import {
  DEFAULT_ACTORS,
  DEFAULT_PROJECT,
  ROLES,
  normalizeActorId,
  normalizeRole,
  userHasRole,
} from "../config/runtimeDefaults.js";
import { validateMvpCredentials } from "./auth.js";

export function createApiRouter({ storage, logger = null }) {
  const sessions = new Map();

  return async function routeApi(request, response, url, context = {}) {
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
      return sendJson(response, 200, { ok: true, service: "masking-app-backend" });
    }

    if (url.pathname === "/api/session/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      const account = validateMvpCredentials({
        user_id: body.user_id || body.userId,
        password: body.password,
      });
      if (!account) {
        return sendJson(response, 401, {
          error: "unauthorized",
          message: "Invalid user ID or password",
        });
      }
      const session = createSession(account);
      sessions.set(session.token, session);
      return sendJson(response, 201, { session });
    }

    if (url.pathname === "/api/session/logout" && request.method === "POST") {
      const session = readSession(request);
      if (session.token) sessions.delete(session.token);
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/session/me" && request.method === "GET") {
      const session = readSession(request);
      if (!session.authenticated) {
        return sendJson(response, 401, {
          error: "unauthorized",
          message: "A valid session token is required",
        });
      }
      return sendJson(response, 200, { session: publicSession(session) });
    }

    if (url.pathname === "/api/projects" && request.method === "POST") {
      const session = readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;

      const body = await readJsonBody(request);
      const project = createProjectRecord({
        id: body.project_id || body.id || DEFAULT_PROJECT.id,
        name: body.name || DEFAULT_PROJECT.name,
        description: body.description || "",
      });
      const manifest = await storage.ensureProject(project.id, { name: project.name });
      return sendJson(response, 201, { ...manifest, ...project, images: manifest.images || [] });
    }

    if (url.pathname === "/api/projects" && request.method === "GET") {
      const session = readSession(request);
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
      const session = readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;

      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      return sendJson(response, 200, manifest);
    }

    if (parts.length === 2 && parts[1] === "images" && request.method === "POST") {
      const session = readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.ADMIN])) return;

      const upload = await readImageUpload(request);
      const uploadValidation = upload.file
        ? validateUploadCandidate({
            fileName: upload.fileName || `${upload.imageId || "image"}.png`,
            mimeType: upload.mimeType,
            sizeBytes: upload.buffer.length,
          })
        : validateImageDataUrlUpload({
            fileName: upload.fileName || `${upload.imageId || "image"}.png`,
            dataUrl: upload.dataUrl,
          });
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

      const manifest = await storage.ensureProject(projectId, { name: upload.projectName });
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
      const session = readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      return exportProject(response, projectId, context, {
        approvedOnly: url.searchParams.get("approved_only") === "1",
      });
    }

    return notFound(response);
  }

  async function routeImage(request, response, parts, context) {
    const imageId = parts[0];

    if (parts.length === 2 && parts[1] === "mask" && request.method === "PUT") {
      const session = readSession(request);
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
      const session = readSession(request);
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
      const session = readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const projectId = body.project_id;
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      const image = (manifest.images || []).find((item) => item.id === imageId);
      if (!image) throw createHttpError(404, "Image not found");

      const workerId = normalizeActorId(body.worker_id || image.worker_id || DEFAULT_ACTORS.worker);
      const reviewerId = normalizeActorId(body.reviewer_id || image.reviewer_id || "");
      const workerValid = userHasRole(workerId, ROLES.WORKER);
      const reviewerValid = userHasRole(reviewerId, ROLES.REVIEWER);
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

  function readSession(request) {
    const token = bearerToken(request);
    const stored = token ? sessions.get(token) : null;
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

  function createSession(input = {}) {
    const userId = normalizeActorId(input.userId || input.user_id || DEFAULT_ACTORS.admin);
    const role = normalizeRole(input.role, ROLES.WORKER);
    const createdAt = new Date().toISOString();
    return {
      token: createSessionToken(),
      user_id: userId,
      userId,
      role,
      created_at: createdAt,
    };
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
    const images = manifest.images || [];
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
}
