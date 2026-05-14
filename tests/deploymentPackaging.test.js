import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Dockerfile packages the app with healthcheck and writable data volume", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");

  assert.match(dockerfile, /FROM node:/);
  assert.match(dockerfile, /COPY package\.json package-lock\.json \.\//);
  assert.match(dockerfile, /RUN npm ci --omit=dev/);
  assert.match(dockerfile, /USER masking/);
  assert.match(dockerfile, /EXPOSE 4173/);
  assert.match(dockerfile, /VOLUME \["\/app\/data"\]/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
});

test("compose file exposes local staging defaults without binding the repo data directory", async () => {
  const compose = await readFile("docker-compose.yml", "utf8");

  assert.match(compose, /MASKING_APP_MODE=staging/);
  assert.match(compose, /MASKING_APP_HOST=0\.0\.0\.0/);
  assert.match(compose, /MASKING_APP_DATA_DIR=\/app\/data/);
  assert.match(compose, /MASKING_APP_STORAGE_BACKEND=\$\{MASKING_APP_STORAGE_BACKEND:-object-db\}/);
  assert.match(compose, /masking_app_data:\/app\/data/);
  assert.match(compose, /\$\{MASKING_APP_PORT:-4173\}:4173/);
});

test("compose file includes Postgres metadata DB and MinIO object storage services", async () => {
  const compose = await readFile("docker-compose.yml", "utf8");

  assert.match(compose, /postgres:/);
  assert.match(compose, /image: postgres:16-alpine/);
  assert.match(compose, /POSTGRES_DB=\$\{MASKING_APP_POSTGRES_DB:-masking_app\}/);
  assert.match(compose, /masking_postgres_data:\/var\/lib\/postgresql\/data/);
  assert.match(compose, /minio:/);
  assert.match(compose, /image: minio\/minio:/);
  assert.match(compose, /MASKING_APP_OBJECT_BUCKET=\$\{MASKING_APP_OBJECT_BUCKET:-masking-app\}/);
  assert.match(compose, /masking_minio_data:\/data/);
  assert.match(compose, /minio-init:/);
  assert.match(compose, /mc mb --ignore-existing local\/\$\$\{MASKING_APP_OBJECT_BUCKET\}/);
});

test("env example documents local storage dependency settings", async () => {
  const envExample = await readFile(".env.example", "utf8");

  assert.match(envExample, /MASKING_APP_STORAGE_BACKEND=object-db/);
  assert.match(envExample, /MASKING_APP_POSTGRES_DB=masking_app/);
  assert.match(envExample, /MASKING_APP_MINIO_ROOT_USER=masking/);
  assert.match(envExample, /MASKING_APP_OBJECT_BUCKET=masking-app/);
});

test("dockerignore excludes runtime data and local automation artifacts", async () => {
  const dockerignore = await readFile(".dockerignore", "utf8");

  assert.match(dockerignore, /^data\/$/m);
  assert.match(dockerignore, /^backups\/$/m);
  assert.match(dockerignore, /^\.playwright-cli\/$/m);
  assert.match(dockerignore, /^node_modules\/$/m);
});
