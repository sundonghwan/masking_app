# Magic Tool Edge Band Design

## Goal

Make the magic tool select the clicked object's interior and its visible border
pixels together, instead of treating strong edges only as a hard stop.

## Current Problem

`selectEdgeAwareRegionFromImageData` uses a Sobel-like edge magnitude map to
prevent flood fill from crossing strong boundaries. That protects against
background spill, but it also means border pixels are often excluded from the
mask. The result is a mask that fills the inside but misses the actual contour.

## Chosen Approach

Use the recommended B option: after the existing edge-aware interior region is
found, add a small edge band around that region.

The edge band should:

- only expand from already selected interior pixels
- use the existing `edgeThreshold` to identify likely border pixels
- use a small radius, defaulting to `2`, so it can catch realistic object
  outlines without flooding into the background
- use a separate edge-band color tolerance guard so high edge thresholds do not
  accidentally make background pixels eligible
- respect `maxPixels`
- run before smoothing so the final mask remains natural

## Non-goals

- Do not add a full Canny/GrabCut pipeline in this slice.
- Do not change the UI controls yet.
- Do not change saved mask format, label handling, or export behavior.

## Expected Behavior

When a user clicks inside an object:

```text
old: interior only
new: interior + adjacent high-edge contour pixels
```

The magic tool should still avoid crossing beyond the contour into the
background.

## Verification

- Add a focused unit test showing that a dark object border around a clicked
  interior is included.
- Keep the existing test that verifies strong edges still stop background spill.
- Run the mask editor tests and the standard harness checks.
