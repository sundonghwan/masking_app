import { pathToFileURL } from "node:url";

import { migrateFileStorageToObjectDb } from "../../src/server/fileStorageObjectDbMigration.js";
import { createMetadataDbConfig, createMetadataDbPool } from "../../src/server/metadataDb.js";
import { createObjectStorageClient, createObjectStorageConfig, ensureObjectBucket } from "../../src/server/objectStorage.js";

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const apply = takeFlag(args, "--apply");
  const rootDir = takeOption(args, "--data-root") || process.env.MASKING_APP_DATA_DIR || process.env.MASKING_APP_DATA_ROOT || "data";
  const result = await runMigration({
    rootDir,
    dryRun: !apply,
    databaseUrl: process.env.MASKING_APP_DATABASE_URL || "",
    objectEndpoint: process.env.MASKING_APP_OBJECT_ENDPOINT || "",
    objectRegion: process.env.MASKING_APP_OBJECT_REGION || "us-east-1",
    objectBucket: process.env.MASKING_APP_OBJECT_BUCKET || "masking-app",
    objectAccessKey: process.env.MASKING_APP_OBJECT_ACCESS_KEY || process.env.MASKING_APP_MINIO_ROOT_USER || "",
    objectSecretKey: process.env.MASKING_APP_OBJECT_SECRET_KEY || process.env.MASKING_APP_MINIO_ROOT_PASSWORD || "",
  }).catch((error) => ({
    ok: false,
    dry_run: !apply,
    root_dir: rootDir,
    errors: [{ code: "file_storage_object_db_migration_failed", ...formatError(error) }],
  }));
  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function runMigration(options = {}) {
  let pool;
  try {
    if (options.dryRun !== false) {
      return migrateFileStorageToObjectDb({ rootDir: options.rootDir, dryRun: true });
    }

    const dbConfig = createMetadataDbConfig({ databaseUrl: options.databaseUrl });
    const objectConfig = createObjectStorageConfig(options);
    pool = createMetadataDbPool(dbConfig);
    const objectClient = createObjectStorageClient(objectConfig);
    await ensureObjectBucket(objectClient, objectConfig.bucket, { region: objectConfig.region });

    return await migrateFileStorageToObjectDb({
      rootDir: options.rootDir,
      dryRun: false,
      pool,
      objectClient,
      bucket: objectConfig.bucket,
    });
  } finally {
    await pool?.end?.();
  }
}

function takeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function takeOption(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return "";
  const value = args[index + 1] || "";
  args.splice(index, 2);
  return value;
}

function printResult(result, options = {}) {
  if (options.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`file-storage-object-db-migration: ${result.ok ? "passed" : "failed"}`);
  console.log(`file-storage-object-db-migration: dry_run=${result.dry_run} sources=${result.sources} images=${result.images} annotations=${result.annotations} objects=${result.uploaded_objects}`);
  for (const error of result.errors || []) {
    console.error(`file-storage-object-db-migration: error ${error.code}: ${error.path || error.message || ""}`);
  }
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
