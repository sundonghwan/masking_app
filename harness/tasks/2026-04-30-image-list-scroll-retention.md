# Task: image-list-scroll-retention

## Goal

- 이미지 목록에서 아래쪽 이미지를 선택할 때 목록 스크롤이 맨 위로 초기화되지 않게 한다.

## Scope

- Workbench image list rendering.
- Contract test for scroll preservation behavior.

## Non-goals

- Virtualized list implementation.
- Image selection UI redesign.

## Risks

- `renderImageList` replaces row DOM and can reset scroll position.
- Search/filter changes may shrink the list; browser should clamp restored
  scroll values naturally.

## Impact Chains

### suspected

- `selectImage (src/app.js:473-505) -> render (src/app.js:1174-1189) -> renderImageList (src/app.js:1262-1318) -> imageList.scrollTop`

## Validation Plan

- `node --test tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `git diff --check`

## Progress Notes

- Root cause: `selectImage -> render -> renderImageList` replaced the whole
  image list DOM, which reset `.image-list` scroll position on every row click.
- Fix: capture `els.imageList.scrollTop/scrollLeft` before row replacement and
  restore it after `replaceChildren`.

## Impact Chains

### validated

- `selectImage (src/app.js:473-505) -> render (src/app.js:1174-1189) -> renderImageList (src/app.js:1262-1332) -> restoreImageListScroll (src/app.js:1339-1342)`
  - validation: `tests/appContracts.test.js`, `scripts/harness/lint-all.sh`, `git diff --check`.

## Closeout

- Review result: no blocking issue; fix is local to image list rendering.
- Remaining risk: browser manual check still depends on current scroll position and user data volume, but the DOM replacement no longer discards stored scroll values.
