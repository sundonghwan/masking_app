# Task: magic-tool-edge-band

## Goal

- 매직툴이 클릭한 객체의 내부뿐 아니라 인접한 테두리 edge band까지
  함께 선택하도록 개선한다.

## Scope

- `selectEdgeAwareRegionFromImageData` 선택 알고리즘.
- 매직툴 회귀 테스트.
- 설계/계획 문서와 harness 기록.

## Non-goals

- Canny/GrabCut 전체 파이프라인 추가.
- UI control 추가.
- 저장 mask format, label schema, export format 변경.

## Risks

- edge band가 배경까지 번지면 수작업 수정량이 늘어난다.
- edge threshold가 너무 낮은 프로젝트에서는 테두리 흡수가 과해질 수
  있다.
- smoothing 순서가 바뀌면 기존 매직툴 결과가 과도하게 달라질 수 있다.

## Impact Chains

### suspected

- selectEdgeAwareRegionFromImageData (src/editor/maskEditor.js:70-87) -> growRegionFromImageData (src/editor/maskEditor.js:90-143) -> magicSelectAt (src/editor/maskEditor.js:488-507)

### validated

- selectEdgeAwareRegionFromImageData -> addEdgeBandToRegion -> magicSelectAt
  - validation: `node --test tests/maskEditor.test.js` added regression for
    adjacent border edge band and preserved strong-edge stop behavior.

### discarded

- UI slider for edge band radius
  - reason: existing edge threshold and current default radius are sufficient
    for this behavior change; adding UI now would widen product surface.

## Validation Plan

- `node --test tests/maskEditor.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `git diff --check`

## Progress Notes

- RED confirmed existing magic selection omitted adjacent border pixels.
- GREEN adds bounded edge-band expansion after interior flood fill and before
  smoothing.
- Edge-band candidates must be near a strong edge and close enough to the seed
  color to avoid obvious background spill.

## Closeout

- `node --test tests/maskEditor.test.js` passed with 22 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 354 tests.
- `git diff --check` passed.
- Feature status and remaining work board updated.
- Code review: no blocking issue found. The expansion is bounded by
  `edgeBandRadius`, `maxPixels`, nearby strong edges, and seed color distance,
  so it should include likely contour pixels without crossing obvious
  background boundaries.
