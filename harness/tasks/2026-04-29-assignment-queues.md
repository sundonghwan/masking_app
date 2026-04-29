# Task: assignment-queues

## Goal

- Add a lightweight assignment queue and per-user task list so workers and
  reviewers can filter the current project image list to their assigned work.

## Scope

- Add queue filter controls to the workbench image list.
- Add pure queue filtering/summarizing helpers.
- Wire queue mode into the image list rendering.
- Update feature status and checkpoint documents.

## Non-goals

- Dedicated `/worker/tasks` or `/reviewer/queue` pages.
- User directory management.
- Server-side queue API.
- Dashboard charts.

## Touched Areas

- `index.html`
- `src/app.js`
- `src/assignment/queue.js`
- `src/styles.css`
- `package.json`
- `tests/assignmentQueue.test.js`
- `tests/appContracts.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`

## Risks

- Queue filters could hide all images for admin users.
- Status filter and queue filter could conflict or count misleadingly.
- Reviewer queue should not show non-reviewable worker draft images as ready
  review tasks.
- Existing assignment save flow must keep working.

## Impact Chains

### suspected

- `renderImageList (src/app.js:1094-1120)` -> `filterImagesForQueue (src/assignment/queue.js:9-17)` -> image list rows
- `assignSelectedImage (src/app.js:881-947)` -> `renderImageList (src/app.js:1094-1120)` -> queue membership update

### validated

- `renderImageList (src/app.js:1094-1120)` -> `filterImagesForQueue (src/assignment/queue.js:9-17)` -> image list rows
  - validation: `npm test -- tests/assignmentQueue.test.js tests/appContracts.test.js` passed; helper tests cover queue/status composition and contracts verify UI wiring.
- `assignSelectedImage (src/app.js:881-947)` -> `renderImageList (src/app.js:1094-1120)` -> queue membership update
  - validation: `npm test -- tests/assignmentQueue.test.js tests/appContracts.test.js` passed; queue membership is derived from `worker_id` and `reviewer_id`, which assignment already mutates.

### discarded

- Server queue API.
  - reason: current project manifest already contains worker/reviewer/status
    data needed for the MVP per-user list.

## Validation Plan

- `npm test -- tests/assignmentQueue.test.js tests/appContracts.test.js`
- `npm run lint`
- `git diff --check`
- Full harness wrapper scripts before closeout.

## Progress Notes

- Added `src/assignment/queue.js` as the pure queue rule layer.
- Added workbench queue controls for project-wide, my work, and my review lists.
- Queue counts are derived from the current project images and current session
  user.
- Queue filtering composes with the existing status filter.
- Implementation review found no blocking issue after checking queue/status
  composition, reviewer-ready status filtering, persisted queue mode, and lint
  coverage for the new helper module.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [x] Commit completed: `0e43fc5 Add assignment queue filters`.
- [x] Push completed: `origin/main` at `6d9fabf`.
