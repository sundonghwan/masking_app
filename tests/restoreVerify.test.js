import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { backupDataRoot } from "../scripts/harness/backup-data-root.mjs";
import { verifyBackupRestore } from "../scripts/harness/restore-verify.mjs";

test("restore verify extracts a backup archive and runs storage verification", async () => {
  const dataRoot = await createRestoreFixture();
  const backupDir = await mkdtemp(path.join(os.tmpdir(), "masking-restore-backup-"));
  const backup = await backupDataRoot({
    dataRoot,
    backupDir,
    timestamp: "20260513T030000Z",
  });

  const result = await verifyBackupRestore({ archiveFile: backup.archive_file });

  assert.equal(result.ok, true);
  assert.equal(result.archive_file, backup.archive_file);
  assert.ok((await stat(result.restore_parent)).isDirectory());
  assert.ok((await stat(result.restored_data_root)).isDirectory());
  assert.equal(result.storage_verify.ok, true);
});

test("restore verify rejects missing archives", async () => {
  const result = await verifyBackupRestore({
    archiveFile: path.join(os.tmpdir(), "missing-masking-backup.tgz"),
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "archive_missing");
});

async function createRestoreFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "masking-restore-data-"));
  const dataRoot = path.join(parent, "data-root");
  const projectRoot = path.join(dataRoot, "project-a");
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, "manifest.json"), JSON.stringify({ project_id: "project-a", images: [] }));
  return dataRoot;
}
