import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);

export const SYNTAX_CHECK_FILES = Object.freeze([
  "server.js",
  "src/app.js",
  "src/api/client.js",
  "src/annotations/aiPredictions.js",
  "src/annotations/labels.js",
  "src/annotations/records.js",
  "src/assignment/queue.js",
  "src/dashboard/summary.js",
  "src/editor/maskEditor.js",
  "src/export/exporter.js",
  "src/export/indexedMask.js",
  "src/export/trainingSet.js",
  "src/export/zip.js",
  "src/storage/projectStore.js",
  "src/observability/logger.js",
  "src/review/policy.js",
  "src/ui/html.js",
  "src/upload/policy.js",
  "src/server/aiServing.js",
  "src/server/api.js",
  "src/server/auth.js",
  "src/server/deploymentProfile.js",
  "src/server/httpSecurity.js",
  "src/server/httpUtils.js",
  "src/server/imageMetadata.js",
  "src/server/maskValidation.js",
  "src/server/passwords.js",
  "src/server/sessionStore.js",
  "src/server/sessionToken.js",
  "src/server/storage.js",
  "src/server/userDirectory.js",
  "scripts/harness/browser-e2e.mjs",
  "scripts/harness/storage-verify.mjs",
  "scripts/harness/deployment-check.mjs",
  "scripts/harness/security-check.mjs",
  "scripts/harness/identity-migrate-passwords.mjs",
  "scripts/harness/capacity-profile.mjs",
  "scripts/harness/backup-data-root.mjs",
  "scripts/harness/restore-verify.mjs",
  "scripts/harness/check-syntax.mjs",
]);

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await checkSyntax();
}

export async function checkSyntax(files = SYNTAX_CHECK_FILES) {
  for (const file of files) {
    await access(file);
    await execFilePromise(process.execPath, ["--check", file], {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
  }
}
