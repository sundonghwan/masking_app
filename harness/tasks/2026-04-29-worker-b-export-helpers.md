# Task: worker-b-export-helpers

## Goal

- Implement dependency-free browser export/data helpers for project records,
  image records, export validation summaries, `annotations.json`,
  `export_summary.json`, and per-file downloads.

## Scope

- `src/export/exporter.js`
- `tests/exporter.test.js`
- Harness task/run-log notes for this task.

## Non-goals

- Editing app shell, canvas editor, styles, or harness scripts.
- Building ZIP archive generation.
- Implementing backend APIs, storage writes, uploads, or mask PNG decoding.

## Touched Areas

- Export data contract helpers.
- Browser download helper boundary.
- Fixture-style unit tests for export metadata and exclusions.

## Risks

- Export metadata could use absolute paths instead of archive-relative paths.
- Invalid images could be included in export annotations.
- Summary counts and exclusion reasons could drift from validation decisions.
- Browser download helpers could leak object URLs.

## Impact Chains

### suspected

- `createValidationSummary (src/export/exporter.js:77-104) -> createAnnotationsJson (src/export/exporter.js:175-203)`
- `createValidationSummary (src/export/exporter.js:77-104) -> createExportSummaryJson (src/export/exporter.js:205-225)`
- `downloadBlobFile (src/export/exporter.js:296-335) -> URL.revokeObjectURL (src/export/exporter.js:326-328)`

### validated

- `createValidationSummary (src/export/exporter.js:77-104) -> createAnnotationsJson (src/export/exporter.js:175-203)`
  - validation: `node --test tests/exporter.test.js`, tests "summarizes valid
    exports and exclusion reasons" and "creates annotations.json with
    archive-relative paths only", passed.
- `createValidationSummary (src/export/exporter.js:77-104) -> createExportSummaryJson (src/export/exporter.js:205-225)`
  - validation: `node --test tests/exporter.test.js`, test "creates
    export_summary.json from the same validation decisions", passed.
- `downloadBlobFile (src/export/exporter.js:296-335) -> URL.revokeObjectURL (src/export/exporter.js:326-328)`
  - validation: `node --test tests/exporter.test.js`, test "creates JSON blobs
    and per-file downloads with URL cleanup", passed.

### discarded

- Export ZIP assembly
  - reason: Worker B scope is browser helpers only; no archive writer is being
    implemented.

## Validation Plan

- `node --test tests/exporter.test.js` -> fixture export test for valid,
  excluded, metadata, JSON serialization, and browser download side effects.
- `scripts/harness/lint-all.sh` -> detect lint availability for the repo.
- `scripts/harness/typecheck-all.sh` -> detect typecheck availability.
- `scripts/harness/test-target.sh exporter` -> detect configured test command
  availability.

## Progress Notes

- The repository has planning, design, harness, and docs but no package stack.
- Export policy from `docs/ARCHITECTURE.md`: include valid `submitted` images,
  exclude `not_started` and invalid images, and use archive-relative metadata
  paths.
- Implemented the helpers as a dependency-free ES module, with browser side
  effects isolated to `downloadBlobFile`, `downloadJsonFile`, and
  `downloadTextFile`.
- Targeted unit tests use Node's built-in `node:test` runner because the repo
  has no package test script yet.

## Findings

- No reusable playbook change is needed yet; backend playbook already names the
  export fixture checks this task needs.

## File-back Candidates

- None currently.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
