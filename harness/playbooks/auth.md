# Auth Playbook

## Current State

Authentication and authorization are not part of the MVP implementation yet.
`PROJECT.md` includes workers, reviewers, and admins as product roles, but
`docs/ARCHITECTURE.md` treats login and role-based authorization as post-MVP
unless explicitly added.

## When This Playbook Applies

Use this playbook once implementation adds:

- login/logout
- session or token storage
- protected routes
- worker/reviewer/admin permissions
- assignment or review ownership

## Role Direction

Planned roles:

- worker: edits masks and submits work
- reviewer: reviews submitted masks, approves, rejects, and comments
- admin: creates projects, uploads datasets, assigns work, exports results

## Required Impact Chains

Use impact chains for:

- login submission -> session creation
- protected route guard -> redirect
- role check -> allowed project/image action
- reviewer action -> review record -> image status

Example pattern:

```text
requireRole (src/auth/guards.ts:1-1) -> canReviewImage (src/auth/permissions.ts:1-1) -> approveReview (src/domain/reviews.ts:1-1)
```

## Validation

Once auth exists, minimum smoke checks:

- worker can edit assigned image
- worker cannot approve review
- reviewer can approve/reject submitted image
- admin can export project
- unauthenticated user is redirected or rejected consistently
