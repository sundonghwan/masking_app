import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyBoundaryDecisionPreset,
  CONTROLLED_INTERNAL_MVP_DECISIONS,
} from "../scripts/harness/apply-boundary-decisions.mjs";

test("applyBoundaryDecisionPreset previews controlled internal MVP decisions without writing", async () => {
  const file = await createDecisionDoc();
  const before = await readFile(file, "utf8");

  const result = await applyBoundaryDecisionPreset({
    file,
    preset: "controlled-internal-mvp",
    owner: "release-owner",
    date: "2026-05-13",
    apply: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.boundaries.length, 5);
  assert.equal(result.decisions.Identity, CONTROLLED_INTERNAL_MVP_DECISIONS.Identity);
  assert.equal(await readFile(file, "utf8"), before);
});

test("applyBoundaryDecisionPreset applies controlled internal MVP decisions with owner metadata", async () => {
  const file = await createDecisionDoc();

  const result = await applyBoundaryDecisionPreset({
    file,
    preset: "controlled-internal-mvp",
    owner: "release-owner",
    date: "2026-05-13",
    apply: true,
  });

  const text = await readFile(file, "utf8");
  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.match(text, /Controlled internal local identity accepted/);
  assert.match(text, /Decision owner: release-owner/);
  assert.match(text, /Decision date: 2026-05-13/);
  assert.doesNotMatch(text, /\| Identity .* Undecided \|/);
});

test("applyBoundaryDecisionPreset refuses apply without owner metadata", async () => {
  const file = await createDecisionDoc();

  const result = await applyBoundaryDecisionPreset({
    file,
    preset: "controlled-internal-mvp",
    owner: "",
    date: "2026-05-13",
    apply: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.applied, false);
  assert.equal(result.errors[0].code, "owner_required");
});

async function createDecisionDoc() {
  const root = await mkdtemp(path.join(os.tmpdir(), "masking-boundary-decisions-"));
  const file = path.join(root, "PRODUCTION_BOUNDARY_DECISIONS.md");
  await writeFile(
    file,
    `# Production Boundary Decisions

| Boundary | Option A | Option B | Current recommendation | Decision |
| --- | --- | --- | --- | --- |
| Identity | A | B | recommendation | Undecided |
| Metadata storage | A | B | recommendation | Undecided |
| Network boundary | A | B | recommendation | Undecided |
| Backup/restore | A | B | recommendation | Undecided |
| Audit/log retention | A | B | recommendation | Undecided |
| AI adapter | A | B | recommendation | Deferred |

## Current Verdict

The current build should not be called fully production-ready until this
document has explicit decisions for the target deployment.
`,
  );
  return file;
}
