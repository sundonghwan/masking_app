import assert from "node:assert/strict";
import test from "node:test";

import { verifyObjectReferences } from "../scripts/harness/object-db-verify.mjs";

test("verifies every DB object reference against object storage", async () => {
  const result = await verifyObjectReferences({
    async query(sql) {
      assert.match(sql, /FROM images/);
      assert.match(sql, /FROM annotations/);
      return {
        rows: [
          { object_key: "projects/demo/image-a.png" },
          { object_key: "projects/demo/mask-a.png" },
        ],
      };
    },
  }, {
    async statObject(bucket, objectKey) {
      assert.equal(bucket, "masking-app");
      if (objectKey.endsWith("mask-a.png")) throw new Error("missing");
    },
  }, "masking-app");

  assert.deepEqual(result, {
    ok: false,
    checked: 2,
    missing: 1,
    missing_keys: ["projects/demo/mask-a.png"],
  });
});
