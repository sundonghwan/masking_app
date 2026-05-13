# Task: user-defined-label-schema

## Goal
- 사용자가 프로젝트별 class label schema를 직접 지정하고 수정할 수 있게 한다.

## Scope
- 프로젝트 생성 폼에 label schema 입력 추가
- 프로젝트 설정 폼에 label schema 편집 추가
- API client/server settings/create path에서 `label_schema` 저장/응답
- 작업도구 label selector가 저장된 schema를 사용하도록 연결

## Non-goals
- 클래스별 mask PNG 저장 전환
- 클래스별 editor mask switching
- export/training-set metadata 전환

## Risks
- 잘못된 라벨 입력이 fallback으로 조용히 바뀌면 작업자가 의도하지 않은 class_id로 작업할 수 있음
- settings 저장 시 기존 upload/magic 설정과 label schema가 서로 덮어쓸 수 있음
- 서버 manifest와 local snapshot label schema가 어긋나면 작업 화면 표시가 혼동될 수 있음

## Impact Chains
### suspected
- pending

### validated
- createProjectFromForm (src/app.js:2246-2300) -> createProject (src/api/client.js:32-43) -> routeApi.projects.POST (src/server/api.js:188-211)
- saveProjectSettings (src/app.js:919-962) -> updateProjectSettings (src/api/client.js:82-94) -> routeProject.settings (src/server/api.js:327-368)
- setActiveProjectFromManifest (src/app.js:2432-2456) -> normalizeLabelSchema (src/annotations/labels.js:9-21) -> renderLabelSelector (src/app.js:2594-2609)

### discarded
- class-aware mask save/load
  - reason: this task only lets users define the label schema; mask persistence per class remains a separate high-risk storage/editor change.

## Validation Plan
- `node --test tests/labelSchema.test.js tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- 사용자 피드백: 라벨은 작업자가 직접 지정해야 하며, 앱이 임의 라벨을 넣으면 안 됨.
- 프로젝트 생성 폼과 프로젝트 설정 폼에 label schema textarea 추가.
- 입력 형식은 한 줄당 `class_id,name,#RRGGBB`이며, 비어 있거나 잘못된 색상은 저장 전에 차단.
- 서버 create/settings 경로가 `label_schema`를 manifest에 저장하고 응답에 포함.

## Closeout
- validated 체인 line range 갱신 완료
- 실행 검증:
  - `node --test tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js` passed
  - `scripts/harness/lint-all.sh` passed
  - `scripts/harness/typecheck-all.sh` passed
  - `scripts/harness/test-target.sh` passed, 225 tests
  - `scripts/harness/smoke-web.sh` passed
  - `git diff --check` passed
  - live HTTP smoke passed for `/api/health`, `/`, and `/src/app.js`
- commit `e1c85ba` pushed to `origin/main`
