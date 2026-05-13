import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { hasReleaseRelevantChanges, resolveSourceRevision } from "./source-revision.mjs";

const DEFAULT_ARTIFACTS = Object.freeze({
  staging_evidence: "release-artifacts/staging-evidence-20260513-after-identity-migration.json",
  deployment_check: "release-artifacts/deployment-check-20260513-production-local.json",
});

const REQUIRED_BOUNDARIES = Object.freeze([
  "Identity",
  "Metadata storage",
  "Network boundary",
  "Backup/restore",
  "Audit/log retention",
]);

const BOUNDARY_REMEDIATION = Object.freeze({
  Identity:
    "Record whether production accepts controlled local identity or requires an external IDP in docs/PRODUCTION_BOUNDARY_DECISIONS.md.",
  "Metadata storage":
    "Record whether production accepts single-process filesystem metadata or requires a SQLite/PostgreSQL migration in docs/PRODUCTION_BOUNDARY_DECISIONS.md.",
  "Network boundary":
    "Record whether deployment is localhost, trusted internal network, or internet-facing, and attach edge evidence using docs/RUNBOOK_NETWORK_EDGE.md.",
  "Backup/restore":
    "Record backup owner, schedule, and restore drill evidence using docs/RUNBOOK_OPERATIONS_SCHEDULING.md.",
  "Audit/log retention":
    "Record audit/log retention owner, schedule, and rotation or ingestion policy using docs/RUNBOOK_OPERATIONS_SCHEDULING.md.",
});

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const jsonOutput = takeFlag(args, "--json");
  const result = await checkReleaseCandidate({ cwd: process.cwd() });
  printResult(result, { jsonOutput });
  process.exit(result.ok ? 0 : 1);
}

export async function checkReleaseCandidate(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const artifacts = options.artifacts || DEFAULT_ARTIFACTS;
  const decisionsFile = options.decisionsFile || "docs/PRODUCTION_BOUNDARY_DECISIONS.md";
  const sourceRevision = options.sourceRevision || await resolveSourceRevision(cwd);
  const isRevisionStale = options.isRevisionStale || ((artifactRevision, targetRevision) =>
    hasReleaseRelevantChanges(artifactRevision, targetRevision, cwd));
  const result = {
    ok: false,
    checked_at: new Date().toISOString(),
    cwd,
    source_revision: sourceRevision,
    artifacts: {},
    decisions: {},
    errors: [],
  };

  if (!sourceRevision) {
    result.errors.push({
      code: "source_revision_unavailable",
      remediation: "Run the release candidate gate from a git checkout or pass a source revision through the harness.",
    });
  }

  for (const [name, relativePath] of Object.entries(artifacts)) {
    result.artifacts[name] = await readArtifact({ cwd, name, relativePath, sourceRevision, isRevisionStale, errors: result.errors });
  }

  const decisions = await readBoundaryDecisions(path.join(cwd, decisionsFile), result.errors);
  result.decisions = decisions;
  for (const boundary of REQUIRED_BOUNDARIES) {
    const decision = decisions[boundary] || "";
    if (!decision) {
      result.errors.push({
        code: "boundary_decision_missing",
        boundary,
        remediation: remediationForBoundary(boundary),
      });
    } else if (/undecided/i.test(decision)) {
      result.errors.push({
        code: "boundary_decision_undecided",
        boundary,
        decision,
        remediation: remediationForBoundary(boundary),
      });
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

async function readArtifact({ cwd, name, relativePath, sourceRevision, isRevisionStale, errors }) {
  const file = path.join(cwd, relativePath);
  try {
    const payload = JSON.parse(await readFile(file, "utf8"));
    if (payload.ok !== true) {
      errors.push({
        code: "artifact_failed",
        artifact: name,
        path: relativePath,
        remediation: remediationForArtifact(name, relativePath),
      });
    }
    if (sourceRevision && !payload.source_revision) {
      errors.push({
        code: "artifact_revision_missing",
        artifact: name,
        path: relativePath,
        expected_revision: sourceRevision,
        remediation: revisionRemediation(name, relativePath),
      });
    } else if (sourceRevision && payload.source_revision !== sourceRevision && await isRevisionStale(payload.source_revision, sourceRevision)) {
      errors.push({
        code: "artifact_revision_mismatch",
        artifact: name,
        path: relativePath,
        expected_revision: sourceRevision,
        actual_revision: payload.source_revision,
        remediation: revisionRemediation(name, relativePath),
      });
    }
    return {
      ok: payload.ok === true,
      path: relativePath,
      checked_at: payload.checked_at || "",
      source_revision: payload.source_revision || "",
    };
  } catch (error) {
    errors.push({
      code: error.code === "ENOENT" ? "artifact_missing" : "artifact_invalid",
      artifact: name,
      path: relativePath,
      message: error.message,
      remediation: remediationForArtifact(name, relativePath),
    });
    return {
      ok: false,
      path: relativePath,
      checked_at: "",
    };
  }
}

async function readBoundaryDecisions(file, errors) {
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    errors.push({
      code: "boundary_decisions_missing",
      path: file,
      message: error.message,
      remediation: "Create or restore docs/PRODUCTION_BOUNDARY_DECISIONS.md and fill the required boundary decision table.",
    });
    return {};
  }

  const decisions = {};
  for (const line of text.split(/\r?\n/u)) {
    const cells = parseMarkdownTableRow(line);
    if (cells.length < 5 || cells[0] === "Boundary" || cells[0].startsWith("---")) continue;
    decisions[cells[0]] = cells[4];
  }
  return decisions;
}

function parseMarkdownTableRow(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
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
  console.log(`release-candidate-gate: ${result.ok ? "passed" : "failed"}`);
  for (const error of result.errors) {
    const subject = error.artifact || error.boundary || error.path || "";
    console.error(`release-candidate-gate: error ${error.code}${subject ? ` ${subject}` : ""}`);
    if (error.remediation) {
      console.error(`release-candidate-gate: fix ${error.remediation}`);
    }
  }
}

function remediationForArtifact(name, relativePath) {
  if (name === "staging_evidence") {
    return `Run scripts/harness/staging-evidence.sh --json --output ${relativePath} against the target data root and archive a passing artifact.`;
  }
  if (name === "deployment_check") {
    return `Start the target server and run scripts/harness/deployment-check.sh --json <base-url>, then archive the passing artifact at ${relativePath}.`;
  }
  return `Regenerate or replace ${relativePath} with a passing release evidence artifact.`;
}

function revisionRemediation(name, relativePath) {
  return `Rerun ${name === "staging_evidence" ? "scripts/harness/staging-evidence.sh" : "scripts/harness/deployment-check.sh"} from the current checkout and archive the refreshed artifact at ${relativePath}.`;
}

function remediationForBoundary(boundary) {
  return BOUNDARY_REMEDIATION[boundary] || "Record the production boundary decision in docs/PRODUCTION_BOUNDARY_DECISIONS.md.";
}

function isCliEntry() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}
