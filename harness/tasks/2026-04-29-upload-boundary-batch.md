# Task: upload-boundary-batch

## Goal
- Stabilize image ingest before adding larger dataset and review flows.

## Scope
- Shared upload file policy.
- Frontend rejection feedback.
- Server-side upload validation before manifest mutation.

## Non-goals
- Multipart upload implementation.
- Server-side image dimension extraction.
- Full image decode beyond current data URL metadata validation.

## Touched areas
- `src/upload/policy.js`
- `src/app.js`
- `src/server/api.js`
- `tests/uploadPolicy.test.js`
- `tests/serverApi.test.js`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`

## Risks
- Browser and server policy can drift if validation is duplicated.
- Rejected upload attempts can confuse operators if the UI only shows a generic failure.
- Server manifest can be polluted if validation runs after storage writes.

## Impact Chains
### suspected
- handleFiles (src/app.js) -> validateBrowserUploadFile (src/upload/policy.js) -> renderUploadRejections (src/app.js)
- routeProject (src/server/api.js) -> validateImageDataUrlUpload (src/upload/policy.js) -> storage.writeProjectManifest (src/server/storage.js)

### validated
- handleFiles (src/app.js) -> validateBrowserUploadFile (src/upload/policy.js) -> renderUploadRejections (src/app.js)
- routeProject (src/server/api.js) -> validateImageDataUrlUpload (src/upload/policy.js) -> storage.writeImageFromDataUrl (src/server/storage.js)

### discarded
- multipart upload parser -> storage.writeImageFromStream
  - reason: production target remains documented but is outside this batch.

## Validation Plan
- `npm run lint`
- `npm test`
- `scripts/harness/smoke-web.sh`
- Browser/API smoke for app shell and upload rejection surface.

## Progress Notes
- Keep the policy module dependency-free so both browser and Node can import it.
- Server validation must happen before `ensureProject`, image writes, or manifest mutation.

## File-back Candidates
- Promote the shared upload policy as the current MVP boundary in architecture docs.

## Closeout
- Implemented shared upload policy, frontend rejection UI, and server-side upload validation.
- `npm run lint` passed.
- `npm test` passed with 62 tests.
- `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`, `scripts/harness/test-target.sh`, and `scripts/harness/smoke-web.sh` passed.
- API smoke confirmed invalid upload returns 400 and does not create the project manifest.
