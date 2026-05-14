# Task: project-structure-risk-docker-serve

## Goal

- 정리된 프로젝트 폴더 구조, 데이터 기준, config 기준을 문서화한다.
- 남은 운영 리스크를 Docker/object-db 런타임 기준으로 재분류한다.
- Docker Compose 빌드 후 object-db 모드로 서빙을 시작하고 검증한다.

## Scope

- Repository structure/runtime documentation.
- Data root and object-db verifier evidence.
- Docker Compose build/up/health/deployment evidence.
- Harness run log and feature/risk status.

## Non-goals

- 데이터셋 라벨 의미를 다시 변경하지 않는다.
- object-db migration 로직을 다시 작성하지 않는다.
- production identity provider를 도입하지 않는다.

## Risks

- filesystem `data/`와 object-db/MinIO 상태가 갈라질 수 있다.
- Docker Compose app port `4173`이 host-native dev server와 충돌할 수 있다.
- 문서가 filesystem MVP 기준으로 남아 있으면 운영자가 잘못된 저장소를 고칠 수 있다.

## Impact Chains

### suspected

- Docker Compose env (docker-compose.yml:*) -> createRuntimeStorage (server.js:*) -> createObjectDbStorage (src/server/objectDbStorage.js:*)
- data/rail-mask-20260513 manifest -> storage verifier -> backup-data-root archive
- docs runtime map -> operator runbook -> Docker deployment check

### validated

- data/rail-mask-20260513 manifest -> storage verifier
  - validation: `scripts/harness/storage-verify.sh --json data`
- object-db metadata/object refs -> object-db verifier
  - validation: `scripts/harness/object-db-verify.sh --json --ensure-bucket`

### discarded

- 파일/폴더 대규모 이동
  - reason: `data/`와 `backups/`는 git ignored runtime artifacts이고, Docker
    runtime은 named volumes를 사용하므로 코드 repo 구조를 흔드는 것보다
    문서/검증 기준을 고정하는 편이 안전하다.

## Validation Plan

- `scripts/harness/storage-verify.sh --json data`
- `scripts/harness/object-db-verify.sh --json --ensure-bucket`
- `scripts/harness/backup-data-root.sh data --json`
- `docker compose build masking-app`
- `docker compose up -d`
- `docker compose ps`
- `scripts/harness/deployment-check.sh --json http://127.0.0.1:4173`
- API smoke: health, login, project manifest counts, file download.

## Progress Notes

- Fixed filesystem backup copy for `image_0001` support mask so manifest and
  file path agree.
- Removed stale orphan `image_0001_class_2_slider_mask.png` from filesystem
  data root after creating the correct support filename.
- Created post-cleanup data-root backup:
  `backups/masking-app-data-20260514T074945Z.tgz`.
- Added `docs/PROJECT_STRUCTURE_RUNTIME.md` as the current folder/data/config
  runtime map.
- Rebuilt Docker image after fixing the Dockerfile dependency install path.
- Docker Compose is serving on `http://127.0.0.1:4173` in object-db mode.

## Findings

- `docker compose build` alone was not enough evidence: the image initially
  lacked `pg` and `minio` because `node_modules/` is intentionally excluded
  from the Docker build context. The Dockerfile now runs `npm ci --omit=dev`
  from `package-lock.json`.
- The local filesystem `data/` root is clean as a recovery copy, but Docker
  runtime truth is still Postgres + MinIO.
- The previous host-native dev server occupied port `4173`; it was stopped so
  Docker could bind the app port.

## Closeout

- Fresh validations:
  - `scripts/harness/storage-verify.sh --json data`
  - `scripts/harness/object-db-verify.sh --json --ensure-bucket`
  - `scripts/harness/backup-data-root.sh data --json`
  - `node --test tests/deploymentPackaging.test.js`
  - `docker compose build masking-app`
  - `docker run --rm masking-app:local node -e "import pg/minio"`
  - `docker compose up -d`
  - `docker compose ps`
  - `scripts/harness/deployment-check.sh --json --output release-artifacts/deployment-check-20260514-docker-object-db.json http://127.0.0.1:4173`
  - Docker API smoke for `rail-mask-20260513`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `git diff --check`
- Docker serving status: app, Postgres, and MinIO containers are healthy.
- Remaining risk: final shared-host use still needs identity boundary approval
  and export/training-set smoke on representative target-host data.
