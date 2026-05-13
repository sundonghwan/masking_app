import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkReleaseCandidate } from "../scripts/harness/release-candidate-gate.mjs";

test("checkReleaseCandidate passes with ok artifacts and explicit decisions", async () => {
  const root = await createReleaseFixture({
    stagingOk: true,
    deploymentOk: true,
    sourceRevision: "current-revision",
    decisions: ["local accepted", "filesystem accepted", "internal", "scheduled", "host-managed", "deferred"],
  });

  const result = await checkReleaseCandidate({
    cwd: root,
    artifacts: fixtureArtifacts(),
    sourceRevision: "current-revision",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.artifacts.staging_evidence.ok, true);
  assert.equal(result.artifacts.deployment_check.ok, true);
});

test("checkReleaseCandidate fails when artifacts lack the current source revision", async () => {
  const root = await createReleaseFixture({
    stagingOk: true,
    deploymentOk: true,
    sourceRevision: "old-revision",
    decisions: ["local accepted", "filesystem accepted", "internal", "scheduled", "host-managed", "deferred"],
    omitStagingRevision: true,
  });

  const result = await checkReleaseCandidate({
    cwd: root,
    artifacts: fixtureArtifacts(),
    sourceRevision: "current-revision",
  });

  assert.equal(result.ok, false);
  const missingError = result.errors.find(
    (error) => error.code === "artifact_revision_missing" && error.artifact === "staging_evidence",
  );
  const mismatchError = result.errors.find(
    (error) => error.code === "artifact_revision_mismatch" && error.artifact === "deployment_check",
  );
  assert.ok(missingError);
  assert.match(missingError.remediation, /rerun/i);
  assert.ok(mismatchError);
  assert.equal(mismatchError.expected_revision, "current-revision");
  assert.equal(mismatchError.actual_revision, "old-revision");
});

test("checkReleaseCandidate fails when a required artifact is missing", async () => {
  const root = await createReleaseFixture({
    stagingOk: true,
    deploymentOk: true,
    decisions: ["local accepted", "filesystem accepted", "internal", "scheduled", "host-managed", "deferred"],
    omitDeployment: true,
  });

  const result = await checkReleaseCandidate({ cwd: root, artifacts: fixtureArtifacts() });

  assert.equal(result.ok, false);
  const error = result.errors.find((item) => item.code === "artifact_missing" && item.artifact === "deployment_check");
  assert.ok(error);
  assert.match(error.remediation, /deployment-check/i);
});

test("checkReleaseCandidate fails for failed artifact payloads and undecided boundaries", async () => {
  const root = await createReleaseFixture({
    stagingOk: false,
    deploymentOk: true,
    decisions: ["Undecided", "filesystem accepted", "Undecided", "scheduled", "host-managed", "deferred"],
  });

  const result = await checkReleaseCandidate({ cwd: root, artifacts: fixtureArtifacts() });

  assert.equal(result.ok, false);
  const stagingError = result.errors.find(
    (error) => error.code === "artifact_failed" && error.artifact === "staging_evidence",
  );
  const identityError = result.errors.find(
    (error) => error.code === "boundary_decision_undecided" && error.boundary === "Identity",
  );
  const networkError = result.errors.find(
    (error) => error.code === "boundary_decision_undecided" && error.boundary === "Network boundary",
  );
  assert.ok(stagingError);
  assert.match(stagingError.remediation, /staging-evidence\.sh/i);
  assert.ok(identityError);
  assert.match(identityError.remediation, /local identity|external IDP/i);
  assert.ok(networkError);
  assert.match(networkError.remediation, /RUNBOOK_NETWORK_EDGE/i);
});

async function createReleaseFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "masking-app-release-gate-"));
  await mkdir(path.join(root, "release-artifacts"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });

  await writeFile(
    path.join(root, "release-artifacts", "staging-evidence.json"),
    `${JSON.stringify(artifactPayload(options.stagingOk, options, "staging"))}\n`,
  );
  if (!options.omitDeployment) {
    await writeFile(
      path.join(root, "release-artifacts", "deployment-check.json"),
      `${JSON.stringify(artifactPayload(options.deploymentOk, options, "deployment"))}\n`,
    );
  }
  await writeFile(
    path.join(root, "docs", "PRODUCTION_BOUNDARY_DECISIONS.md"),
    createDecisionDoc(options.decisions || []),
  );

  return root;
}

function artifactPayload(ok, options, artifact) {
  const payload = { ok };
  if (options.sourceRevision && !(artifact === "staging" && options.omitStagingRevision)) {
    payload.source_revision = options.sourceRevision;
  }
  return payload;
}

function createDecisionDoc(decisions) {
  const [identity, storage, network, backup, retention, ai] = decisions;
  return `# Production Boundary Decisions

| Boundary | Option A | Option B | Current recommendation | Decision |
| --- | --- | --- | --- | --- |
| Identity | A | B | recommendation | ${identity} |
| Metadata storage | A | B | recommendation | ${storage} |
| Network boundary | A | B | recommendation | ${network} |
| Backup/restore | A | B | recommendation | ${backup} |
| Audit/log retention | A | B | recommendation | ${retention} |
| AI adapter | A | B | recommendation | ${ai} |
`;
}

function fixtureArtifacts() {
  return {
    staging_evidence: "release-artifacts/staging-evidence.json",
    deployment_check: "release-artifacts/deployment-check.json",
  };
}
