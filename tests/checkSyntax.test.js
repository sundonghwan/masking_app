import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { SYNTAX_CHECK_FILES } from "../scripts/harness/check-syntax.mjs";

test("package lint and typecheck use the shared syntax check harness", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(packageJson.scripts.lint, "node scripts/harness/check-syntax.mjs");
  assert.equal(packageJson.scripts.typecheck, "node scripts/harness/check-syntax.mjs");
});

test("syntax check file list covers existing active modules", async () => {
  assert.ok(SYNTAX_CHECK_FILES.includes("server.js"));
  assert.ok(SYNTAX_CHECK_FILES.includes("src/app.js"));
  assert.ok(SYNTAX_CHECK_FILES.includes("src/server/api.js"));
  assert.ok(SYNTAX_CHECK_FILES.includes("src/server/passwordPolicy.js"));
  assert.ok(SYNTAX_CHECK_FILES.includes("scripts/harness/check-syntax.mjs"));

  for (const file of SYNTAX_CHECK_FILES) {
    await access(file);
  }
});
