# Release Checklist

This project does not have a deployable app yet. Use this checklist once an app
stack and release target exist.

## Required Before First Real Release

- `harness/commands.md` defines install, dev, build, lint, typecheck, test, and
  smoke commands.
- CI runs the same wrapper commands used locally.
- Environment variables are documented.
- Storage path and export path behavior are verified.
- Dataset export has a fixture-based validation check.
- Main editor has at least one browser smoke test.

## Release Checks

- Run lint.
- Run typecheck.
- Run targeted tests for changed areas.
- Run smoke for project home, upload, editor, save, submit, and export.
- Verify export ZIP structure.
- Verify `annotations.json` uses relative archive paths.
- Record any skipped checks and release risk.
