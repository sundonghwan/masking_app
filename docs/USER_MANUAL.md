# Masking App User Manual

## Audience

This manual is for operators, admins, workers, and reviewers who use Masking App
to upload images, create class-labeled masks, review submitted work, and export
training data.

## Objective

Help a user operate the current local/staging Masking App safely without reading
the source code. This manual covers the browser workflow, not server deployment
or final production approval.

## Current Use Boundary

The app is ready for local/staging data work at:

```text
http://localhost:4173
```

Current local data root:

```text
/Users/polaris/Documents/sundonghwan/masking_app/data
```

Do not treat this as final production approval. Production release is still
gated by `docs/PRODUCTION_BOUNDARY_DECISIONS.md` and
`scripts/harness/release-candidate-gate.sh`.

## Roles

| Role | Main responsibility | Main screens/actions |
| --- | --- | --- |
| `admin` | Create projects, configure labels, manage users, assign work, export data | Projects, Dashboard, Workbench, settings, account management |
| `worker` | Upload or open assigned images, create/edit masks, submit work | Projects, Workbench, image list, mask tools |
| `reviewer` | Review submitted masks, approve/reject, export approved data | Dashboard, Workbench, review and export panels |

## Local MVP Accounts

These are local/staging defaults only. Do not use these as production
credentials.

| Role | User ID | Password |
| --- | --- | --- |
| admin | `admin` | `admin123` |
| worker | `worker` | `worker123` |
| reviewer | `reviewer` | `reviewer123` |

## Start And Open The App

From the repository root:

```bash
npm run dev
```

Open:

```text
http://localhost:4173
```

Health check:

```bash
curl -sS http://127.0.0.1:4173/api/health
```

Expected health response includes:

```json
{
  "ok": true,
  "service": "masking-app-backend"
}
```

## Recommended Data Structure

Use a project/task/version structure so bad uploads or experiments can be
isolated and corrected later.

```text
project
  task_name
    v1
    v2
  task2_name
    v1
```

Recommended naming:

| Item | Example | Notes |
| --- | --- | --- |
| Project ID | `rail-mask-20260513` | Lowercase letters, numbers, and hyphens are easiest to manage |
| Task | `crack_labeling` | One logical labeling purpose |
| Version | `v1`, `v2` | Use when cloning or revising a task dataset |
| Training set ID | `rail_crack_v1` | Stable ID for export/re-export |

## End-To-End Workflow

1. Log in.
2. Create or open a project.
3. Configure labels.
4. Select a task/version.
5. Upload images.
6. Assign work if using multiple users.
7. Draw masks per label.
8. Submit completed images.
9. Review submitted work.
10. Export project ZIP or training set ZIP.

## Login

1. Open `http://localhost:4173`.
2. Enter `사용자 ID`.
3. Enter `비밀번호`.
4. Click `로그인`.

The browser does not choose the role. The server decides the role from the
logged-in account.

Use `로그아웃` before switching users.

## Project Screen

After login, the app opens the project screen.

### Open Existing Project

1. Use `프로젝트 검색` if the list is long.
2. Select the project card.
3. Move to dashboard or workbench from the project flow.

### Create Project

Admin only.

1. Fill `프로젝트 ID`.
2. Fill `프로젝트 이름`.
3. Set `업로드 제한 MB`.
4. Define labels in the `라벨` textarea.
5. Click `프로젝트 생성`.

Label format:

```text
1,crack,#EF4444
2,corrosion,#F59E0B
3,background,#3B82F6
```

Rules:

- First value is `class_id`.
- Second value is label name.
- Third value is mask color.
- The selected label color is used for brush overlay.

### Deleted Projects

Admin can enable `삭제된 프로젝트 포함` to see archived/deleted projects.
Use archive/restore/purge controls carefully. Purge is destructive for deleted
records/files.

## Dashboard

The dashboard summarizes project state before entering detailed annotation.

Use it to check:

- project health
- worker/reviewer workload
- export readiness
- blockers
- recent quality events

Buttons:

| Button | Use |
| --- | --- |
| `프로젝트` | Return to project list |
| `작업도구` | Open annotation workbench |
| `로그아웃` | End session |

## Workbench Layout

The workbench has four main areas.

| Area | Purpose |
| --- | --- |
| Topbar | Project, task/version, navigation, save state, submit/export actions |
| Left image list | Upload, filter, search, select images |
| Center canvas | Draw, erase, move, zoom, inspect image |
| Right inspector | Labels, tools, review, export, settings, sync status |

## Task And Version

Use the topbar selectors:

| Control | Purpose |
| --- | --- |
| `Task` | Choose task scope |
| `Version` | Choose version |
| `↻` | Refresh the current project from the server, including task/version context |
| `⧉` | Clone current version, admin only |
| `×` | Soft-delete current version, admin only |
| `↺` | Restore deleted version, admin only |
| `⌫` | Purge deleted version files, admin only |

Use versions when you need to revise a dataset without overwriting the previous
state.

## iPad And PC Sync

The app is server-synced, not real-time browser-to-browser collaborative
editing. The iPad and PC each keep their own browser cache, so the other device
must pull the latest server state after work is saved.

Recommended flow:

1. On iPad, finish the current mask edit.
2. Use `마스크 저장` or `제출` and wait until the save state no longer shows an
   error.
3. On the PC workbench, click `↻` in the topbar.
4. Confirm the image list, selected mask, status, task/version, and sync panel
   reflect the latest server data.

If `동기화 필요` appears, use `동기화 재시도` before moving to the other device.
If the refresh button warns that local-only changes exist, cancel unless you are
sure those local browser changes can be replaced by the server copy.

## Upload Images

Admin and worker can upload images.

1. Open a project and task/version.
2. Use `이미지 업로드`.
3. Select one or more files.
4. Check upload rejection messages if any appear.

Supported formats:

```text
PNG, JPG, BMP, WEBP
```

Upload rules are controlled by project settings:

- max file size
- allowed MIME types
- server-extracted dimensions

## Image List

Use status filters:

| Filter | Meaning |
| --- | --- |
| `전체` | All visible images |
| `대기` | Not started |
| `작업중` | Work in progress |
| `제출` | Submitted for review |
| `승인` | Approved |
| `반려` | Rejected |
| `동기화 필요` | Local/server sync issue |
| `삭제됨` | Soft-deleted images |

Use queue filters:

| Filter | Meaning |
| --- | --- |
| `프로젝트` | All project images |
| `내 작업` | Images assigned to the current worker |
| `내 리뷰` | Images assigned to the current reviewer |

Use `이미지 검색` to find by filename or image ID.

## Remove Or Restore Images

Images are removed as soft delete first. This lets you recover from accidental
uploads.

Typical use:

1. Select a bad image.
2. Use the image remove control in the image item/action area.
3. Filter by `삭제됨` to inspect removed images.
4. Restore if it was removed by mistake.

Deleted images are excluded from normal export by default.

## Label Selection

Before drawing a mask:

1. Select an image.
2. Select the target label in the `라벨` panel.
3. Confirm the mask color swatch matches the selected label.
4. Draw or import the mask.

Each label/class stores its own annotation. This is important because model
output is expected to contain:

```text
class_id + mask image
```

## Mask Tools

| Tool | Shortcut | Use |
| --- | --- | --- |
| `브러시` | `B` | Paint mask pixels |
| `지우개` | `E` | Remove mask pixels |
| `매직` | `W` | Click an image region to create an edge-aware local mask |
| `보기` | `V` | Inspect without editing |
| `이동` | Hold `Space` | Temporarily pan camera while preserving the selected tool |
| `마스크 이동` | `M` | Move the current mask to align copied/shifted frames |

Other controls:

| Control | Use |
| --- | --- |
| `맞춤` | Fit image to viewport |
| `−` / `＋` | Zoom out / in |
| `표시` | Switch overlay, original, or mask-only view |
| `크기` | Brush size |
| `오버레이` | Mask overlay opacity |
| `색상 허용` | Magic tool color tolerance |
| `엣지 강도` | Magic tool edge threshold |

## Spacebar Pan

Hold `Space` while dragging the canvas to move the camera. Releasing `Space`
returns to the previous tool.

This is intended for efficient zoomed editing. It should not switch the selected
tool permanently.

## iPad And Apple Pencil Canvas Controls

On iPad, open the app from the Mac LAN address instead of `localhost`.

```text
http://192.168.11.133:4173
```

Canvas controls:

| Input | Action |
| --- | --- |
| Apple Pencil / one finger | Use the selected mask tool |
| Two-finger drag | Move the image viewport |
| Two-finger pinch | Zoom in or out around the gesture center |
| Supported pen eraser/barrel button | Temporarily erase without changing the selected tool |

Two-finger gestures do not paint mask pixels. If the browser does not expose a
hardware eraser or double-tap signal for the stylus, switch to the `지우개`
tool with `E` or the tool button.

## Magic Tool

The magic tool is a local deterministic assist. It does not call a real AI model.

Use it when:

- the target object has clear edge boundaries
- the color/texture around the target is different enough
- you want a fast draft region to refine manually

Adjust:

| Setting | Effect |
| --- | --- |
| `색상 허용` | Higher value expands through more color variation |
| `엣지 강도` | Higher value makes edge stopping stricter |

After using magic, inspect the edge and fix leaks with brush/eraser.

## Previous Mask Copy

Use this for sequential frames.

1. Select an image after a previous image has a mask.
2. Click `이전 마스크 적용`.
3. If the previous and current image resolutions differ, the app resizes the
   copied mask to the current image resolution.
4. Switch to `마스크 이동 M`.
5. Drag the copied mask until it aligns with the current image.
6. Refine with brush/eraser.

Shortcut hint shown in the app:

```text
Shift + V
```

## AI Draft

The `AI 초안` panel can import a prediction into the selected label as a draft.

Current limitation:

- generic AI serving contract exists
- real model adapter is not enabled by default
- imported predictions should be reviewed and edited before submit

If there is no prediction for the selected label, the app shows an error message
instead of creating a mask.

## Save, Submit, And Revise

| Action | Role | Meaning |
| --- | --- | --- |
| `마스크 저장` | admin, worker | Save current label mask |
| `제출` | admin, worker | Submit image for review |
| `수정 시작` | admin, worker | Reopen a submitted/rejected image for editing |
| `실행 취소` / `다시 실행` | editable roles | Undo/redo mask edits |

Validation checks:

- resolution matches image
- mask is not empty
- pixel values are valid

Submit only after each required label has the intended mask.

## Assignment

Admin can assign the selected image.

1. Select an image.
2. Choose `작업자`.
3. Choose `리뷰어`.
4. Click `배정 저장`.

Workers can then use `내 작업`. Reviewers can use `내 리뷰`.

## Review

Admin and reviewer can review submitted images.

Approve:

1. Select a submitted image.
2. Inspect mask quality.
3. Click `승인`.

Reject:

1. Select a submitted image.
2. Choose `반려 사유`.
3. Add detail text if needed.
4. Click `반려`.

Common rejection reasons:

- mask leaks outside the target
- missing region
- rough boundary
- wrong object
- empty mask
- low confidence

After rejection, a worker can start rework and resubmit.

## Project Settings

Admin can update:

- project name
- description
- upload size limit
- allowed formats
- label schema
- magic tool defaults

Click `설정 저장` after editing.

Changing labels affects future editing and export metadata. Avoid changing
`class_id` after masks have been created unless you are intentionally revising
the dataset contract.

## Account Management

Admin can manage local MVP users.

Fields:

- 사용자 ID
- 표시 이름
- 역할: `worker`, `reviewer`, `admin`
- 비밀번호
- 활성 사용자

Actions:

| Action | Meaning |
| --- | --- |
| `사용자 저장` | Create/update local user |
| `비활성화` | Disable user access |

Production note: local account management is acceptable only for controlled
internal deployment after explicit production boundary approval.

## Export Project ZIP

Admin and reviewer can export.

1. Open workbench.
2. Optional: enable `승인 항목만 내보내기`.
3. Click `내보내기`.
4. Download the generated ZIP.

ZIP includes:

```text
images/
masks/
annotations.json
export_summary.json
```

Class-aware exports include label/class metadata and class mask paths.

## Training Set ZIP

Use this when you want selected project/task/version outputs packaged as a
training dataset.

1. In `내보내기`, select sources in the `Training set source picker`.
2. Fill `Set ID`.
3. Fill `이름`.
4. Optional: fill `설명`.
5. Set split ratios:
   - Train
   - Val
   - Test
   - Seed
6. Click `Training set 저장`.
7. Export saved training set or click `선택 source 즉시 ZIP`.

Training set outputs preserve source traceability:

- project
- task
- version
- image
- class ID/name
- split assignment

## Server Sync Panel

The `서버 동기화` panel shows:

- project sync
- original image sync
- mask sync
- export sync

Use `동기화 재시도` when a local/browser action failed to sync to server.

Do not export final data while sync status shows blockers.

## Recommended Daily Workflow

For admins:

1. Start server.
2. Log in as admin.
3. Create/open project.
4. Confirm label schema and upload policy.
5. Upload images or confirm workers can upload.
6. Assign worker/reviewer.
7. Watch dashboard blockers.
8. Export only after review status is acceptable.

For workers:

1. Log in as worker.
2. Open assigned project.
3. Use `내 작업`.
4. Select label.
5. Draw/refine masks.
6. Submit each completed image.
7. Rework rejected items.

For reviewers:

1. Log in as reviewer.
2. Open assigned project.
3. Use `내 리뷰`.
4. Approve or reject submitted masks.
5. Export approved data when ready.

## Troubleshooting

### Server Already Running

If `npm run dev` fails with `EADDRINUSE`, another server is using port `4173`.

Check:

```bash
pgrep -af "node server.js|npm run dev"
```

Stop the old process if it is stale, or run on another port:

```bash
PORT=4174 npm run dev
```

### Cannot Log In

Check:

- user ID spelling
- password
- whether the user is active
- whether the server is running

Admin can reset local users from `계정 관리`.

### Uploaded Image Is Rejected

Check:

- file format
- file size
- corrupt image file
- project upload limit
- allowed formats in project settings

### Brush Color Looks Wrong

The brush overlay follows the selected label color. Check:

1. Selected label in `라벨`.
2. `마스크 색상` swatch.
3. Project label schema in `프로젝트 설정`.

### Magic Tool Selects Too Much Or Too Little

Adjust:

- lower `색상 허용` to reduce spread
- raise `색상 허용` to include more region
- adjust `엣지 강도` when boundaries are leaking or stopping too early

Always inspect and correct the result manually.

### Image Click Resets Or Feels Wrong

Use image list selection for image changes. For canvas movement, hold `Space`
and drag the canvas instead of changing tools.

### Export Is Missing Items

Check:

- image status
- mask validation
- deleted image status
- `승인 항목만 내보내기`
- export blockers in dashboard or export panel

### Training Set Split Looks Unexpected

Check:

- selected sources
- train/val/test ratios
- seed
- whether deleted or non-exportable images were excluded

## Verification Checklist Before Export

Use this before creating a project ZIP or training set ZIP.

| Check | Done |
| --- | --- |
| Correct project selected |  |
| Correct task/version selected |  |
| Label schema matches target model classes |  |
| Bad uploads removed or restored appropriately |  |
| Required masks are not empty |  |
| Submitted images reviewed when needed |  |
| `승인 항목만 내보내기` setting is intentional |  |
| Export blockers are empty or understood |  |
| ZIP downloaded and stored in the expected location |  |

## Known Limits

- Real AI model adapter is deferred.
- Production approval still requires explicit boundary decisions.
- Filesystem metadata is intended for local/staging or controlled single-process
  deployment.
- Internet-facing deployment is not approved by this manual.
- Default MVP credentials are for local/staging only.
