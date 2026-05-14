import { pathToFileURL } from "node:url";

import {
  createMetadataDbConfig,
  createMetadataDbPool,
  runMetadataMigrations,
  verifyMetadataDb,
} from "../../src/server/metadataDb.js";

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const databaseUrl = args[0] || process.env.MASKING_APP_DATABASE_URL || "";
  const result = await migrate({ databaseUrl });
  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function migrate(options = {}) {
  const result = {
    ok: true,
    checked_at: new Date().toISOString(),
    database_configured: Boolean(options.databaseUrl),
    connection: null,
    migration: null,
    errors: [],
  };

  let pool;
  try {
    const config = createMetadataDbConfig({ databaseUrl: options.databaseUrl });
    pool = createMetadataDbPool(config);
    result.connection = await verifyMetadataDb(pool);
    result.migration = await runMetadataMigrations(pool);
  } catch (error) {
    result.ok = false;
    result.errors.push({ code: "metadata_db_migration_failed", ...formatError(error) });
  } finally {
    await pool?.end?.();
  }
  return result;
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
  console.log(`db-migrate: ${result.ok ? "passed" : "failed"}`);
  if (result.migration) {
    console.log(`db-migrate: applied=${result.migration.applied.length}`);
  }
  for (const error of result.errors) {
    console.error(`db-migrate: error ${error.code}: ${error.message}`);
  }
}
