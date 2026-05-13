# Task: release-evidence-revision-gate

## Goal
- Prevent stale release artifacts from being accepted after code changes.

## Scope
- Add source revision metadata to harness evidence producers where practical.
- Make the release candidate gate fail when required artifacts lack revision
  metadata or do not match the checked repository revision.
- Keep the existing unresolved boundary decision failures intact.

## Non-goals
- Regenerating final staging or deployment evidence.
- Choosing production boundary decisions.
- Requiring capacity profile evidence in the release candidate gate.

## Touched areas
- `scripts/harness/release-candidate-gate.mjs`
- `scripts/harness/staging-evidence.mjs`
- `scripts/harness/deployment-check.mjs`
- `scripts/harness/capacity-profile.mjs`
- related tests and harness docs

## Risks
- A too-strict revision gate could block evidence generated from packaged builds
  where git metadata is unavailable.
- A too-loose gate could keep accepting stale release artifacts.

## Impact Chains
### suspected
- release artifact -> source_revision check -> release candidate decision
- evidence producer -> source_revision field -> archived artifact

### validated
- checkReleaseCandidate (scripts/harness/release-candidate-gate.mjs:24-82) -> readArtifact (scripts/harness/release-candidate-gate.mjs:85-139) -> artifact_revision_missing/artifact_revision_mismatch
  - validation: `node --test tests/releaseCandidateGate.test.js`
- resolveSourceRevision (scripts/harness/source-revision.mjs:6-14) -> collectStagingEvidence (scripts/harness/staging-evidence.mjs:39-64)
  - validation: `node --test tests/stagingEvidence.test.js`
- resolveSourceRevision (scripts/harness/source-revision.mjs:6-14) -> profileCapacity (scripts/harness/capacity-profile.mjs:29-55)
  - validation: `node --test tests/capacityProfile.test.js`

### discarded
- Production boundary decisions.
  - reason: this task only improves evidence freshness checks.

## Validation Plan
- RED/GREEN: `node --test tests/releaseCandidateGate.test.js tests/stagingEvidence.test.js tests/capacityProfile.test.js`
- `scripts/harness/release-candidate-gate.sh --json` expected failure includes stale/missing revision remediation for existing artifacts
- `scripts/harness/test-target.sh`
- `git diff --check`

## Progress Notes
- Existing staging and deployment artifacts contain `ok: true` but no source
  revision metadata, so code changes after artifact capture are not visible to
  the gate.
- RED verified: release candidate gate accepted artifacts without current
  source revision checks, and evidence producer tests lacked source revision
  fields before implementation.

## Closeout
- Added shared `resolveSourceRevision` helper using
  `MASKING_APP_SOURCE_REVISION` or `git rev-parse HEAD`.
- Added `source_revision` to staging evidence, deployment check, and capacity
  profile JSON outputs.
- Release candidate gate now fails required artifacts that lack revision
  metadata or mismatch the gate target revision.
- Release candidate gate allows a later artifact/documentation commit when no
  release-relevant files changed since the artifact revision.
- Current gate is expected to fail on the older archived staging/deployment
  artifacts because they predate this metadata.
- Validation:
  - `node --test tests/releaseCandidateGate.test.js tests/stagingEvidence.test.js tests/capacityProfile.test.js tests/checkSyntax.test.js` passed, 14 tests
  - `scripts/harness/lint-all.sh` passed
  - `scripts/harness/typecheck-all.sh` passed
  - `scripts/harness/test-target.sh` passed, 325 tests
  - `scripts/harness/smoke-web.sh` passed
  - `scripts/harness/release-candidate-gate.sh --json` expected-failed with artifact revision and boundary decision blockers
  - `git diff --check` passed
- Code review: no blocking findings; gate is stricter and correctly refuses
  old artifacts that cannot be tied to the current source revision.
