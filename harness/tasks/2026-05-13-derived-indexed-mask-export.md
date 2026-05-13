# Task: derived-indexed-mask-export

## Goal
- Add server-generated indexed mask export artifacts derived from class-labeled binary masks.

## Scope
- Decode 8-bit grayscale binary mask PNGs on the server.
- Generate 8-bit grayscale indexed mask PNGs where pixel value equals `class_id`.
- Add project ZIP indexed-mask artifacts and metadata.
- Keep class-labeled binary masks as the source of truth.

## Non-goals
- Browser local fallback indexed-mask generation.
- Replacing class-labeled binary mask storage.
- Resolving overlapping classes in the editor.

## Risks
- Indexed masks cannot represent overlapping classes without a deterministic conflict policy.
- Invalid binary masks must not produce derived indexed masks.
- Class IDs above 255 cannot be represented in an 8-bit indexed PNG.
- Server ZIP export must preserve existing class-wise binary mask entries.

## Impact Chains

### suspected
- exportProject (src/server/api.js:1501-1581) -> createIndexedMaskArtifact (src/export/indexedMask.js:5-51) -> createZipBlob (src/export/zip.js:*)
- validateBinaryMaskPixels (src/server/maskValidation.js:166-215) -> decodeGrayscale8PngPixels (src/server/maskValidation.js:217-231) -> createGrayscale8Png (src/server/maskValidation.js:233-267)

### validated
- exportProject (src/server/api.js:1501-1581) -> createIndexedMaskArtifact (src/export/indexedMask.js:5-51) -> createZipBlob (src/export/zip.js:*)
  - validation: `node --test tests/indexedMask.test.js tests/maskValidation.test.js tests/serverApi.test.js`
- validateBinaryMaskPixels (src/server/maskValidation.js:166-215) -> decodeGrayscale8PngPixels (src/server/maskValidation.js:217-231) -> createGrayscale8Png (src/server/maskValidation.js:233-267)
  - validation: `node --test tests/indexedMask.test.js tests/maskValidation.test.js`

### discarded
- browser local fallback indexed export
  - reason: browser fallback should not grow a PNG encoder/zlib path; server export owns derived training artifacts.

## Validation Plan
- `node --test tests/indexedMask.test.js tests/maskValidation.test.js tests/serverApi.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Added a server-side indexed mask generator that decodes class binary masks and writes 8-bit grayscale indexed PNGs.
- Overlap policy is deterministic: `higher_class_id_wins`.
- Project ZIP export includes `indexed_masks/<image>_indexed_mask.png` and `indexed_masks/indexed_masks.json` when valid binary mask buffers are available.
- Invalid or non-PNG mask payloads skip the derived indexed artifact while preserving existing binary mask ZIP entries.
- `package.json` lint/typecheck coverage now includes the AI prediction and indexed mask modules.

## Closeout
- Targeted indexed mask and server export tests passed.
- Full harness validation passed with 242 tests.
- Code review found no blocking issue after checking overlap policy, invalid-mask skip behavior, and binary mask export compatibility.
