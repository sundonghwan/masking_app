# Task: label-selector-foundation

## Goal
- 작업 화면에서 마스크를 그리기 전에 클래스/라벨을 명시적으로 선택할 수 있게 한다.

## Scope
- 기본 라벨 스키마 유틸 추가
- 이미지별 라벨 annotation record 유틸 추가
- 작업도구 inspector에 라벨 선택 UI 추가
- 로컬 프로젝트 스냅샷과 서버 manifest 복구 시 라벨 스키마/선택 상태 유지

## Non-goals
- 다중 라벨별 독립 mask PNG 저장 전환
- Training set ZIP 포맷의 최종 multi-class 전환
- AI inference 결과 저장

## Risks
- 라벨 선택 UI가 기존 binary mask 저장 경로와 다른 의미로 오해될 수 있음
- 저장/복구 시 라벨 스키마가 깨지면 작업자가 잘못된 class_id로 작업할 수 있음
- 기존 이미지 스크롤/선택 렌더링을 건드리면 작업 효율이 떨어질 수 있음

## Impact Chains
### suspected
- pending

### validated
- render (src/app.js:1795-1821) -> renderLabelSelector (src/app.js:2559-2574) -> selectClassLabel (src/app.js:2647-2658)
- setActiveProjectFromManifest (src/app.js:2397-2421) -> normalizeLabelSchema (src/annotations/labels.js:9-21)
- persistProject (src/app.js:3474-3516) -> restoreProject (src/app.js:3518-3563) -> normalizeLabelSchema (src/annotations/labels.js:9-21)
- selectedLabelAnnotation (src/app.js:2661-2663) -> migrateLegacyImageAnnotations (src/annotations/records.js:57-77)

### discarded
- full multi-class mask save/export conversion
  - reason: this task only fixes the missing visible label selector and state foundation; class-aware mask storage remains next slice.

## Validation Plan
- `node --test tests/labelSchema.test.js tests/annotationRecords.test.js tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- 사용자 피드백 기준: 설계 문서만 있고 작업 화면에 class/label 지정 UI가 없음.
- `labelSelector`, `imageAnnotationList`, `labelMessage`를 workbench inspector에 추가.
- 기본 라벨 스키마와 class-labeled annotation record 유틸 추가.

## Closeout
- validated 체인 line range 갱신 완료
- 실행 검증:
  - `node --test tests/labelSchema.test.js tests/annotationRecords.test.js` passed
  - `node --test tests/appContracts.test.js` passed
  - `node --check src/app.js && node --test tests/labelSchema.test.js tests/annotationRecords.test.js tests/appContracts.test.js` passed
  - `scripts/harness/lint-all.sh` passed
  - `scripts/harness/typecheck-all.sh` passed
  - `scripts/harness/test-target.sh` passed, 225 tests
  - `scripts/harness/smoke-web.sh` passed
  - `git diff --check` passed
  - live HTTP smoke passed for `/api/health`, `/`, and `/src/app.js`
  - initial live static smoke failed against stale dev server; dev server was restarted with `MASKING_APP_HOST=127.0.0.1 npm run dev`, then passed.
- commit `4fcf888` pushed to `origin/main`
