# Masking App Screen Set

This file defines the design screens needed to implement the MVP and the first
operational extension. Use `DESIGN.md` as the visual contract for all screens.

## Screen 1: Project Home

Purpose:

- Let an admin or worker choose an existing project or create a new one.

Primary UI:

- Project table or list.
- Project status, image count, submitted count, rejected count.
- Create project action.
- Recent export shortcut.

Prompt:

```text
Create a high-fidelity desktop web app screen for Masking App using DESIGN.md.
Screen: Project Home.
Show a compact operational project list, create project button, search/filter,
project progress metrics, recent activity, and recent exports. This is a work
tool, not a landing page. Use Korean UI labels where natural.
```

## Screen 2: Dataset Upload

Purpose:

- Upload image files or a ZIP dataset and review ingest readiness.

Primary UI:

- Upload dropzone.
- File queue.
- Supported format notice.
- Ingest validation results.
- Start project / continue to editor action.

Prompt:

```text
Create a high-fidelity desktop web app screen for Masking App using DESIGN.md.
Screen: Dataset Upload and Ingest Review.
Show project context, drag-and-drop upload zone, file queue with image types and
sizes, validation summary for allowed formats and dimensions, and a primary
continue-to-editor action. Keep the layout compact and operational.
```

## Screen 3: Main Mask Editor

Purpose:

- The primary workbench for binary mask painting.

Primary UI:

- Left image queue.
- Center canvas with image, mask overlay, brush cursor.
- Right brush and validation panel.
- Top save/submit/export controls.
- Bottom status bar.

Prompt:

```text
Create a high-fidelity desktop web app screen for Masking App using DESIGN.md.
Screen: Main Mask Editor Workbench.
Show the three-panel annotation layout: image list with thumbnails and status
chips on the left, a large central canvas with a realistic inspection image and
semi-transparent red binary mask overlay, and a right tool panel with brush,
eraser, view, pan, brush size, overlay opacity, mask color, display mode, and
validation checklist. Include topbar save, undo, redo, submit, export controls
and bottom zoom/coordinate/autosave status.
```

## Screen 4: Review and Validation Detail

Purpose:

- Inspect a submitted mask, approve or reject it, and show validation details.

Primary UI:

- Before/after or overlay compare.
- Validation checklist.
- Rejection reason input.
- Approve and reject actions.
- Metadata side panel.

Prompt:

```text
Create a high-fidelity desktop web app screen for Masking App using DESIGN.md.
Screen: Review and Validation Detail.
Show a submitted image mask review interface with image overlay comparison,
mask-only toggle, validation checklist, reviewer decision controls for approve
and reject, rejection reason field, and image metadata. Keep it dense and
inspection-oriented.
```

## Screen 5: Export Setup and Result

Purpose:

- Configure and generate a dataset export.

Primary UI:

- Export policy selection.
- Included/excluded item counts.
- Validation error table.
- Output file structure preview.
- Download action and export summary.

Prompt:

```text
Create a high-fidelity desktop web app screen for Masking App using DESIGN.md.
Screen: Export Setup and Result.
Show export options for PNG masks, annotations.json, ZIP archive, included and
excluded image counts, validation error table, file tree preview, export summary,
and download action. The design should feel like a precise dataset operations
tool.
```

## Screen 6: Operations Dashboard

Purpose:

- Track dataset work progress and quality.

Primary UI:

- Progress metrics.
- Worker/reviewer workload table.
- Rejection rate.
- Status distribution.
- Recent failures and validation issues.

Prompt:

```text
Create a high-fidelity desktop web app screen for Masking App using DESIGN.md.
Screen: Operations Dashboard.
Show project progress, submitted/approved/rejected counts, status distribution,
worker productivity table, rejection reasons, validation warnings, and recent
activity. Keep it compact and data-dense without making charts the only focus.
```

## Screen 7: Keyboard Shortcuts and Tool Settings

Purpose:

- Show and later customize productivity shortcuts.

Primary UI:

- Shortcut table.
- Tool mode groupings.
- Conflict warning state.
- Reset defaults action.

Prompt:

```text
Create a high-fidelity desktop web app screen for Masking App using DESIGN.md.
Screen: Keyboard Shortcuts and Tool Settings.
Show shortcut groups for brush, eraser, view, pan, zoom, undo, redo, save,
previous, next, submit, and display modes. Include compact editable shortcut
fields, conflict warning example, reset defaults action, and the same restrained
workbench design language.
```

## Recommended Implementation Order

1. Main Mask Editor.
2. Dataset Upload.
3. Export Setup and Result.
4. Project Home.
5. Review and Validation Detail.
6. Operations Dashboard.
7. Keyboard Shortcuts and Tool Settings.

The editor should be implemented first because it proves the hardest visual and
interaction contract: image rendering, mask overlay, brush cursor, state panels,
save state, and validation feedback.
