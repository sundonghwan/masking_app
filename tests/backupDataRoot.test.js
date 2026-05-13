import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { backupDataRoot } from "../scripts/harness/backup-data-root.mjs";

const execFilePromise = promisify(execFile);

test("backup data root creates an archive outside the active data root", async () => {
  const dataRoot = await createDataRootFixture("masking-backup-data-root-test-");
  const backupDir = await mkdtemp(path.join(os.tmpdir(), "masking-backup-output-test-"));

  const result = await backupDataRoot({
    dataRoot,
    backupDir,
    timestamp: "20260513T010203Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.archive_file, path.join(backupDir, "masking-app-data-20260513T010203Z.tgz"));
  assert.equal(result.manifest_file, path.join(backupDir, "masking-app-data-20260513T010203Z.json"));
  assert.ok((await stat(result.archive_file)).isFile());
  assert.ok((await stat(result.manifest_file)).isFile());

  const { stdout } = await execFilePromise("tar", ["-tzf", result.archive_file]);
  assert.match(stdout, /data-root\/project-a\/manifest\.json/);
  assert.match(stdout, /data-root\/project-a\/images\/image-a\.png/);
});

test("backup data root applies retention to old generated backups", async () => {
  const dataRoot = await createDataRootFixture("masking-backup-retention-data-");
  const backupDir = await mkdtemp(path.join(os.tmpdir(), "masking-backup-retention-output-"));

  await writeFile(path.join(backupDir, "masking-app-data-20260513T000000Z.tgz"), "oldest");
  await writeFile(path.join(backupDir, "masking-app-data-20260513T000000Z.json"), "{}\n");
  await writeFile(path.join(backupDir, "masking-app-data-20260513T000100Z.tgz"), "middle");
  await writeFile(path.join(backupDir, "masking-app-data-20260513T000100Z.json"), "{}\n");

  const result = await backupDataRoot({
    dataRoot,
    backupDir,
    timestamp: "20260513T000200Z",
    retentionCount: 2,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.retention.deleted_archives, [
    path.join(backupDir, "masking-app-data-20260513T000000Z.tgz"),
  ]);

  const entries = await readdir(backupDir);
  assert.equal(entries.includes("masking-app-data-20260513T000000Z.tgz"), false);
  assert.equal(entries.includes("masking-app-data-20260513T000000Z.json"), false);
  assert.equal(entries.includes("masking-app-data-20260513T000100Z.tgz"), true);
  assert.equal(entries.includes("masking-app-data-20260513T000200Z.tgz"), true);
});

test("backup data root rejects backup directories inside the active data root", async () => {
  const dataRoot = await createDataRootFixture("masking-backup-nested-data-");
  const backupDir = path.join(dataRoot, "backups");

  const result = await backupDataRoot({ dataRoot, backupDir });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "backup_dir_inside_data_root");
});

async function createDataRootFixture(prefix) {
  const parent = await mkdtemp(path.join(os.tmpdir(), prefix));
  const dataRoot = path.join(parent, "data-root");
  const projectRoot = path.join(dataRoot, "project-a");
  await mkdir(path.join(projectRoot, "images"), { recursive: true });
  await writeFile(path.join(projectRoot, "manifest.json"), JSON.stringify({ project_id: "project-a", images: [] }));
  await writeFile(path.join(projectRoot, "images", "image-a.png"), "image-bytes");
  return dataRoot;
}
