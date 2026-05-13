# Task: project-image-audit-events

## Goal
- Record operational audit events for project lifecycle and image delete/restore actions.

## Scope
- Project create, archive, restore, and purge API routes.
- Image soft delete and restore API routes.
- Server API tests and production readiness/security tracking docs.

## Non-goals
- Review transition audit events.
- Export or training-set audit events.
- Audit retention and verification scripts.
- UI changes.

## Touched areas
- `src/server/api.js`
- `tests/serverApi.test.js`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Audit writes must not block successful route behavior.
- Audit metadata must not include uploaded image bytes, data URLs, passwords, or tokens.
- Session login events can appear in route tests and must not make lifecycle assertions brittle.

## Impact Chains
### suspected
- None remaining.

### validated
- routeApi project create (src/server/api.js:250-284) -> storage.writeProjectManifest (src/server/api.js:270-270) -> recordAuditEvent (src/server/api.js:1098-1114)
- routeProject archive/restore/purge (src/server/api.js:331-430) -> storage archive helpers (src/server/api.js:339-416) -> recordAuditEvent (src/server/api.js:1098-1114)
- routeImage delete/restore (src/server/api.js:774-830) -> updateProjectImageDeletion (src/server/api.js:779-812) -> recordAuditEvent (src/server/api.js:1098-1114)

### discarded
- Review transition audit events.
  - reason: tracked as the next route family after project/image lifecycle coverage.

## Validation Plan
- RED/GREEN: `node --test tests/serverApi.test.js`
- Full server/unit suite: `scripts/harness/test-target.sh`
- Syntax sensors: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Harness smoke: `scripts/harness/smoke-web.sh`
- Whitespace review: `git diff --check`

## Progress Notes
- Started after session/user audit route coverage was committed and pushed.
- RED confirmed missing project/image lifecycle audit route events.
- GREEN confirmed project create/archive/restore/purge and image delete/restore route audit events.

## Closeout
- Targeted `tests/serverApi.test.js` passed with 61 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 298 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issues; checked secret/data-url metadata exposure, audit failure non-blocking behavior through existing helper, and review/export audit non-overclaiming.
