import assert from "node:assert/strict";
import test from "node:test";

import {
  createObjectStorageClient,
  createObjectStorageConfig,
  ensureObjectBucket,
  verifyObjectStorage,
} from "../src/server/objectStorage.js";

test("creates MinIO-compatible object storage config from endpoint settings", () => {
  const config = createObjectStorageConfig({
    endpoint: "http://minio:9000",
    accessKey: "masking",
    secretKey: "secret",
    bucket: "masking-app",
    region: "ap-northeast-2",
  });

  assert.equal(config.endPoint, "minio");
  assert.equal(config.port, 9000);
  assert.equal(config.useSSL, false);
  assert.equal(config.accessKey, "masking");
  assert.equal(config.secretKey, "secret");
  assert.equal(config.bucket, "masking-app");
  assert.equal(config.region, "ap-northeast-2");
});

test("creates object storage clients without exposing app code to MinIO constructor shape", () => {
  const client = createObjectStorageClient(
    createObjectStorageConfig({
      endpoint: "https://objects.example.com",
      accessKey: "masking",
      secretKey: "secret",
      bucket: "masking-app",
    }),
    {
      Client: class FakeClient {
        constructor(options) {
          this.options = options;
        }
      },
    },
  );

  assert.deepEqual(client.options, {
    endPoint: "objects.example.com",
    port: 443,
    useSSL: true,
    accessKey: "masking",
    secretKey: "secret",
    region: "us-east-1",
  });
});

test("ensures object bucket only when missing", async () => {
  const calls = [];
  const client = {
    async bucketExists(bucket) {
      calls.push(["exists", bucket]);
      return false;
    },
    async makeBucket(bucket, region) {
      calls.push(["make", bucket, region]);
    },
  };

  const result = await ensureObjectBucket(client, "masking-app", { region: "ap-northeast-2" });

  assert.deepEqual(result, { bucket: "masking-app", created: true });
  assert.deepEqual(calls, [
    ["exists", "masking-app"],
    ["make", "masking-app", "ap-northeast-2"],
  ]);
});

test("verifies object bucket existence", async () => {
  const result = await verifyObjectStorage({
    async bucketExists(bucket) {
      return bucket === "masking-app";
    },
  }, "masking-app");

  assert.deepEqual(result, {
    ok: true,
    bucket: "masking-app",
  });
});
