import pg from "pg";

export const METADATA_MIGRATIONS = Object.freeze([
  {
    id: "0001_initial_metadata",
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  project_id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  label_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  upload_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  task_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  current_version text NOT NULL DEFAULT 'v1',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, task_id)
);

CREATE TABLE IF NOT EXISTS versions (
  project_id text NOT NULL,
  task_id text NOT NULL,
  version_id text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  revision integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, task_id, version_id),
  FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, task_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS images (
  project_id text NOT NULL,
  task_id text NOT NULL,
  version_id text NOT NULL,
  image_id text NOT NULL,
  original_file_name text NOT NULL,
  object_key text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  worker_id text NOT NULL DEFAULT '',
  reviewer_id text NOT NULL DEFAULT '',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, task_id, version_id, image_id),
  FOREIGN KEY (project_id, task_id, version_id) REFERENCES versions(project_id, task_id, version_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS annotations (
  annotation_id text PRIMARY KEY,
  project_id text NOT NULL,
  task_id text NOT NULL,
  version_id text NOT NULL,
  image_id text NOT NULL,
  class_id integer NOT NULL,
  class_name text NOT NULL,
  mask_object_key text NOT NULL,
  mask_width integer NOT NULL,
  mask_height integer NOT NULL,
  mask_ratio double precision NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  score double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, task_id, version_id, image_id, class_id),
  FOREIGN KEY (project_id, task_id, version_id, image_id) REFERENCES images(project_id, task_id, version_id, image_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS review_events (
  event_id text PRIMARY KEY,
  project_id text NOT NULL,
  task_id text NOT NULL,
  version_id text NOT NULL,
  image_id text NOT NULL,
  reviewer_id text NOT NULL,
  action text NOT NULL,
  reason_code text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_sets (
  training_set_id text PRIMARY KEY,
  name text NOT NULL,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  split_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_records (
  export_id text PRIMARY KEY,
  project_id text NOT NULL,
  task_id text NOT NULL DEFAULT '',
  version_id text NOT NULL DEFAULT '',
  object_key text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
  {
    id: "0002_deletion_reason_metadata",
    sql: `
ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS deleted_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delete_reason text NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS images
  ADD COLUMN IF NOT EXISTS deleted_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delete_reason text NOT NULL DEFAULT '';
`,
  },
]);

export function createMetadataDbConfig(input = {}) {
  const databaseUrl = String(input.databaseUrl || input.connectionString || "").trim();
  if (!databaseUrl) throw new TypeError("metadata database URL is required");
  return {
    connectionString: databaseUrl,
  };
}

export function createMetadataDbPool(config, options = {}) {
  const Pool = options.Pool || pg.Pool;
  return new Pool({
    connectionString: config.connectionString,
  });
}

export async function runMetadataMigrations(pool, migrations = METADATA_MIGRATIONS) {
  if (!pool?.query) throw new TypeError("metadata database pool is required");
  const applied = [];
  for (const migration of migrations) {
    await pool.query("BEGIN");
    try {
      await pool.query(migration.sql);
      const result = await pool.query(
        "INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id",
        [migration.id],
      );
      await pool.query("COMMIT");
      if (result.rowCount > 0) applied.push(migration.id);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
  return {
    ok: true,
    applied,
  };
}

export async function verifyMetadataDb(pool) {
  if (!pool?.query) throw new TypeError("metadata database pool is required");
  const result = await pool.query("SELECT 1 AS ok");
  return {
    ok: result.rows?.[0]?.ok === 1,
  };
}
