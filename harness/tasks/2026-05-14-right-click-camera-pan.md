# Task: right-click-camera-pan

## Goal

- 확대 상태에서 마스킹할 때 Spacebar 없이도 마우스 우클릭 드래그로
  카메라를 이동할 수 있게 한다.

## Scope

- `MaskEditor` pointer handling.
- Canvas context menu suppression.
- Focused editor tests.
- Feature status and run log updates.

## Non-goals

- Global browser context menu behavior 변경.
- 브러시/지우개/매직 도구 의미 변경.
- 터치/Apple Pencil 제스처 변경.

## Risks

- 우클릭이 브러시/지우개 stroke로 기록되면 mask와 undo가 오염된다.
- 펜 보조 버튼 지우개 동작과 마우스 우클릭 pan이 충돌할 수 있다.
- 캔버스 밖 우클릭 메뉴까지 막으면 일반 브라우저 UX가 나빠진다.

## Impact Chains

### suspected

- bindCanvasEvents (src/editor/maskEditor.js:628-746) -> beginCameraPan (src/editor/maskEditor.js:799-805) -> updateCameraPan (src/editor/maskEditor.js:807-811)
- bindCanvasEvents (src/editor/maskEditor.js:628-746) -> paintAt (src/editor/maskEditor.js:961-973) -> undoStack (src/editor/maskEditor.js:882-886)

### validated

- bindCanvasEvents -> mouseRequestsCameraPan -> beginCameraPan -> updateCameraPan
  - validation: `node --test tests/maskEditor.test.js` covers right-click drag
    viewport movement without mask, undo, tool, or `onChange` mutation.
- bindCanvasEvents -> contextmenu preventDefault
  - validation: `node --test tests/maskEditor.test.js` covers canvas
    contextmenu suppression.

### discarded

- Global document-level context menu suppression
  - reason: only the canvas editing surface should override the browser menu.

## Validation Plan

- `node --test tests/maskEditor.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `git diff --check`

## Progress Notes

- Recommended design: mouse right button acts as temporary camera pan, equivalent
  to Spacebar pan, while pen right/eraser button keeps the existing temporary
  eraser behavior.
- RED confirmed right-click did not pan and no contextmenu listener existed.
- GREEN adds mouse-only right-click pan and canvas-only contextmenu prevention.

## Closeout

- `node --test tests/maskEditor.test.js` passed with 24 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 356 tests.
- `git diff --check` passed.
- User manual, feature status, and remaining work board updated.
- Code review: no blocking issue found. The right-click branch is mouse-only,
  so existing pen eraser-button and touch gesture paths remain separate. The
  focused test covers viewport mutation without mask, undo, tool, or `onChange`
  mutation.
