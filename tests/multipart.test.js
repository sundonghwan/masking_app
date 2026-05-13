import assert from "node:assert/strict";
import test from "node:test";

import { multipartBoundary, parseMultipartBody } from "../src/server/multipart.js";

test("multipartBoundary parses quoted and unquoted content-type boundaries", () => {
  assert.equal(multipartBoundary("multipart/form-data; boundary=abc123"), "abc123");
  assert.equal(multipartBoundary('multipart/form-data; boundary="quoted-123"'), "quoted-123");
  assert.equal(multipartBoundary("text/plain"), "");
});

test("parseMultipartBody returns text fields and file parts", () => {
  const body = Buffer.from([
    "--boundary-1",
    'Content-Disposition: form-data; name="project_name"',
    "",
    "Bridge deck",
    "--boundary-1",
    'Content-Disposition: form-data; name="image"; filename="frame.png"',
    "Content-Type: image/png",
    "",
    "PNGDATA",
    "--boundary-1--",
    "",
  ].join("\r\n"));

  const parts = parseMultipartBody(body, "boundary-1");

  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0], {
    name: "project_name",
    filename: "",
    contentType: "application/octet-stream",
    data: Buffer.from("Bridge deck"),
  });
  assert.equal(parts[1].name, "image");
  assert.equal(parts[1].filename, "frame.png");
  assert.equal(parts[1].contentType, "image/png");
  assert.deepEqual(parts[1].data, Buffer.from("PNGDATA"));
});
