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
import { createHttpError, methodNotAllowed, notFound, readJsonBody, sendBuffer, sendJson } from "./httpUtils.js";
import { parseImageMetadataFromDataUrl, validateClientDimensions } from "./imageMetadata.js";
import { validateMaskContract } from "./maskValidation.js";
import { applyReviewTransition } from "../review/policy.js";
import { UPLOAD_REASONS, validateImageDataUrlUpload } from "../upload/policy.js";

export function createApiRouter({ storage, logger = null }) {
  return async function routeApi(request, response, url, context = {}) {
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
      return sendJson(response, 200, { ok: true, service: "masking-app-backend" });
    }

    if (url.pathname === "/api/projects" && request.method === "POST") {
      const body = await readJsonBody(request);
      const project = createProjectRecord({
        id: body.project_id || body.id || "mask_project_001",
        name: body.name || "Masking Project",
        description: body.description || "",
      });
      const manifest = await storage.ensureProject(project.id, { name: project.name });
      return sendJson(response, 201, { ...manifest, ...project, images: manifest.images || [] });
    }

    if (url.pathname === "/api/projects" && request.method === "GET") {
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
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      return sendJson(response, 200, manifest);
    }

    if (parts.length === 2 && parts[1] === "images" && request.method === "POST") {
      const body = await readJsonBody(request);
      const uploadValidation = validateImageDataUrlUpload({
        fileName: body.file_name || `${body.image_id || "image"}.png`,
        dataUrl: body.data_url,
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
      const imageMetadata = parseImageMetadataFromDataUrl(body.data_url);
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
        width: body.width,
        height: body.height,
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

      const manifest = await storage.ensureProject(projectId, { name: body.project_name });
      const imageId = body.image_id || `image_${String((manifest.images || []).length + 1).padStart(4, "0")}`;
      const written = await storage.writeImageFromDataUrl(projectId, imageId, body.file_name || `${imageId}.png`, body.data_url);
      const image = createImageRecord({
        id: imageId,
        projectId,
        originalFileName: body.file_name || `${imageId}.png`,
        imagePath: written.relativePath,
        width: imageMetadata.width,
        height: imageMetadata.height,
        status: "not_started",
      });
      manifest.images = [...(manifest.images || []).filter((item) => item.id !== image.id), image];
      manifest.updated_at = new Date().toISOString();
      await storage.writeProjectManifest(projectId, manifest);
      return sendJson(response, 201, image);
    }

    if (parts.length === 2 && parts[1] === "export" && request.method === "GET") {
      return exportProject(response, projectId, context, {
        approvedOnly: url.searchParams.get("approved_only") === "1",
      });
    }

    return notFound(response);
  }

  async function routeImage(request, response, parts, context) {
    const imageId = parts[0];

    if (parts.length === 2 && parts[1] === "mask" && request.method === "PUT") {
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
      const body = await readJsonBody(request);
      const projectId = body.project_id;
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      const image = (manifest.images || []).find((item) => item.id === imageId);
      if (!image) throw createHttpError(404, "Image not found");

      const result = applyReviewTransition(image, {
        action: body.action,
        reason: body.reason || body.reject_reason,
        reviewer_id: body.reviewer_id,
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

    return notFound(response);
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
