import assert from "node:assert/strict";
import test from "node:test";

import {
  clearProject,
  createProjectStore,
  loadImageBlob,
  loadMaskBlob,
  loadProjectSnapshot,
  saveImageBlob,
  saveMaskBlob,
  saveProjectSnapshot,
} from "../src/storage/projectStore.js";

test("memory fallback saves and loads an isolated project snapshot", async () => {
  const store = createProjectStore({ forceMemory: true });
  const snapshot = {
    project: {
      id: "project-1",
      name: "Rail Masks",
      savedAt: new Date("2026-04-29T00:00:00.000Z"),
    },
    images: [
      {
        id: "image-1",
        original_file_name: "raw.png",
        width: 640,
        height: 480,
        status: "in_progress",
      },
    ],
  };

  await store.saveProjectSnapshot(snapshot);
  snapshot.project.name = "Mutated after save";
  snapshot.images[0].status = "submitted";

  const loaded = await store.loadProjectSnapshot();

  assert.deepEqual(loaded, {
    project: {
      id: "project-1",
      name: "Rail Masks",
      savedAt: "2026-04-29T00:00:00.000Z",
    },
    images: [
      {
        id: "image-1",
        original_file_name: "raw.png",
        width: 640,
        height: 480,
        status: "in_progress",
      },
    ],
  });

  loaded.images[0].status = "approved";
  assert.equal((await store.loadProjectSnapshot()).images[0].status, "in_progress");
});

test("memory fallback stores image blobs by image id", async () => {
  const store = createProjectStore({ forceMemory: true });
  const imageBlob = new Blob(["image-bytes"], { type: "image/png" });

  await store.saveImageBlob(" image-1 ", imageBlob);
  const loaded = await store.loadImageBlob("image-1");

  assert.notEqual(loaded, imageBlob);
  assert.equal(loaded.type, "image/png");
  assert.equal(await loaded.text(), "image-bytes");
  assert.equal(await store.loadImageBlob("missing"), null);
});

test("memory fallback stores mask blobs and mask data URLs by image id", async () => {
  const store = createProjectStore({ forceMemory: true });
  const maskBlob = new Blob(["mask-bytes"], { type: "image/png" });
  const maskDataUrl = "data:image/png;base64,bWFzaw==";

  await store.saveMaskBlob("image-1", maskBlob);
  await store.saveMaskBlob("image-2", maskDataUrl);

  const loadedBlob = await store.loadMaskBlob("image-1");
  assert.notEqual(loadedBlob, maskBlob);
  assert.equal(loadedBlob.type, "image/png");
  assert.equal(await loadedBlob.text(), "mask-bytes");
  assert.equal(await store.loadMaskBlob("image-2"), maskDataUrl);
});

test("clearProject removes metadata, original blobs, and mask blobs", async () => {
  const store = createProjectStore({ forceMemory: true });

  await store.saveProjectSnapshot({ project: { id: "project-1" }, images: [{ id: "image-1" }] });
  await store.saveImageBlob("image-1", new Blob(["image"], { type: "image/png" }));
  await store.saveMaskBlob("image-1", new Blob(["mask"], { type: "image/png" }));

  await store.clearProject();

  assert.equal(await store.loadProjectSnapshot(), null);
  assert.equal(await store.loadImageBlob("image-1"), null);
  assert.equal(await store.loadMaskBlob("image-1"), null);
});

test("snapshot serialization boundary rejects binary and executable values", async () => {
  const store = createProjectStore({ forceMemory: true });

  assert.throws(
    () => store.saveProjectSnapshot({ images: [{ id: "image-1", file: new Blob(["raw"]) }] }),
    /cannot contain Blob\/File values/,
  );
  assert.throws(
    () => store.saveProjectSnapshot({ onSave() {} }),
    /non-serializable value/,
  );
});

test("blob APIs validate ids and payload boundaries", async () => {
  const store = createProjectStore({ forceMemory: true });

  assert.throws(
    () => store.saveImageBlob("", new Blob(["image"])),
    /imageId is required/,
  );
  assert.throws(
    () => store.saveImageBlob("image-1", "not-a-data-url"),
    /image blob must be a Blob or data URL string/,
  );
  assert.throws(
    () => store.saveMaskBlob("image-1", { raw: true }),
    /mask blob must be a Blob or data URL string/,
  );
});

test("module-level default APIs are available for browser app integration", async () => {
  assert.equal(typeof clearProject, "function");
  assert.equal(typeof saveProjectSnapshot, "function");
  assert.equal(typeof loadProjectSnapshot, "function");
  assert.equal(typeof saveImageBlob, "function");
  assert.equal(typeof loadImageBlob, "function");
  assert.equal(typeof saveMaskBlob, "function");
  assert.equal(typeof loadMaskBlob, "function");
});
