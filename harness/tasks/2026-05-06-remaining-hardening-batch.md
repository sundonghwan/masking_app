# Task: remaining-hardening-batch

## Goal

- Implement the remaining non-model hardening items: deployment profile,
  legacy manifest repair, and generic AI API serving contract.

## Scope

- Server runtime deployment profile and health exposure.
- Admin-only legacy manifest repair preview/apply API.
- Generic AI serving endpoint contract with deterministic placeholder response.
- API client and focused tests for the new contracts.
- Feature status/checkpoint documentation updates.

## Non-goals

- Production identity provider.
- Real model inference, GPU runtime, model download, or external AI service.
- Database migration.
- COCO/RLE or multi-class export.

## Risks

- Runtime env changes can make local dev startup brittle.
- Repair flows can mutate project manifests incorrectly.
- AI API can accidentally look like a real inference implementation.
- New admin routes can bypass bearer-session RBAC if wired too broadly.

## Impact Chains

### suspected

- `server startup (server.js:*) -> resolveDeploymentProfile (src/server/deploymentProfile.js:*) -> createFileStorage/createUserDirectory/createSessionStore`
- `routeProject repair (src/server/api.js:*) -> storage.repairProjectManifest (src/server/storage.js:*) -> writeProjectManifest (src/server/storage.js:*)`
- `apiClient AI methods (src/api/client.js:*) -> routeAi (src/server/api.js:*) -> createAiServingResponse (src/server/aiServing.js:*)`

### validated

- `server startup (server.js:16-72) -> resolveDeploymentProfile (src/server/deploymentProfile.js:6-30) -> createFileStorage/createUserDirectory/createSessionStore`
  - validation: `node --test tests/deploymentProfile.test.js tests/serverApi.test.js`
  - validation: live smoke with `MASKING_APP_HOST=127.0.0.1 MASKING_APP_AI_SERVING=1 npm run dev`
- `routeProject repair (src/server/api.js:285-300) -> storage.repairProjectManifest (src/server/storage.js:112-127) -> repairProjectManifestRecord (src/server/storage.js:973-1055) -> writeProjectManifest (src/server/storage.js:42-58)`
  - validation: `node --test tests/serverStorage.test.js tests/serverApi.test.js`
- `apiClient AI methods (src/api/client.js:128-144) -> routeAi (src/server/api.js:47-60) -> createAiServingResponse (src/server/aiServing.js:25-80)`
  - validation: `node --test tests/apiClient.test.js tests/serverApi.test.js`
  - validation: live smoke `/api/ai/capabilities` and `/api/ai/infer`

### discarded

- Real model-backed segmentation adapter.
  - reason: current task only establishes the generic serving contract.
- Physical migration of legacy manifests into hierarchy storage.
  - reason: repair should first normalize broken legacy records in place.

## Validation Plan

- RED/GREEN focused tests:
  - `node --test tests/deploymentProfile.test.js tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js`
- Full harness:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Live smoke:
  - `/api/health`
  - admin login
  - `/api/ai/capabilities`

## Progress Notes

- 2026-05-06: User requested continuing all remaining feature development.
- Added deployment profile resolver and exposed safe deployment/AI serving state
  through health.
- Added admin-only legacy manifest repair with preview/apply behavior.
- Added generic AI serving capabilities/infer contract with stub predictions and
  explicit `model: null`.
- Code review found repair normalizer could preserve an invalid legacy `maskPath`
  in `mask_path`; fixed by deriving both current and legacy mask path fields from
  the sanitized archive reference.

## Closeout

- Validation passed:
  - `node --test tests/deploymentProfile.test.js tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
  - live smoke: `/api/health`, admin login, `/api/ai/capabilities`,
    `/api/ai/infer`, `/`
- Review checklist performed. No blocking issue remains.
