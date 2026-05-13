import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CONTROLLED_INTERNAL_MVP_DECISIONS = Object.freeze({
  Identity:
    "Controlled internal local identity accepted for non-internet-facing MVP; external IDP required before internet-facing deployment.",
  "Metadata storage":
    "Filesystem JSON accepted for one writable app process per data root; DB migration required before multi-process/shared-writer deployment.",
  "Network boundary":
    "Localhost or trusted internal network only; internet-facing deployment blocked until external IDP and TLS/reverse proxy evidence are approved.",
  "Backup/restore":
    "Scheduled host backup required before shared production use; staging may use manual operator-run backup/restore.",
  "Audit/log retention":
    "JSONL audit/runtime files accepted with host-managed retention schedule and owner.",
});

const PRESETS = Object.freeze({
  "controlled-internal-mvp": CONTROLLED_INTERNAL_MVP_DECISIONS,
});

if (isCliEntry()) {
  const args = process.argv.slice(2);
  const result = await applyBoundaryDecisionPreset({
    file: takeOption(args, "--file") || "docs/PRODUCTION_BOUNDARY_DECISIONS.md",
    preset: takeOption(args, "--preset") || "controlled-internal-mvp",
    owner: takeOption(args, "--owner"),
    date: takeOption(args, "--date"),
    apply: takeFlag(args, "--apply"),
  });

  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

export async function applyBoundaryDecisionPreset(options = {}) {
  const file = path.resolve(options.file || "docs/PRODUCTION_BOUNDARY_DECISIONS.md");
  const preset = options.preset || "controlled-internal-mvp";
  const decisions = PRESETS[preset];
  const owner = String(options.owner || "").trim();
  const date = String(options.date || "").trim();
  const apply = Boolean(options.apply);
  const result = {
    ok: false,
    applied: false,
    file,
    preset,
    owner,
    date,
    boundaries: [],
    decisions: decisions || {},
    errors: [],
  };

  if (!decisions) {
    result.errors.push({ code: "unknown_preset", preset });
    return result;
  }
  if (apply && !owner) {
    result.errors.push({ code: "owner_required" });
    return result;
  }
  if (apply && !date) {
    result.errors.push({ code: "date_required" });
    return result;
  }

  const original = await readFile(file, "utf8");
  const updated = updateDecisionTable(original, decisions);
  result.boundaries = Object.keys(decisions);
  result.ok = true;

  if (apply) {
    await writeFile(file, appendDecisionMetadata(updated, { owner, date, preset }), "utf8");
    result.applied = true;
  }

  return result;
}

function updateDecisionTable(text, decisions) {
  return text
    .split(/\r?\n/u)
    .map((line) => {
      const cells = parseMarkdownRow(line);
      const boundary = cells[0];
      if (cells.length < 5 || !Object.hasOwn(decisions, boundary)) return line;
      cells[4] = decisions[boundary];
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");
}

function appendDecisionMetadata(text, metadata) {
  const trimmed = text.trimEnd();
  return `${trimmed}

## Decision Approval Metadata

- Decision owner: ${metadata.owner}
- Decision date: ${metadata.date}
- Decision preset: ${metadata.preset}
`;
}

function parseMarkdownRow(line) {
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

function takeOption(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return "";
  const value = args[index + 1] || "";
  args.splice(index, 2);
  return value;
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
  if (!result.applied && result.ok) {
    console.error("apply-boundary-decisions: preview only; rerun with --apply after owner approval.");
  }
}

function isCliEntry() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}
