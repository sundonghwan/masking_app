import { pathToFileURL } from "node:url";

import { createMetadataDbConfig, createMetadataDbPool, verifyMetadataDb } from "../../src/server/metadataDb.js";
import {
  createObjectStorageClient,
  createObjectStorageConfig,
  ensureObjectBucket,
  verifyObjectStorage,
} from "../../src/server/objectStorage.js";

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const ensureBucket = takeFlag(args, "--ensure-bucket");
  const result = await verifyObjectDb({
    databaseUrl: process.env.MASKING_APP_DATABASE_URL || "",
    objectEndpoint: process.env.MASKING_APP_OBJECT_ENDPOINT || "",
    objectRegion: process.env.MASKING_APP_OBJECT_REGION || "us-east-1",
    objectBucket: process.env.MASKING_APP_OBJECT_BUCKET || "masking-app",
    objectAccessKey: process.env.MASKING_APP_OBJECT_ACCESS_KEY || process.env.MASKING_APP_MINIO_ROOT_USER || "",
    objectSecretKey: process.env.MASKING_APP_OBJECT_SECRET_KEY || process.env.MASKING_APP_MINIO_ROOT_PASSWORD || "",
    ensureBucket,
  });
  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function verifyObjectDb(options = {}) {
  const result = {
    ok: true,
    checked_at: new Date().toISOString(),
    metadata_db: null,
    object_storage: null,
    object_references: null,
    errors: [],
  };

  let pool;
  let objectConfig;
  let client;
  try {
    pool = createMetadataDbPool(createMetadataDbConfig({ databaseUrl: options.databaseUrl }));
    result.metadata_db = await verifyMetadataDb(pool);
    if (!result.metadata_db.ok) {
      result.ok = false;
      result.errors.push({ code: "metadata_db_unhealthy" });
    }
  } catch (error) {
    result.ok = false;
    result.errors.push({ code: "metadata_db_verify_failed", ...formatError(error) });
  } finally {
    await pool?.end?.();
    pool = null;
  }

  try {
    objectConfig = createObjectStorageConfig(options);
    client = createObjectStorageClient(objectConfig);
    if (options.ensureBucket) {
      await ensureObjectBucket(client, objectConfig.bucket, { region: objectConfig.region });
    }
    result.object_storage = await verifyObjectStorage(client, objectConfig.bucket);
    if (!result.object_storage.ok) {
      result.ok = false;
      result.errors.push({ code: "object_bucket_missing", bucket: objectConfig.bucket });
    }
  } catch (error) {
    result.ok = false;
    result.errors.push({ code: "object_storage_verify_failed", ...formatError(error) });
  }

  if (result.metadata_db?.ok && result.object_storage?.ok) {
    try {
      pool = pool || createMetadataDbPool(createMetadataDbConfig({ databaseUrl: options.databaseUrl }));
      objectConfig = objectConfig || createObjectStorageConfig(options);
      client = client || createObjectStorageClient(objectConfig);
      result.object_references = await verifyObjectReferences(pool, client, objectConfig.bucket);
      if (result.object_references.missing > 0) {
        result.ok = false;
        result.errors.push({
          code: "object_reference_missing",
          missing: result.object_references.missing,
          sample: result.object_references.missing_keys.slice(0, 5),
        });
      }
    } catch (error) {
      result.ok = false;
      result.errors.push({ code: "object_reference_verify_failed", ...formatError(error) });
    } finally {
      await pool?.end?.();
      pool = null;
    }
  }

  return result;
}

export async function verifyObjectReferences(pool, client, bucket) {
  const { rows } = await pool.query(`
SELECT object_key FROM images WHERE object_key <> ''
UNION
SELECT mask_object_key AS object_key FROM annotations WHERE mask_object_key <> ''
ORDER BY object_key
`);
  const missingKeys = [];
  for (const row of rows) {
    const objectKey = row.object_key;
    try {
      await client.statObject(bucket, objectKey);
    } catch (error) {
      missingKeys.push(objectKey);
    }
  }
  return {
    ok: missingKeys.length === 0,
    checked: rows.length,
    missing: missingKeys.length,
    missing_keys: missingKeys,
  };
}

function formatError(error) {
  if (error instanceof AggregateError) {
    return {
      message: error.message || error.code || error.name,
      causes: error.errors.map((cause) => ({
        message: cause.message || cause.code || cause.name,
        code: cause.code,
      })),
    };
  }
  return {
    message: error?.message || error?.code || String(error),
    code: error?.code,
  };
}

function takeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function printResult(result, options = {}) {
  if (options.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`object-db-verify: ${result.ok ? "passed" : "failed"}`);
  for (const error of result.errors) {
    console.error(`object-db-verify: error ${error.code}${error.message ? `: ${error.message}` : ""}`);
  }
}
