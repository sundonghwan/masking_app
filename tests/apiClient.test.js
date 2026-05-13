import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, createMaskingApiClient, normalizeApiError } from "../src/api/client.js";

test("creates a project with normalized request payload", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    baseUrl: "http://example.test/",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ project_id: "project-1" }, 201);
    },
  });

  const result = await client.createProject({ projectId: "project-1", name: "Rail Masks" });

  assert.deepEqual(result, { project_id: "project-1" });
  assert.equal(calls[0].url, "http://example.test/api/projects");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    id: "project-1",
    name: "Rail Masks",
  });
});

test("creates a project with upload policy settings", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ project_id: "project-1" }, 201);
    },
  });

  await client.createProject({
    projectId: "project-1",
    name: "Rail Masks",
    uploadPolicy: { maxFileBytes: 5 * 1024 * 1024 },
    labelSchema: [
      { class_id: 1, name: "crack", color: "#EF4444" },
      { class_id: 2, name: "corrosion", color: "#F59E0B" },
    ],
  });

  assert.deepEqual(JSON.parse(calls[0].options.body).upload_policy, {
    maxFileBytes: 5 * 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(calls[0].options.body).label_schema, [
    { class_id: 1, name: "crack", color: "#EF4444" },
    { class_id: 2, name: "corrosion", color: "#F59E0B" },
  ]);
});

test("updates project settings with upload policy, label schema, magic preset, and revision guard", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_admin" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ settings: { revision: 3 } }, 200);
    },
  });

  const result = await client.updateProjectSettings("project 1", {
    uploadPolicy: {
      maxFileBytes: 1048576,
      allowedMimeTypes: ["image/png"],
      allowedExtensions: [".png"],
    },
    magicToolPreset: {
      colorTolerance: 24,
      edgeThreshold: 72,
      maxPixels: 50000,
      smoothIterations: 1,
    },
    labelSchema: [
      { class_id: 1, name: "crack", color: "#EF4444" },
      { class_id: 2, name: "corrosion", color: "#F59E0B" },
    ],
    ifMatchRevision: 2,
  });

  assert.equal(result.settings.revision, 3);
  assert.equal(calls[0].url, "/api/projects/project%201/settings");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers.authorization, "Bearer sess_admin");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    upload_policy: {
      maxFileBytes: 1048576,
      allowedMimeTypes: ["image/png"],
      allowedExtensions: [".png"],
    },
    magic_tool_preset: {
      colorTolerance: 24,
      edgeThreshold: 72,
      maxPixels: 50000,
      smoothIterations: 1,
    },
    label_schema: [
      { class_id: 1, name: "crack", color: "#EF4444" },
      { class_id: 2, name: "corrosion", color: "#F59E0B" },
    ],
    if_match_revision: 2,
  });
});

test("lists archived projects and mutates project lifecycle", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_admin" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ ok: true }, 200);
    },
  });

  await client.listProjects({ includeDeleted: true });
  await client.updateProjectSettings("project 1", {
    name: "Renamed",
    description: "night batch",
    ifMatchRevision: 3,
  });
  await client.archiveProject("project 1", {
    reason: "wrong_project",
    ifMatchRevision: 4,
  });
  await client.restoreProject("project 1", { ifMatchRevision: 5 });
  await client.purgeProject("project 1");

  assert.equal(calls[0].url, "/api/projects?include_deleted=1");
  assert.equal(calls[1].url, "/api/projects/project%201/settings");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    name: "Renamed",
    description: "night batch",
    if_match_revision: 3,
  });
  assert.equal(calls[2].url, "/api/projects/project%201");
  assert.equal(calls[2].options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    delete_reason: "wrong_project",
    if_match_revision: 4,
  });
  assert.equal(calls[3].url, "/api/projects/project%201/restore");
  assert.equal(calls[3].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    if_match_revision: 5,
  });
  assert.equal(calls[4].url, "/api/projects/project%201/purge");
  assert.equal(calls[4].options.method, "POST");
});

test("previews and applies project manifest repair", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_admin" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ repair: { applied: true } }, 200);
    },
  });

  await client.repairProjectManifest("project 1", { apply: false });
  await client.repairProjectManifest("project 1", { apply: true });

  assert.equal(calls[0].url, "/api/projects/project%201/repair");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { apply: false });
  assert.deepEqual(JSON.parse(calls[1].options.body), { apply: true });
});

test("calls generic AI capabilities and inference endpoints", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_reviewer" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ ok: true }, url.endsWith("/infer") ? 202 : 200);
    },
  });

  await client.getAiCapabilities();
  await client.requestAiInference({
    task: "segmentation",
    image: { dataUrl: "data:image/png;base64,aaaa", width: 2, height: 2 },
    options: { threshold: 0.5, allowed_class_ids: [1, 2] },
  });

  assert.equal(calls[0].url, "/api/ai/capabilities");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].url, "/api/ai/infer");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    task: "segmentation",
    image: {
      data_url: "data:image/png;base64,aaaa",
      width: 2,
      height: 2,
    },
    options: { threshold: 0.5, allowed_class_ids: [1, 2] },
  });
});

test("uploads an image and URL-encodes the project path segment", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: "image-1", image_path: "images/image-1.png" }, 201);
    },
  });

  const result = await client.uploadImage("project 1", {
    imageId: "image-1",
    fileName: "frame.png",
    dataUrl: "data:image/png;base64,AAAA",
    width: 12,
    height: 8,
  });

  assert.equal(result.image_path, "images/image-1.png");
  assert.equal(calls[0].url, "/api/projects/project%201/images");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    image_id: "image-1",
    file_name: "frame.png",
    data_url: "data:image/png;base64,AAAA",
    width: 12,
    height: 8,
  });
});

test("uploads an image with multipart form data when a File is provided", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_worker" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: "image-1", image_path: "images/image-1.png" }, 201);
    },
  });
  const file = new File([new Uint8Array([1, 2, 3])], "frame.png", { type: "image/png" });

  await client.uploadImage("project-1", {
    imageId: "image-1",
    fileName: "frame.png",
    file,
    width: 12,
    height: 8,
  });

  assert.equal(calls[0].url, "/api/projects/project-1/images");
  assert.equal(calls[0].options.headers.authorization, "Bearer sess_worker");
  assert.equal(Object.hasOwn(calls[0].options.headers, "x-user-id"), false);
  assert.equal(Object.hasOwn(calls[0].options.headers, "x-user-role"), false);
  assert.equal(Object.hasOwn(calls[0].options.headers, "content-type"), false);
  assert.equal(calls[0].options.body instanceof FormData, true);
  assert.equal(calls[0].options.body.get("image_id"), "image-1");
  assert.equal(calls[0].options.body.get("image").name, "frame.png");
});

test("downloads server project files for restore", async () => {
  const expected = new Blob(["image-bytes"]);
  const client = createMaskingApiClient({
    session: { token: "sess_worker" },
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/projects/project-1/files?path=images%2Fimage-1.png");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.authorization, "Bearer sess_worker");
      return {
        ok: true,
        blob: async () => expected,
      };
    },
  });

  const result = await client.getProjectFileBlob("project-1", "images/image-1.png");

  assert.equal(result, expected);
});

test("lists projects", async () => {
  const client = createMaskingApiClient({
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/projects");
      assert.equal(options.method, "GET");
      return jsonResponse({ projects: [{ project_id: "project-1" }], total_projects: 1 }, 200);
    },
  });

  const result = await client.listProjects();

  assert.equal(result.total_projects, 1);
  assert.equal(result.projects[0].project_id, "project-1");
});

test("lists assignment users with optional role filter", async () => {
  const client = createMaskingApiClient({
    session: { token: "sess_admin" },
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/users?role=worker");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.authorization, "Bearer sess_admin");
      return jsonResponse({ users: [{ user_id: "worker", role: "worker" }], total_users: 1 }, 200);
    },
  });

  const result = await client.listUsers({ role: "worker" });

  assert.equal(result.total_users, 1);
  assert.equal(result.users[0].user_id, "worker");
});

test("creates and updates local MVP users without exposing password fields", async () => {
  const requests = [];
  const client = createMaskingApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ user: { user_id: "worker-2", role: "worker" } }, 200);
    },
    session: { token: "token-1" },
  });

  await client.createUser({
    userId: "worker-2",
    displayName: "Worker 2",
    role: "worker",
    password: "secret",
    active: true,
  });
  await client.updateUser("worker-2", {
    displayName: "Worker Two",
    password: "new-secret",
    active: false,
  });

  assert.equal(requests[0].url, "/api/users");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    user_id: "worker-2",
    display_name: "Worker 2",
    role: "worker",
    password: "secret",
    active: true,
  });
  assert.equal(requests[1].url, "/api/users/worker-2");
  assert.equal(requests[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    display_name: "Worker Two",
    password: "new-secret",
    active: false,
  });
});

test("lists, creates, and reads project tasks", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_admin" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/tasks") && options.method === "POST") {
        return jsonResponse({ task: { task_id: "task-1" } }, 201);
      }
      if (url.endsWith("/tasks/task-1")) {
        return jsonResponse({ task: { task_id: "task-1" } }, 200);
      }
      return jsonResponse({ tasks: [{ task_id: "task-1" }], total_tasks: 1 }, 200);
    },
  });

  const listed = await client.listProjectTasks("project 1");
  const created = await client.createProjectTask("project 1", {
    taskId: "task-1",
    name: "Task 1",
    description: "Binary mask task",
  });
  const read = await client.getProjectTask("project 1", "task-1");

  assert.equal(listed.total_tasks, 1);
  assert.equal(created.task.task_id, "task-1");
  assert.equal(read.task.task_id, "task-1");
  assert.equal(calls[0].url, "/api/projects/project%201/tasks");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.authorization, "Bearer sess_admin");
  assert.equal(calls[1].url, "/api/projects/project%201/tasks");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    task_id: "task-1",
    name: "Task 1",
    description: "Binary mask task",
  });
  assert.equal(calls[2].url, "/api/projects/project%201/tasks/task-1");
});

test("lists, creates, and reads task versions", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/versions") && options.method === "POST") {
        return jsonResponse({ version: { version_id: "v2" } }, 201);
      }
      if (url.endsWith("/versions/v2")) {
        return jsonResponse({ version: { version_id: "v2", images: [] } }, 200);
      }
      return jsonResponse({ versions: [{ version_id: "v2" }], total_versions: 1 }, 200);
    },
  });

  const listed = await client.listTaskVersions("project-1", "task 1");
  const created = await client.createTaskVersion("project-1", "task 1", {
    versionId: "v2",
    status: "draft",
  });
  const read = await client.getTaskVersion("project-1", "task 1", "v2");

  assert.equal(listed.total_versions, 1);
  assert.equal(created.version.version_id, "v2");
  assert.deepEqual(read.version.images, []);
  assert.equal(calls[0].url, "/api/projects/project-1/tasks/task%201/versions");
  assert.equal(calls[1].url, "/api/projects/project-1/tasks/task%201/versions");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    version_id: "v2",
    status: "draft",
  });
  assert.equal(calls[2].url, "/api/projects/project-1/tasks/task%201/versions/v2");
});

test("mutates task versions and lists training sources", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_admin" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/clone")) return jsonResponse({ version: { version_id: "v2" } }, 201);
      if (url.endsWith("/restore")) return jsonResponse({ version: { version_id: "v1", deleted_at: "" } }, 200);
      if (url.endsWith("/purge")) return jsonResponse({ purge: { deleted_files: 2 } }, 200);
      if (url === "/api/training-sources") return jsonResponse({ sources: [{ project_id: "project-1" }], total_sources: 1 }, 200);
      return jsonResponse({ version: { version_id: "v1", deleted_at: "2026-04-30T00:00:00.000Z" } }, 200);
    },
  });

  const cloned = await client.cloneTaskVersion("project-1", "task 1", "v1", {
    newVersionId: "v2",
    ifMatchRevision: 4,
  });
  const removed = await client.deleteTaskVersion("project-1", "task 1", "v1", {
    reason: "bad source",
    ifMatchRevision: 5,
  });
  const restored = await client.restoreTaskVersion("project-1", "task 1", "v1", {
    ifMatchRevision: 6,
  });
  const purged = await client.purgeTaskVersion("project-1", "task 1", "v1");
  const sources = await client.listTrainingSources();

  assert.equal(cloned.version.version_id, "v2");
  assert.ok(removed.version.deleted_at);
  assert.equal(restored.version.deleted_at, "");
  assert.equal(purged.purge.deleted_files, 2);
  assert.equal(sources.total_sources, 1);
  assert.equal(calls[0].url, "/api/projects/project-1/tasks/task%201/versions/v1/clone");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    new_version_id: "v2",
    if_match_revision: 4,
  });
  assert.equal(calls[1].url, "/api/projects/project-1/tasks/task%201/versions/v1");
  assert.equal(calls[1].options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    delete_reason: "bad source",
    if_match_revision: 5,
  });
  assert.equal(calls[2].url, "/api/projects/project-1/tasks/task%201/versions/v1/restore");
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    if_match_revision: 6,
  });
  assert.equal(calls[3].url, "/api/projects/project-1/tasks/task%201/versions/v1/purge");
  assert.equal(calls[3].options.method, "POST");
  assert.equal(calls[4].url, "/api/training-sources");
});

test("manages saved training sets", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_admin" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === "/api/training-sets?include_deleted=1") return jsonResponse({ training_sets: [], total_training_sets: 0 }, 200);
      if (url === "/api/training-sets") return jsonResponse({ training_set_manifest: { training_set_id: "rail_v1" } }, 201);
      if (url.endsWith("/restore")) return jsonResponse({ training_set_manifest: { training_set_id: "rail_v1", deleted_at: "" } }, 200);
      if (options?.method === "DELETE") return jsonResponse({ training_set_manifest: { training_set_id: "rail_v1", deleted_at: "x" } }, 200);
      return jsonResponse({ training_set_manifest: { training_set_id: "rail_v1" } }, 200);
    },
  });

  await client.listTrainingSets({ includeDeleted: true });
  await client.createTrainingSet({
    trainingSetId: "rail_v1",
    name: "Rail v1",
    description: "approved",
    approvedOnly: true,
    split: { train: 0.7, val: 0.2, test: 0.1, seed: 9 },
    sources: [{ project_id: "project-1", task_id: "task-1", version_id: "v1" }],
  });
  await client.getTrainingSet("rail_v1");
  await client.archiveTrainingSet("rail_v1", { reason: "bad split", ifMatchRevision: 1 });
  await client.restoreTrainingSet("rail_v1", { ifMatchRevision: 2 });

  assert.equal(calls[0].url, "/api/training-sets?include_deleted=1");
  assert.equal(calls[1].url, "/api/training-sets");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    training_set_id: "rail_v1",
    name: "Rail v1",
    description: "approved",
    sources: [{ project_id: "project-1", task_id: "task-1", version_id: "v1" }],
    approved_only: true,
    split: { train: 0.7, val: 0.2, test: 0.1, seed: 9 },
  });
  assert.equal(calls[2].url, "/api/training-sets/rail_v1");
  assert.equal(calls[3].options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    delete_reason: "bad split",
    if_match_revision: 1,
  });
  assert.equal(calls[4].url, "/api/training-sets/rail_v1/restore");
});

test("logs in and sends bearer token on protected requests", async () => {
  const calls = [];
  let token = "";
  const client = createMaskingApiClient({
    getSession: () => ({ token, userId: "admin-1", role: "admin" }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === "/api/session/login") {
        return jsonResponse({ session: { token: "sess_123", user_id: "admin-1", role: "admin" } }, 201);
      }
      return jsonResponse({ project_id: "project-1" }, 200);
    },
  });

  const login = await client.login({ userId: "admin", password: "admin123", role: "worker" });
  token = login.session.token;
  await client.getProject("project-1");

  assert.equal(calls[0].url, "/api/session/login");
  assert.equal(Object.hasOwn(calls[0].options.headers, "authorization"), false);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    user_id: "admin",
    password: "admin123",
  });
  assert.equal(calls[1].options.headers.authorization, "Bearer sess_123");
});

test("does not send local role headers", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { userId: "admin-1", role: "admin" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ project_id: "project-1" }, 200);
    },
  });

  await client.getProject("project-1");

  assert.equal(Object.hasOwn(calls[0].options.headers, "authorization"), false);
  assert.equal(Object.hasOwn(calls[0].options.headers, "x-user-id"), false);
  assert.equal(Object.hasOwn(calls[0].options.headers, "x-user-role"), false);
});

test("saves a mask with project id inside the JSON body", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ image: { id: "image-1" }, validation: { status: "valid" } }, 200);
    },
  });

  const result = await client.saveMask("project-1", "image 1", {
    dataUrl: "data:image/png;base64,AAAA",
    status: "submitted",
    maskRatio: 0.42,
    classId: 2,
    className: "scratch",
    annotationSource: "ai",
    score: 0.91,
  });

  assert.equal(result.validation.status, "valid");
  assert.equal(calls[0].url, "/api/images/image%201/mask");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    project_id: "project-1",
    data_url: "data:image/png;base64,AAAA",
    status: "submitted",
    mask_ratio: 0.42,
    class_id: 2,
    class_name: "scratch",
    annotation_source: "ai",
    score: 0.91,
  });
});

test("saves revision audit event with mask payload", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ image: { id: "image-1", status: "in_progress" } }, 200);
    },
  });

  await client.saveMask("project-1", "image-1", {
    dataUrl: "data:image/png;base64,AAAA",
    status: "in_progress",
    revisionEvent: {
      action: "revision_start",
      reviewer_id: "worker",
      from_status: "submitted",
      to_status: "in_progress",
      created_at: "2026-04-29T00:00:00.000Z",
    },
  });

  assert.deepEqual(JSON.parse(calls[0].options.body).revision_event, {
    action: "revision_start",
    reviewer_id: "worker",
    from_status: "submitted",
    to_status: "in_progress",
    created_at: "2026-04-29T00:00:00.000Z",
  });
});

test("submits review transitions with project id and reason", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ image: { id: "image-1", status: "rejected" } }, 200);
    },
  });

  const result = await client.reviewImage("project 1", "image-1", {
    action: "reject",
    reason: "Needs tighter edge",
    reviewerId: "reviewer-1",
  });

  assert.equal(result.image.status, "rejected");
  assert.equal(calls[0].url, "/api/images/image-1/review");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    project_id: "project 1",
    action: "reject",
    reason: "Needs tighter edge",
  });
});

test("removes and restores images with project id and delete metadata", async () => {
  const calls = [];
  const client = createMaskingApiClient({
    session: { token: "sess_worker" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ image: { id: "image-1" } }, 200);
    },
  });

  await client.removeImage("project 1", "image 1", {
    reason: "wrong frame",
  });
  await client.restoreImage("project 1", "image 1");

  assert.equal(calls[0].url, "/api/images/image%201");
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.headers.authorization, "Bearer sess_worker");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    project_id: "project 1",
    delete_reason: "wrong frame",
  });
  assert.equal(calls[1].url, "/api/images/image%201/restore");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    project_id: "project 1",
  });
});

test("downloads project export as a Blob", async () => {
  const expected = new Blob(["zip"]);
  const client = createMaskingApiClient({
    session: { token: "sess_export", userId: "reviewer-1", role: "reviewer" },
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/projects/project-1/export?approved_only=1");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.authorization, "Bearer sess_export");
      return {
        ok: true,
        blob: async () => expected,
      };
    },
  });

  assert.equal(await client.downloadProjectExport("project-1", { approvedOnly: true }), expected);
});

test("downloads training set export from selected sources", async () => {
  const expected = new Blob(["training-zip"]);
  const client = createMaskingApiClient({
    session: { token: "sess_export" },
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/training-sets/export");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, "Bearer sess_export");
      assert.deepEqual(JSON.parse(options.body), {
        sources: [{ project_id: "project-1", task_id: "task-1", version_id: "v1" }],
        approved_only: true,
      });
      return {
        ok: true,
        blob: async () => expected,
      };
    },
  });

  const result = await client.downloadTrainingSetExport({
    approvedOnly: true,
    sources: [{ project_id: "project-1", task_id: "task-1", version_id: "v1" }],
  });

  assert.equal(result, expected);
});

test("downloads saved training set export", async () => {
  const expected = new Blob(["saved-training-zip"]);
  const client = createMaskingApiClient({
    session: { token: "sess_export" },
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/training-sets/rail_v1/export");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.authorization, "Bearer sess_export");
      assert.equal(options.body, undefined);
      return {
        ok: true,
        blob: async () => expected,
      };
    },
  });

  const result = await client.downloadTrainingSetExport({ trainingSetId: "rail_v1" });

  assert.equal(result, expected);
});

test("converts non-2xx responses into ApiError", async () => {
  const client = createMaskingApiClient({
    fetchImpl: async () => jsonResponse({ error: "request_error", message: "Project not found" }, 404),
  });

  await assert.rejects(
    () => client.health(),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.status, 404);
      assert.equal(error.code, "request_error");
      assert.equal(error.message, "Project not found");
      return true;
    },
  );
});

test("normalizes network errors for fallback UI paths", () => {
  const error = normalizeApiError(new Error("fetch failed"));

  assert.equal(error instanceof ApiError, true);
  assert.equal(error.status, 0);
  assert.equal(error.code, "network_error");
  assert.equal(error.message, "fetch failed");
});

function jsonResponse(payload, status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => payload,
  };
}
