# Masking App Design Screens

These images are generated from `PROJECT.md`, `docs/ARCHITECTURE.md`, and
`DESIGN.md`. They are intended as development references, not final locked UI
assets.

Use `screens-v2/` as the current implementation reference. The original
`screens/` set is kept only as an earlier exploration pass.

## Screen Set

| Order | Screen | File |
| --- | --- | --- |
| 1 | Main Mask Editor Workbench | [01-main-mask-editor.png](screens-v2/01-main-mask-editor.png) |
| 2 | Dataset Upload and Ingest Review | [02-dataset-upload.png](screens-v2/02-dataset-upload.png) |
| 3 | Export Setup and Result | [03-export-setup-result.png](screens-v2/03-export-setup-result.png) |
| 4 | Project Home | [04-project-home.png](screens-v2/04-project-home.png) |
| 5 | Review and Validation Detail | [05-review-validation.png](screens-v2/05-review-validation.png) |
| 6 | Operations Dashboard | [06-operations-dashboard.png](screens-v2/06-operations-dashboard.png) |
| 7 | Keyboard Shortcuts and Tool Settings | [07-keyboard-settings.png](screens-v2/07-keyboard-settings.png) |

## Implementation Priority

1. Build the main mask editor first.
2. Add dataset upload and ingest validation.
3. Add mask save, submit, and export flows.
4. Add project home once multiple projects exist.
5. Add review, dashboard, and shortcut settings as the operational layer.

## Design Contract

When implementing screens:

- Use `DESIGN.md` tokens for colors, spacing, radii, typography, and layout.
- Preserve one consistent product shell across screens: same top bar, panel
  rhythm, row density, status chips, and button treatment.
- Keep the canvas dominant on editor and review screens.
- Keep controls compact and icon-led where the action is familiar.
- Treat mask overlay color as visual state only; saved masks remain grayscale
  binary data.
- Avoid landing-page patterns, decorative gradients, and oversized hero text.
