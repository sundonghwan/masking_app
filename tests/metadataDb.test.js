import assert from "node:assert/strict";
import test from "node:test";

import {
  METADATA_MIGRATIONS,
  createMetadataDbConfig,
  createMetadataDbPool,
  runMetadataMigrations,
  verifyMetadataDb,
} from "../src/server/metadataDb.js";

test("creates metadata DB config from database URL", () => {
  const config = createMetadataDbConfig({
    databaseUrl: "postgres://masking:secret@postgres:5432/masking_app",
  });

  assert.deepEqual(config, {
    connectionString: "postgres://masking:secret@postgres:5432/masking_app",
  });
});

test("creates metadata DB pool through an injectable Pool constructor", () => {
  const pool = createMetadataDbPool({ connectionString: "postgres://db" }, {
    Pool: class FakePool {
      constructor(options) {
        this.options = options;
      }
    },
  });

  assert.deepEqual(pool.options, {
    connectionString: "postgres://db",
  });
});

test("metadata migration includes core annotation tables", () => {
  const sql = METADATA_MIGRATIONS.map((migration) => migration.sql).join("\n");

  for (const table of [
    "projects",
    "tasks",
    "versions",
    "images",
    "annotations",
    "review_events",
    "training_sets",
    "export_records",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("runs metadata migrations transactionally and records applied ids", async () => {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/RETURNING id/.test(sql)) return { rowCount: 1, rows: [{ id: params[0] }] };
      return { rowCount: 0, rows: [] };
    },
  };

  const result = await runMetadataMigrations(pool, [{ id: "0001_test", sql: "CREATE TABLE test_table(id text);" }]);

  assert.deepEqual(result, { ok: true, applied: ["0001_test"] });
  assert.equal(queries[0].sql, "BEGIN");
  assert.equal(queries.at(-1).sql, "COMMIT");
});

test("verifies metadata DB connection with a simple query", async () => {
  const result = await verifyMetadataDb({
    async query(sql) {
      assert.equal(sql, "SELECT 1 AS ok");
      return { rows: [{ ok: 1 }] };
    },
  });

  assert.deepEqual(result, { ok: true });
});
