# Task: multipart-parser-refactor

## Goal
- Extract multipart form parsing helpers from `src/server/api.js` into a focused
  server module.

## Scope
- Move `multipartBoundary` and `parseMultipartBody` into
  `src/server/multipart.js`.
- Add focused tests for quoted/unquoted boundaries, text fields, files, content
  type defaults, and CRLF trimming.
- Add the new module to syntax coverage.

## Non-goals
- Implement streaming multipart upload.
- Change upload size limits, MIME policy, or image validation.
- Change API response shapes.

## Touched areas
- `src/server/api.js`
- `src/server/multipart.js`
- `tests/multipart.test.js`
- `scripts/harness/check-syntax.mjs`
- `harness/run_log.md`

## Risks
- Image upload parsing could stop reading fields or file content correctly.
- Content type defaults could drift and affect upload validation.
- Multipart parser is still an MVP in-memory parser, not a production streaming
  implementation.

## Impact Chains

### suspected
- readImageUpload (src/server/api.js:1050-1065) -> readMultipartImageUpload (src/server/api.js:1067-1092) -> parseMultipartBody (src/server/api.js:1099-1124) -> validateUploadCandidate (src/upload/policy.js)

### validated
- readImageUpload (src/server/api.js:1051-1066) -> readMultipartImageUpload (src/server/api.js:1068-1093) -> parseMultipartBody (src/server/multipart.js:6-29) -> validateUploadCandidate (src/upload/policy.js)
  - validation: `node --test tests/multipart.test.js`, `node --test tests/serverApi.test.js`

### discarded
- JSON data URL upload path
  - reason: this refactor only moves multipart helpers; JSON upload parsing
    remains in `readImageUpload`.

## Validation Plan
- RED/GREEN: `node --test tests/multipart.test.js`
- `node --test tests/serverApi.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Extracted multipart boundary parsing and in-memory multipart body parsing into
  `src/server/multipart.js`.
- Preserved the current MVP upload behavior; this did not introduce streaming
  upload or change image validation policy.
- Validation passed:
  - RED/GREEN: `node --test tests/multipart.test.js`
  - `node --test tests/serverApi.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: the parser is still
  memory-buffer based and should be replaced by streaming multipart handling
  when large uploads become a production requirement.
