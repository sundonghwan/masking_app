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
    session: { userId: "worker-1", role: "worker" },
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
  assert.equal(calls[0].options.headers["x-user-id"], "worker-1");
  assert.equal(calls[0].options.headers["x-user-role"], "worker");
  assert.equal(Object.hasOwn(calls[0].options.headers, "content-type"), false);
  assert.equal(calls[0].options.body instanceof FormData, true);
  assert.equal(calls[0].options.body.get("image_id"), "image-1");
  assert.equal(calls[0].options.body.get("image").name, "frame.png");
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
  });

  assert.equal(result.validation.status, "valid");
  assert.equal(calls[0].url, "/api/images/image%201/mask");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    project_id: "project-1",
    data_url: "data:image/png;base64,AAAA",
    status: "submitted",
    mask_ratio: 0.42,
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
    reviewer_id: "reviewer-1",
  });
});

test("downloads project export as a Blob", async () => {
  const expected = new Blob(["zip"]);
  const client = createMaskingApiClient({
    fetchImpl: async (url) => {
      assert.equal(url, "/api/projects/project-1/export?approved_only=1");
      return {
        ok: true,
        blob: async () => expected,
      };
    },
  });

  assert.equal(await client.downloadProjectExport("project-1", { approvedOnly: true }), expected);
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
