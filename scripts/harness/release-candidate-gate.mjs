import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
  const result = {
    ok: false,
    checked_at: new Date().toISOString(),
    cwd,
    artifacts: {},
    decisions: {},
    errors: [],
  };

  for (const [name, relativePath] of Object.entries(artifacts)) {
    result.artifacts[name] = await readArtifact({ cwd, name, relativePath, errors: result.errors });
  }

  const decisions = await readBoundaryDecisions(path.join(cwd, decisionsFile), result.errors);
  result.decisions = decisions;
  for (const boundary of REQUIRED_BOUNDARIES) {
    const decision = decisions[boundary] || "";
    if (!decision) {
      result.errors.push({ code: "boundary_decision_missing", boundary });
    } else if (/undecided/i.test(decision)) {
      result.errors.push({ code: "boundary_decision_undecided", boundary, decision });
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

async function readArtifact({ cwd, name, relativePath, errors }) {
  const file = path.join(cwd, relativePath);
  try {
    const payload = JSON.parse(await readFile(file, "utf8"));
    if (payload.ok !== true) {
      errors.push({ code: "artifact_failed", artifact: name, path: relativePath });
    }
    return {
      ok: payload.ok === true,
      path: relativePath,
      checked_at: payload.checked_at || "",
    };
  } catch (error) {
    errors.push({
      code: error.code === "ENOENT" ? "artifact_missing" : "artifact_invalid",
      artifact: name,
      path: relativePath,
      message: error.message,
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
    errors.push({ code: "boundary_decisions_missing", path: file, message: error.message });
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
  }
}

function isCliEntry() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}
