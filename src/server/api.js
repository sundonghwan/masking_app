import { createZipBlob } from "../export/zip.js";
import { createIndexedMaskArtifact } from "../export/indexedMask.js";
import { createTrainingSetZipEntries } from "../export/trainingSet.js";
import { createAiCapabilities, createAiServingResponse } from "./aiServing.js";
import { publicDeploymentProfile } from "./deploymentProfile.js";
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
import { normalizeMaskPngForStorage, validateMaskContract } from "./maskValidation.js";
import { multipartBoundary, parseMultipartBody } from "./multipart.js";
import { createSessionToken } from "./sessionToken.js";
import { assertRevisionMatch, nextRevision, normalizeRevision } from "./revisions.js";
import { applyReviewTransition } from "../review/policy.js";
import { repairProjectManifestRecord } from "./storage.js";
import { labelByClassId, normalizeLabelSchema } from "../annotations/labels.js";
import { annotationMaskPath, upsertAnnotationRecord } from "../annotations/records.js";
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

export function createApiRouter({
  storage,
  logger = null,
  userDirectory = null,
  sessionStore = null,
  auditStore = null,
  deploymentProfile = {},
} = {}) {
  const sessions = new Map();

  return async function routeApi(request, response, url, context = {}) {
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
      return sendJson(response, 200, {
        ok: true,
        service: "masking-app-backend",
        deployment: publicDeploymentProfile(deploymentProfile),
        ai_serving: createAiCapabilities(deploymentProfile),
      });
    }

    if (url.pathname === "/api/ai/capabilities" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;
      return sendJson(response, 200, {
        capabilities: createAiCapabilities(deploymentProfile),
      });
    }

    if (url.pathname === "/api/ai/infer" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const result = createAiServingResponse(body, deploymentProfile);
      return sendJson(response, result.statusCode, result.body);
    }

    if (url.pathname === "/api/session/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      const account = await validateDirectoryCredentials(userDirectory, {
        user_id: body.user_id || body.userId,
        password: body.password,
      });
      if (!account) {
        await recordAuditEvent({
          action: "session.login",
          actor_id: normalizeActorId(body.user_id || body.userId) || "anonymous",
          actor_role: "anonymous",
          resource_type: "session",
          resource_id: normalizeActorId(body.user_id || body.userId) || "anonymous",
          outcome: "failure",
          reason: "invalid_credentials",
        }, context);
        return sendJson(response, 401, {
          error: "unauthorized",
          message: "Invalid user ID or password",
        });
      }
      const session = await createSession(account, context);
      await recordAuditEvent({
        action: "session.login",
        actor_id: account.user_id || account.userId,
        actor_role: account.role,
        resource_type: "session",
        resource_id: account.user_id || account.userId,
        outcome: "success",
      }, context);
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
      if (session.authenticated) {
        await recordAuditEvent({
          action: "session.logout",
          actor_id: session.userId,
          actor_role: session.role,
          resource_type: "session",
          resource_id: session.userId,
          outcome: "success",
        }, context);
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

    if (url.pathname === "/api/users" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      if (!userDirectory?.createUser) return userDirectoryUnavailable(response);

      const body = await readJsonBody(request);
      try {
        const user = await userDirectory.createUser(userPayloadFromBody(body, { includeUserId: true }));
        await recordAuditEvent({
          action: "user.create",
          actor_id: session.userId,
          actor_role: session.role,
          resource_type: "user",
          resource_id: user.user_id,
          outcome: "success",
          metadata: {
            role: user.role,
            active: user.active !== false,
          },
        }, context);
        return sendJson(response, 201, { user });
      } catch (error) {
        return sendUserDirectoryError(response, error);
      }
    }

    if (parts[0] === "api" && parts[1] === "users" && parts[2] && parts.length === 3 && request.method === "PUT") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      if (!userDirectory?.updateUser) return userDirectoryUnavailable(response);

      const body = await readJsonBody(request);
      try {
        const user = await userDirectory.updateUser(decodePathSegment(parts[2]), userPayloadFromBody(body));
        await recordAuditEvent({
          action: auditUserUpdateAction(body),
          actor_id: session.userId,
          actor_role: session.role,
          resource_type: "user",
          resource_id: user.user_id,
          outcome: "success",
          metadata: {
            role: user.role,
            active: user.active !== false,
          },
        }, context);
        return sendJson(response, 200, { user });
      } catch (error) {
        return sendUserDirectoryError(response, error);
      }
    }

    if (url.pathname === "/api/training-sets/export" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      return exportTrainingSet(response, body, context);
    }

    if (url.pathname === "/api/training-sets" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      const includeDeleted = url.searchParams.get("include_deleted") === "1" || url.searchParams.get("includeDeleted") === "1";
      if (includeDeleted && session.role !== ROLES.ADMIN) {
        return sendJson(response, 403, {
          error: "forbidden",
          message: "Deleted training sets can only be listed by admins",
          required_roles: [ROLES.ADMIN],
          role: session.role || "",
        });
      }
      const trainingSets = storage.listTrainingSets ? await storage.listTrainingSets({ includeDeleted }) : [];
      return sendJson(response, 200, {
        training_sets: trainingSets,
        total_training_sets: trainingSets.length,
      });
    }

    if (url.pathname === "/api/training-sets" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      return createSavedTrainingSet(response, body, session);
    }

    if (parts[0] === "api" && parts[1] === "training-sets" && parts[2]) {
      return routeTrainingSet(request, response, parts.slice(2), context);
    }

    if (url.pathname === "/api/training-sources" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      return listTrainingSources(response);
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
      manifest.label_schema = normalizeLabelSchema(body.label_schema || body.labelSchema || manifest.label_schema);
      await storage.writeProjectManifest(project.id, manifest);
      return sendJson(response, 201, { ...manifest, ...project, images: manifest.images || [] });
    }

    if (url.pathname === "/api/projects" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.WORKER, ROLES.REVIEWER, ROLES.ADMIN])) return;

      const includeDeleted = url.searchParams.get("include_deleted") === "1" || url.searchParams.get("includeDeleted") === "1";
      if (includeDeleted && session.role !== ROLES.ADMIN) {
        return sendJson(response, 403, {
          error: "forbidden",
          message: "Deleted projects can only be listed by admins",
          required_roles: [ROLES.ADMIN],
          role: session.role || "",
        });
      }
      const projects = await storage.listProjects({ includeDeleted });
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
      if (manifest.deleted_at && session.role !== ROLES.ADMIN) throw createHttpError(404, "Project not found");
      return sendJson(response, 200, manifest);
    }

    if (parts.length === 1 && request.method === "DELETE") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      if (!assertRevisionMatch(response, request, body, manifest.revision)) return;

      const project = storage.archiveProject
        ? await storage.archiveProject(projectId, {
            deletedBy: session.userId,
            reason: body.delete_reason || body.deleteReason || body.reason,
          })
        : await updateProjectArchiveState(projectId, manifest, {
            mode: "archive",
            actor: session.userId,
            reason: body.delete_reason || body.deleteReason || body.reason,
          });
      return sendJson(response, 200, { project });
    }

    if (parts.length === 2 && parts[1] === "restore" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      if (!assertRevisionMatch(response, request, body, manifest.revision)) return;

      const project = storage.restoreProject
        ? await storage.restoreProject(projectId)
        : await updateProjectArchiveState(projectId, manifest, { mode: "restore" });
      return sendJson(response, 200, { project });
    }

    if (parts.length === 2 && parts[1] === "repair" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      try {
        const repair = storage.repairProjectManifest
          ? await storage.repairProjectManifest(projectId, { apply: body.apply === true })
          : await repairProjectManifestWithGenericStorage(projectId, { apply: body.apply === true });
        return sendJson(response, 200, { repair });
      } catch (error) {
        return sendStorageMutationError(response, error);
      }
    }

    if (parts.length === 2 && parts[1] === "purge" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      if (!manifest.deleted_at) {
        return sendJson(response, 409, {
          error: "project_not_archived",
          message: "Only archived projects can be purged",
        });
      }
      if (!storage.purgeProject) {
        return sendJson(response, 501, {
          error: "purge_unavailable",
          message: "Project purge storage helper is not available",
        });
      }
      const purge = await storage.purgeProject(projectId);
      return sendJson(response, 200, { purge });
    }

    if (parts[1] === "tasks") {
      return routeProjectTasks(request, response, projectId, parts.slice(2));
    }

    if (parts.length === 2 && parts[1] === "settings" && ["PATCH", "PUT"].includes(request.method)) {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const manifest = await storage.readProjectManifest(projectId);
      if (!manifest) throw createHttpError(404, "Project not found");
      if (!assertRevisionMatch(response, request, body, manifest.revision)) return;

      const now = new Date().toISOString();
      const updated = {
        ...manifest,
        ...(Object.hasOwn(body, "name") || Object.hasOwn(body, "project_name") || Object.hasOwn(body, "projectName")
          ? { name: String(body.name || body.project_name || body.projectName || projectId).trim() || projectId }
          : {}),
        ...(Object.hasOwn(body, "description")
          ? { description: String(body.description || "").trim() }
          : {}),
        ...(Object.hasOwn(body, "upload_policy") || Object.hasOwn(body, "uploadPolicy")
          ? { upload_policy: normalizeUploadPolicy(body.upload_policy || body.uploadPolicy || {}, manifest.upload_policy) }
          : {}),
        ...(Object.hasOwn(body, "magic_tool_preset") || Object.hasOwn(body, "magicToolPreset")
          ? { magic_tool_preset: normalizeMagicToolPreset(body.magic_tool_preset || body.magicToolPreset || {}, manifest.magic_tool_preset) }
          : {}),
        ...(Object.hasOwn(body, "label_schema") || Object.hasOwn(body, "labelSchema")
          ? { label_schema: normalizeLabelSchema(body.label_schema || body.labelSchema || manifest.label_schema) }
          : {}),
        revision: nextRevision(manifest.revision),
        updated_at: now,
      };
      await storage.writeProjectManifest(projectId, updated);
      return sendJson(response, 200, {
        settings: {
          project_id: updated.project_id || projectId,
          name: updated.name || projectId,
          description: updated.description || "",
          upload_policy: updated.upload_policy || normalizeUploadPolicy({}),
          magic_tool_preset: updated.magic_tool_preset || normalizeMagicToolPreset({}),
          label_schema: updated.label_schema || normalizeLabelSchema([]),
          revision: updated.revision,
          deleted_at: updated.deleted_at || "",
          updated_at: updated.updated_at,
        },
      });
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

    if (parts.length === 2 && parts[1] === "clone" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const sourceVersionId = decodePathSegment(parts[0]);
      const body = await readJsonBody(request);
      const newVersionId = body.new_version_id || body.newVersionId || body.version_id || body.versionId || body.id;
      if (!newVersionId) {
        return sendJson(response, 400, {
          error: "version_id_required",
          message: "New version ID is required",
        });
      }
      const source = await storage.readVersionManifest(projectId, taskId, sourceVersionId);
      if (!source) throw createHttpError(404, "Version not found");
      if (!assertRevisionMatch(response, request, body, source.revision)) return;

      const version = storage.cloneVersionManifest
        ? await storage.cloneVersionManifest(projectId, taskId, sourceVersionId, newVersionId, { createdBy: session.userId })
        : await cloneVersionManifest(projectId, taskId, source, newVersionId, session);
      return sendJson(response, 201, { version });
    }

    if (parts.length === 1 && request.method === "DELETE") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const versionId = decodePathSegment(parts[0]);
      const body = await readJsonBody(request);
      const version = await storage.readVersionManifest(projectId, taskId, versionId);
      if (!version) throw createHttpError(404, "Version not found");
      if (!assertRevisionMatch(response, request, body, version.revision)) return;

      const updated = storage.softDeleteVersionManifest
        ? await storage.softDeleteVersionManifest(projectId, taskId, versionId, {
            deletedBy: session.userId,
            reason: body.delete_reason || body.deleteReason || body.reason,
          })
        : await updateVersionDeletion(projectId, taskId, version, {
            mode: "delete",
            actor: session.userId,
            reason: body.delete_reason || body.deleteReason || body.reason,
          });
      return sendJson(response, 200, { version: updated });
    }

    if (parts.length === 2 && parts[1] === "restore" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const versionId = decodePathSegment(parts[0]);
      const body = await readJsonBody(request);
      const version = await storage.readVersionManifest(projectId, taskId, versionId);
      if (!version) throw createHttpError(404, "Version not found");
      if (!assertRevisionMatch(response, request, body, version.revision)) return;

      const updated = storage.restoreVersionManifest
        ? await storage.restoreVersionManifest(projectId, taskId, versionId)
        : await updateVersionDeletion(projectId, taskId, version, { mode: "restore" });
      return sendJson(response, 200, { version: updated });
    }

    if (parts.length === 2 && parts[1] === "purge" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const versionId = decodePathSegment(parts[0]);
      const version = await storage.readVersionManifest(projectId, taskId, versionId);
      if (!version) throw createHttpError(404, "Version not found");
      if (!storage.purgeSoftDeletedVersionFiles) {
        return sendJson(response, 501, {
          error: "purge_unavailable",
          message: "Version purge storage helper is not available",
        });
      }
      const purge = await storage.purgeSoftDeletedVersionFiles(projectId, taskId, versionId);
      return sendJson(response, 200, { purge });
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
      const normalizedMask = normalizeMaskPngForStorage(decoded.buffer);
      const validation = validateMaskContract({
        imageMeta: image,
        maskPngBuffer: normalizedMask.buffer,
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
      const classId = Number(body.class_id || body.classId || 0);
      const label = classId ? labelByClassId(manifest.label_schema || [], classId) : null;
      const className = String(body.class_name || body.className || label?.name || "").trim();
      const classMaskPath = classId
        ? annotationMaskPath({ imageId, classId, className: className || `class_${classId}` })
        : "";
      const written = await storage.writeMaskBuffer(projectId, imageId, normalizedMask.buffer, {
        mimeType: "image/png",
        fileName: classMaskPath ? classMaskPath.split("/").at(-1) : undefined,
      });

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
      if (classId) {
        updated.annotations = upsertAnnotationRecord(image.annotations || [], {
          imageId,
          classId,
          className: className || label?.name || `class_${classId}`,
          maskPath: written.relativePath,
          maskWidth: validation.mask.width,
          maskHeight: validation.mask.height,
          maskRatio: updated.mask_ratio,
          source: body.annotation_source || body.annotationSource || body.source || "manual",
          score: body.score,
          status: updated.status,
          updatedAt: updated.updated_at,
        });
      }
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
        normalized_from_color_type: normalizedMask.normalized ? normalizedMask.source.colorTypeName : null,
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

  async function createSession(input = {}, context = {}) {
    const userId = normalizeActorId(input.userId || input.user_id || DEFAULT_ACTORS.admin);
    const role = normalizeRole(input.role, ROLES.WORKER);
    const createdAt = new Date().toISOString();
    await cleanupExpiredSessionsForLogin(context);
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

  async function cleanupExpiredSessionsForLogin(context = {}) {
    if (!sessionStore?.cleanupExpiredSessions) return;
    try {
      await sessionStore.cleanupExpiredSessions();
    } catch (error) {
      logger?.warn("session.cleanup.failed", {
        request_id: context.requestId,
        error,
      });
    }
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

  async function recordAuditEvent(event = {}, context = {}) {
    if (!auditStore?.appendEvent) return;
    try {
      await auditStore.appendEvent({
        request_id: context.requestId,
        ...event,
      });
    } catch (error) {
      logger?.warn("audit.write.failed", {
        request_id: context.requestId,
        action: event.action || "",
        resource_type: event.resource_type || "",
        resource_id: event.resource_id || "",
        error,
      });
    }
  }

  function auditUserUpdateAction(body = {}) {
    if (Object.hasOwn(body, "active")) return body.active === false ? "user.deactivate" : "user.reactivate";
    return "user.update";
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

  function userDirectoryUnavailable(response) {
    return sendJson(response, 501, {
      error: "user_directory_unavailable",
      message: "Writable user directory is not configured",
    });
  }

  function sendUserDirectoryError(response, error) {
    const statusCode = Number(error?.statusCode || 500);
    if (statusCode >= 400 && statusCode < 500) {
      return sendJson(response, statusCode, {
        error: error.code || "user_directory_error",
        message: error.message || "User directory request failed",
      });
    }
    throw error;
  }

  function sendStorageMutationError(response, error) {
    if (error instanceof TypeError) {
      return sendJson(response, 400, {
        error: "storage_mutation_error",
        message: error.message,
      });
    }
    throw error;
  }

  async function repairProjectManifestWithGenericStorage(projectId, input = {}) {
    if (!storage.readProjectManifest || !storage.writeProjectManifest) {
      throw createHttpError(501, "Project manifest repair is not available for this storage backend");
    }
    const manifest = await storage.readProjectManifest(projectId);
    if (!manifest) throw new TypeError("Project manifest is required");
    const repair = repairProjectManifestRecord(manifest, { projectId });
    if (!input.apply) return repair;
    await storage.writeProjectManifest(projectId, repair.manifest);
    return {
      ...repair,
      applied: true,
    };
  }

  function userPayloadFromBody(body = {}, options = {}) {
    const payload = {};
    if (options.includeUserId) payload.user_id = body.user_id || body.userId;
    if (Object.hasOwn(body, "role")) payload.role = body.role;
    if (Object.hasOwn(body, "display_name")) payload.display_name = body.display_name;
    if (Object.hasOwn(body, "displayName")) payload.displayName = body.displayName;
    if (Object.hasOwn(body, "password")) payload.password = body.password;
    if (Object.hasOwn(body, "active")) payload.active = body.active;
    return payload;
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

  async function cloneVersionManifest(projectId, taskId, source, newVersionId, session) {
    if (!storage.writeVersionManifest) {
      throw createHttpError(501, "Version clone storage helper is not available");
    }
    const now = new Date().toISOString();
    const version = {
      ...source,
      version_id: String(newVersionId || ""),
      status: "draft",
      created_by: session.userId || source.created_by || "",
      created_at: now,
      updated_at: now,
      cloned_from_version_id: source.version_id,
      deleted_at: "",
      deleted_by: "",
      delete_reason: "",
      revision: 1,
    };
    await storage.writeVersionManifest(projectId, taskId, version.version_id, version);
    return version;
  }

  async function updateVersionDeletion(projectId, taskId, version, operation) {
    if (!storage.writeVersionManifest) {
      throw createHttpError(501, "Version mutation storage helper is not available");
    }
    const now = new Date().toISOString();
    const updated = operation.mode === "delete"
      ? {
          ...version,
          deleted_at: version.deleted_at || now,
          deleted_by: String(operation.actor || ""),
          delete_reason: String(operation.reason || ""),
          updated_at: now,
          revision: nextRevision(version.revision),
        }
      : {
          ...version,
          deleted_at: "",
          deleted_by: "",
          delete_reason: "",
          updated_at: now,
          revision: nextRevision(version.revision),
        };
    await storage.writeVersionManifest(projectId, taskId, version.version_id, updated);
    return updated;
  }

  async function updateProjectArchiveState(projectId, manifest, operation) {
    if (!storage.writeProjectManifest) {
      throw createHttpError(501, "Project archive storage helper is not available");
    }
    const now = new Date().toISOString();
    const updated = operation.mode === "archive"
      ? {
          ...manifest,
          deleted_at: manifest.deleted_at || now,
          deleted_by: String(operation.actor || ""),
          delete_reason: String(operation.reason || ""),
          updated_at: now,
          revision: nextRevision(manifest.revision),
        }
      : {
          ...manifest,
          deleted_at: "",
          deleted_by: "",
          delete_reason: "",
          updated_at: now,
          revision: nextRevision(manifest.revision),
        };
    await storage.writeProjectManifest(projectId, updated);
    return updated;
  }

  function normalizeMagicToolPreset(input = {}, fallback = {}) {
    const source = input && typeof input === "object" ? input : {};
    const base = fallback && typeof fallback === "object" ? fallback : {};
    return {
      colorTolerance: clampNumber(source.colorTolerance ?? source.color_tolerance ?? base.colorTolerance ?? 42, 0, 255),
      edgeThreshold: clampNumber(source.edgeThreshold ?? source.edge_threshold ?? base.edgeThreshold ?? 55, 0, 255),
      maxPixels: clampNumber(source.maxPixels ?? source.max_pixels ?? base.maxPixels ?? 70000, 1, 10000000),
      smoothIterations: clampNumber(source.smoothIterations ?? source.smooth_iterations ?? base.smoothIterations ?? 1, 0, 8),
    };
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  async function listTrainingSources(response) {
    const projects = await storage.listProjects();
    const sources = [];
    for (const project of projects) {
      const projectId = project.project_id || project.id;
      if (!projectId) continue;
      const tasks = storage.listProjectTasks ? await storage.listProjectTasks(projectId) : [];
      if (!Array.isArray(tasks) || tasks.length === 0) {
        const manifest = await storage.readProjectManifest(projectId);
        if (manifest) sources.push(createTrainingSourceSummary({
          project: manifest,
          task: { task_id: "legacy_project", name: "Legacy Project" },
          version: {
            project_id: projectId,
            task_id: "legacy_project",
            version_id: "legacy",
            status: "legacy",
            created_at: manifest.created_at,
            updated_at: manifest.updated_at,
            images: manifest.images || [],
          },
        }));
        continue;
      }
      for (const task of tasks) {
        const versions = storage.listTaskVersions ? await storage.listTaskVersions(projectId, task.task_id) : [];
        for (const versionSummary of versions) {
          const version = storage.readVersionManifest
            ? await storage.readVersionManifest(projectId, task.task_id, versionSummary.version_id)
            : versionSummary;
          if (version) {
            sources.push(createTrainingSourceSummary({ project, task, version }));
          }
        }
      }
    }
    sources.sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
    return sendJson(response, 200, {
      sources,
      total_sources: sources.length,
    });
  }

  function createTrainingSourceSummary({ project = {}, task = {}, version = {} }) {
    const images = Array.isArray(version.images) ? version.images : [];
    const active = filterActiveImages(images);
    return {
      project_id: version.project_id || project.project_id,
      project_name: project.name || version.project_name || version.project_id || project.project_id,
      task_id: version.task_id || task.task_id || "legacy_project",
      task_name: task.name || version.task_name || version.task_id || "Legacy Project",
      version_id: version.version_id || "legacy",
      status: version.status || "",
      created_at: version.created_at || "",
      updated_at: version.updated_at || "",
      revision: normalizeRevision(version.revision),
      total_images: images.length,
      active_images: active.length,
      submitted_images: active.filter((image) => image.status === "submitted").length,
      approved_images: active.filter((image) => image.status === "approved").length,
      rejected_images: active.filter((image) => image.status === "rejected").length,
      deleted_at: version.deleted_at || "",
    };
  }

  async function routeTrainingSet(request, response, parts, context = {}) {
    const trainingSetId = decodePathSegment(parts[0]);

    if (parts.length === 1 && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      const manifest = await readTrainingSetOr404(trainingSetId);
      if (manifest.deleted_at && session.role !== ROLES.ADMIN) throw createHttpError(404, "Training set not found");
      return sendJson(response, 200, { training_set_manifest: manifest });
    }

    if (parts.length === 2 && parts[1] === "export" && request.method === "GET") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.REVIEWER, ROLES.ADMIN])) return;
      const manifest = await readTrainingSetOr404(trainingSetId);
      if (manifest.deleted_at) throw createHttpError(404, "Training set not found");
      return exportSavedTrainingSet(response, manifest, context);
    }

    if (parts.length === 1 && request.method === "DELETE") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const manifest = await readTrainingSetOr404(trainingSetId);
      if (!assertRevisionMatch(response, request, body, manifest.revision)) return;
      const trainingSet = storage.archiveTrainingSet
        ? await storage.archiveTrainingSet(trainingSetId, {
            deletedBy: session.userId,
            reason: body.delete_reason || body.deleteReason || body.reason,
          })
        : await updateTrainingSetArchiveState(trainingSetId, manifest, {
            mode: "archive",
            actor: session.userId,
            reason: body.delete_reason || body.deleteReason || body.reason,
          });
      return sendJson(response, 200, { training_set_manifest: trainingSet });
    }

    if (parts.length === 2 && parts[1] === "restore" && request.method === "POST") {
      const session = await readSession(request);
      if (!requireRole(response, session, [ROLES.ADMIN])) return;
      const body = await readJsonBody(request);
      const manifest = await readTrainingSetOr404(trainingSetId);
      if (!assertRevisionMatch(response, request, body, manifest.revision)) return;
      const trainingSet = storage.restoreTrainingSet
        ? await storage.restoreTrainingSet(trainingSetId)
        : await updateTrainingSetArchiveState(trainingSetId, manifest, { mode: "restore" });
      return sendJson(response, 200, { training_set_manifest: trainingSet });
    }

    return notFound(response);
  }

  async function createSavedTrainingSet(response, body = {}, session = {}) {
    if (!storage.writeTrainingSetManifest) {
      return sendJson(response, 501, {
        error: "training_set_storage_unavailable",
        message: "Training set storage helper is not available",
      });
    }
    const trainingSetId = normalizeTrainingSetId(body.training_set_id || body.trainingSetId || body.id || body.name);
    if (!trainingSetId) {
      return sendJson(response, 400, {
        error: "training_set_id_required",
        message: "Training set ID is required",
      });
    }
    if (!Array.isArray(body.sources) || body.sources.length === 0) {
      return sendJson(response, 400, {
        error: "training_sources_required",
        message: "At least one training set source is required",
      });
    }
    if (storage.readTrainingSetManifest && await storage.readTrainingSetManifest(trainingSetId)) {
      return sendJson(response, 409, {
        error: "training_set_exists",
        message: "Training set ID already exists",
        training_set_id: trainingSetId,
      });
    }
    const sources = await loadTrainingSources(body.sources);
    const trainingSet = createTrainingSetZipEntries(sources, {
      trainingSetId,
      name: body.name || trainingSetId,
      description: body.description || "",
      approvedOnly: body.approved_only === true || body.approvedOnly === true,
      split: body.split || {},
    });
    const now = new Date().toISOString();
    const manifest = await storage.writeTrainingSetManifest(trainingSetId, {
      training_set_id: trainingSetId,
      name: body.name || trainingSetId,
      description: body.description || "",
      approved_only: trainingSet.training_set.approved_only,
      split: trainingSet.training_set.split,
      sources: body.sources.map(normalizeTrainingSourceRef),
      training_set: trainingSet.training_set,
      source_versions: trainingSet.source_versions,
      created_by: session.userId || "",
      created_at: now,
      updated_at: now,
      revision: 1,
      deleted_at: "",
      deleted_by: "",
      delete_reason: "",
    });
    return sendJson(response, 201, { training_set_manifest: manifest });
  }

  async function readTrainingSetOr404(trainingSetId) {
    if (!storage.readTrainingSetManifest) throw createHttpError(501, "Training set storage helper is not available");
    const manifest = await storage.readTrainingSetManifest(trainingSetId);
    if (!manifest) throw createHttpError(404, "Training set not found");
    return manifest;
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
    const indexedMaskInputs = new Map();

    for (const [index, image] of images.entries()) {
      const item = validationSummary.items[index];
      if (!item?.exportable) continue;
      const exportPaths = createExportPaths(image, { index });
      entries.push({ path: exportPaths.image_path, data: await storage.readProjectFile(projectId, image.image_path) });
    }

    for (const annotation of annotations.annotations) {
      const image = images.find((item) => item.id === annotation.image_id) || (manifest.images || []).find((item) => item.id === annotation.image_id);
      const sourceMaskPath = annotation.source_mask_path || image?.current_mask_path || "";
      const data = await storage.readProjectFile(projectId, sourceMaskPath);
      entries.push({ path: annotation.mask_path, data });
      if (annotation.class_id && data instanceof Uint8Array && image) {
        const current = indexedMaskInputs.get(annotation.image_id) || { image, annotations: [] };
        current.annotations.push({ ...annotation, maskBuffer: data });
        indexedMaskInputs.set(annotation.image_id, current);
      }
    }

    const indexedMasks = [];
    for (const { image, annotations: indexedAnnotations } of indexedMaskInputs.values()) {
      if (indexedAnnotations.length === 0) continue;
      let artifact = null;
      try {
        artifact = createIndexedMaskArtifact({ image, annotations: indexedAnnotations });
      } catch (error) {
        logger?.warn("export.indexed_mask.skipped", {
          request_id: context.requestId,
          project_id: projectId,
          image_id: image.id,
          reason: error instanceof Error ? error.message : "unknown indexed mask error",
        });
        continue;
      }
      entries.push({ path: artifact.path, data: artifact.png });
      indexedMasks.push({
        image_id: image.id,
        path: artifact.path,
        width: Number(image.width),
        height: Number(image.height),
        overlap_policy: artifact.overlap_policy,
        class_map: artifact.class_map,
      });
    }
    if (indexedMasks.length > 0) {
      entries.push({
        path: "indexed_masks/indexed_masks.json",
        data: serializeJson({
          version: 1,
          generated_at: new Date().toISOString(),
          mask_format: "8-bit grayscale indexed PNG",
          background_value: 0,
          masks: indexedMasks,
        }),
      });
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

  async function exportSavedTrainingSet(response, manifest = {}, context = {}) {
    const files = [
      { path: "training_set.json", data: serializeJson(manifest.training_set || {}) },
      { path: "source_versions.json", data: serializeJson(manifest.source_versions || {}) },
      { path: "splits/train.txt", data: splitListFromManifest(manifest, "train") },
      { path: "splits/val.txt", data: splitListFromManifest(manifest, "val") },
      { path: "splits/test.txt", data: splitListFromManifest(manifest, "test") },
    ];
    for (const item of manifest.training_set?.items || []) {
      files.push({
        path: item.image_path,
        data: await readTrainingSourceFile({
          source_project_id: item.project_id,
          source_task_id: item.task_id,
          source_version_id: item.version_id,
          source_path: item.source_image_path,
        }),
      });
      files.push({
        path: item.mask_path,
        data: await readTrainingSourceFile({
          source_project_id: item.project_id,
          source_task_id: item.task_id,
          source_version_id: item.version_id,
          source_path: item.source_mask_path,
        }),
      });
    }
    const zip = await createZipBlob(files);
    const buffer = Buffer.from(await zip.arrayBuffer());
    logger?.info("training_set.saved_export.completed", {
      request_id: context.requestId,
      training_set_id: manifest.training_set_id,
      items: manifest.training_set?.items?.length || 0,
    });
    return sendBuffer(response, 200, buffer, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="training-set-${manifest.training_set_id || "export"}.zip"`,
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

  async function updateTrainingSetArchiveState(trainingSetId, manifest, operation) {
    if (!storage.writeTrainingSetManifest) {
      throw createHttpError(501, "Training set archive storage helper is not available");
    }
    const now = new Date().toISOString();
    const updated = operation.mode === "archive"
      ? {
          ...manifest,
          deleted_at: manifest.deleted_at || now,
          deleted_by: String(operation.actor || ""),
          delete_reason: String(operation.reason || ""),
          updated_at: now,
          revision: nextRevision(manifest.revision),
        }
      : {
          ...manifest,
          deleted_at: "",
          deleted_by: "",
          delete_reason: "",
          updated_at: now,
          revision: nextRevision(manifest.revision),
        };
    await storage.writeTrainingSetManifest(trainingSetId, updated);
    return updated;
  }

  function normalizeTrainingSetId(value) {
    return String(value || "")
      .trim()
      .replace(/[\\/]+/g, "_")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "")
      .replace(/_{2,}/g, "_")
      .slice(0, 120);
  }

  function normalizeTrainingSourceRef(source = {}) {
    return {
      project_id: source.project_id || source.projectId || "",
      task_id: source.task_id || source.taskId || "legacy_project",
      version_id: source.version_id || source.versionId || "legacy",
    };
  }

  function splitListFromManifest(manifest = {}, split) {
    return `${(manifest.training_set?.items || [])
      .filter((item) => item.split === split)
      .map((item) => `${item.image_path} ${item.mask_path}`)
      .join("\n")}\n`;
  }
}
