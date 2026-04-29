---
name: Masking App
version: 0.1.0
description: Design system for a browser-based image dataset masking annotation workbench.
colors:
  background:
    app: "#F6F7F8"
    panel: "#FFFFFF"
    canvas: "#E9EDF1"
    elevated: "#FFFFFF"
  text:
    primary: "#182026"
    secondary: "#56616B"
    muted: "#7C8792"
    inverse: "#FFFFFF"
  border:
    subtle: "#DCE2E8"
    strong: "#B8C2CC"
  brand:
    primary: "#176B87"
    primary_hover: "#12566C"
    primary_soft: "#E3F3F7"
  mask:
    overlay: "#E5484D"
    overlay_soft: "#FDE8EA"
    cursor: "#111827"
  status:
    not_started: "#8A94A3"
    in_progress: "#1C7ED6"
    submitted: "#0C8F5C"
    approved: "#087F5B"
    rejected: "#D64545"
    warning: "#B7791F"
typography:
  font_family:
    ui: "Inter, Pretendard, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    mono: "JetBrains Mono, SFMono-Regular, Menlo, Consolas, monospace"
  sizes:
    xs: "11px"
    sm: "12px"
    md: "14px"
    lg: "16px"
    xl: "20px"
    title: "24px"
  weights:
    regular: 400
    medium: 500
    semibold: 600
    bold: 700
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
radii:
  xs: "4px"
  sm: "6px"
  md: "8px"
shadows:
  panel: "0 1px 2px rgba(16, 24, 40, 0.06)"
  popover: "0 12px 32px rgba(16, 24, 40, 0.16)"
components:
  button:
    radius: "{radii.sm}"
    height_sm: "32px"
    height_md: "36px"
  panel:
    radius: "{radii.md}"
    border: "{colors.border.subtle}"
  input:
    radius: "{radii.sm}"
    height: "34px"
  status_chip:
    radius: "{radii.xs}"
    height: "22px"
layout:
  app_min_width: "1280px"
  topbar_height: "56px"
  left_sidebar_width: "280px"
  right_panel_width: "320px"
  statusbar_height: "34px"
---

# Masking App Design System

## Overview

Masking App is a dense, work-focused annotation tool for creating binary mask
datasets from images. The interface should feel closer to an inspection console
or labeling workbench than a marketing SaaS dashboard. The canvas is always the
center of gravity; navigation, tools, validation, and export controls support
the active image editing task.

The design favors fast scanning, clear state, and low visual noise. Decorative
gradients, oversized hero text, large empty cards, and illustration-led sections
are not part of this product language.

## Product Personality

- Precise: tools and statuses should be explicit and compact.
- Operational: screens are optimized for repeated dataset work.
- Trustworthy: save state, validation state, and export eligibility are always visible.
- Calm: neutral backgrounds and restrained color help the red mask overlay stand out.

## Layout Principles

Use a three-panel workbench for the main editor:

- Left: project image queue, thumbnails, filters, and progress.
- Center: large image canvas, mask overlay, brush cursor, viewport controls.
- Right: mode controls, brush settings, overlay settings, validation, metadata.

Use a fixed top bar for project context, undo/redo, save, submit, and export.
Use a compact bottom status bar for zoom, coordinates, selected image index, and
autosave state.

Secondary workflows such as upload, project creation, export review, and quality
dashboard should still use the same token system, compact controls, and precise
table/list layouts.

All generated and implemented screens must share the same application frame:

- 56px top bar with project context on the left and workflow actions on the right.
- 240px to 280px left navigation or queue column when the workflow has lists.
- 300px to 320px right inspector column when the workflow has settings, summary,
  validation, or metadata.
- Main work area uses the same neutral canvas/table surface treatment.
- 34px bottom status bar only on workbench-like screens; dashboard and settings
  screens may omit it when it does not add state.
- No screen may invent a new theme, card style, chart style, or decorative
  background outside this system.

The visual system should look like one product shell with different content, not
seven independent concept screens.

## Color Use

Use `{colors.background.app}` for the full app background and
`{colors.background.panel}` for side panels, dialogs, and tables. Use
`{colors.background.canvas}` only behind the image editor so the active canvas
area reads as a workspace.

The brand color `{colors.brand.primary}` is for primary commands such as create,
upload, submit, and export. Do not use brand color as decorative fill.

The mask color `{colors.mask.overlay}` is reserved for mask overlays, mask
legend, and mask-specific controls. It should remain visually distinct from
error state even though both are red-family colors.

## Typography

Use UI text sizes between 11px and 16px for most application surfaces. Reserve
20px and 24px text for project titles, modal titles, or dashboard page titles.
Avoid hero-scale typography.

Korean labels should be short and control-oriented:

- 프로젝트
- 이미지 목록
- 브러시
- 지우개
- 오버레이
- 저장됨
- 제출
- 내보내기
- 검증

## Components

Buttons should be compact, icon-led where the action is familiar, and text-led
where the command changes workflow state. Use icons for undo, redo, save,
brush, eraser, pan, zoom, download, upload, filter, and search.

Panels should use 8px or smaller radius, subtle borders, and no nested card
composition unless the inner item is a repeated list row or table row.

Status chips must use muted fills and strong text. They should be readable in
image lists and tables without dominating the canvas.

Sliders are the preferred control for brush size and overlay opacity. Segmented
controls are the preferred control for edit modes and display modes.

Tables and lists should share:

- 34px to 40px row height.
- 12px to 14px body text.
- One subtle divider color.
- Muted status chips with the same radius.
- Small thumbnails with square or 4:3 proportions.

Charts, when used, should be secondary and quiet. Use the same axis, legend,
and card treatment across dashboard and export screens.

## Screens

The design system must support these MVP and near-MVP screens:

1. Project list and project creation.
2. Dataset upload and ingest review.
3. Main mask editor workbench.
4. Image review and validation detail.
5. Export setup and export result.
6. Operations dashboard for progress and quality.
7. Keyboard shortcuts/settings.

## Do

- Keep the canvas large and visually dominant.
- Show save and validation state close to the current task.
- Use restrained color and let red mask overlay carry attention.
- Keep controls compact and aligned to predictable grids.
- Use real product workflow labels instead of explanatory marketing copy.

## Do Not

- Do not create a landing page.
- Do not use decorative blobs, bokeh, or purple-blue gradient backgrounds.
- Do not hide critical state such as autosave failure or validation failure.
- Do not place the canvas inside a decorative marketing card.
- Do not let overlay styling affect the saved binary mask contract.
