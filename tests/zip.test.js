import assert from "node:assert/strict";
import test from "node:test";

import { createZipBlob, normalizeZipPath } from "../src/export/zip.js";

test("normalizeZipPath removes traversal and backslashes", () => {
  assert.equal(normalizeZipPath("../images\\raw.png"), "images/raw.png");
  assert.equal(normalizeZipPath("masks/./image_mask.png"), "masks/image_mask.png");
});

test("createZipBlob creates a zip file with expected entries", async () => {
  const zip = await createZipBlob([
    { path: "annotations.json", data: { ok: true } },
    { path: "images/image_0001.txt", data: "image" },
    { path: "masks/image_0001_mask.txt", data: new Blob(["mask"]) },
  ], { now: "2026-04-29T00:00:00.000Z" });
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const text = new TextDecoder().decode(bytes);

  assert.equal(zip.type, "application/zip");
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(text, /annotations\.json/);
  assert.match(text, /images\/image_0001\.txt/);
  assert.match(text, /masks\/image_0001_mask\.txt/);
});
