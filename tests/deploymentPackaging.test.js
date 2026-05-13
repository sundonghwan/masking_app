import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Dockerfile packages the app with healthcheck and writable data volume", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");

  assert.match(dockerfile, /FROM node:/);
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
  assert.match(compose, /masking_app_data:\/app\/data/);
  assert.match(compose, /4173:4173/);
});

test("dockerignore excludes runtime data and local automation artifacts", async () => {
  const dockerignore = await readFile(".dockerignore", "utf8");

  assert.match(dockerignore, /^data\/$/m);
  assert.match(dockerignore, /^backups\/$/m);
  assert.match(dockerignore, /^\.playwright-cli\/$/m);
  assert.match(dockerignore, /^node_modules\/$/m);
});
