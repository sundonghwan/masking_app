# Incident Debug Checklist

Use this when a regression or production-like failure appears.

## First Pass

- What user journey failed?
- What changed recently?
- Is the failure in UI rendering, API contract, storage, validation, or export?
- Can the failure be reproduced locally?

## Evidence

- Capture exact command, route, file, image ID, project ID, or export ID.
- Preserve failing input image or mask fixture when possible.
- Record browser console or backend logs when available.

## Masking App Specific

- For editor failures, check viewport transform and image coordinate mapping.
- For save failures, check PNG dimensions and pixel values.
- For export failures, check current mask path and `annotations.json` paths.
- For upload failures, check file extension, decodability, and duplicate names.

## Closeout

- Add a targeted regression test or smoke check when practical.
- Add a lesson only if the failure pattern is reusable.
