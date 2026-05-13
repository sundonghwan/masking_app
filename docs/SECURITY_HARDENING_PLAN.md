# Security Hardening Plan

## Audience

Maintainers deciding whether the current local MVP authentication/session model
is acceptable for a deployment target.

## Objective

Make the current security boundary explicit and define the smallest safe path
from local MVP auth toward production-grade identity and session handling.

## Current State

The app has local MVP users and bearer-token sessions:

- default seeded accounts live in `src/server/auth.js`
- persisted user records live under `<data_root>/identity/users.json`
- persisted sessions live under `<data_root>/identity/sessions/*.json`
- protected API routes require bearer sessions and role checks
- browser login derives role from the server; role headers are not trusted

This is enough for local/staging MVP operation. It is not enough for an
internet-exposed production deployment.

## Current Hard Stops

Do not expose this app directly to the public internet while these are true:

- default seeded passwords are still enabled
- passwords are stored as plaintext in `identity/users.json`
- sessions are bearer tokens in local filesystem JSON files
- TLS termination remains external to the Node server and must be configured in
  the deployment host or reverse proxy
- default browser deployment is same-origin only; explicit CORS allowlists are
  available through `MASKING_APP_ALLOWED_ORIGINS`
  operation
- there is no password reset, lockout, or audit retention policy

## Minimum Safe Local/Staging Rules

For local or controlled staging:

1. Bind to `127.0.0.1` unless the network boundary is explicitly controlled.
2. Use a dedicated `MASKING_APP_DATA_DIR` outside the repository.
3. Change default user passwords immediately through the admin UI/API.
4. Back up `identity/` together with project data.
5. Treat session files as credentials.
6. Do not commit `data/`, `.playwright-cli/`, or identity files.

## Recommended Hardening Order

### 1. Remove Default Password Risk

- Force password reset or admin-created credentials on first run. Pending.
- Add startup enforcement when production mode still has default or invalid
  local identity state. Implemented baseline:
  `src/server/productionSafety.js`.
- Add a verifier check that can fail deployment if default passwords remain.
  Implemented baseline: `scripts/harness/security-check.sh --strict`.
- Add a production gate that combines deployment-profile checks, strict
  identity security checks, explicit filesystem-boundary acceptance, explicit
  local-identity acceptance, and dedicated data-root enforcement. Implemented baseline:
  `scripts/harness/production-gate.sh`.

### 2. Hash Stored Passwords

- Store password hashes, not plaintext. Implemented for newly seeded, created,
  and rotated local users through `src/server/passwords.js`.
- Use a modern password hashing algorithm available in the deployment runtime.
  Current baseline: PBKDF2-SHA256 with per-password salt.
- Enforce a minimal local password policy for admin-created and rotated users:
  at least 8 characters with letters plus a number or symbol.
- Keep a one-time migration path from current plaintext local files. Implemented
  baseline: `scripts/harness/identity-migrate-passwords.sh --apply`.

### 3. Session Policy

- Replace `Math.random()` token generation with cryptographic randomness.
  Implemented baseline: `src/server/sessionToken.js`.
- Make session TTL configurable. Implemented baseline:
  `MASKING_APP_SESSION_TTL_MS`.
- Clean up expired persisted sessions during successful login. Implemented
  baseline: the login path calls `sessionStore.cleanupExpiredSessions()` when
  available and logs cleanup failure without blocking credential login.
- Add explicit session rotation guidance.
- Consider HttpOnly cookies only when CSRF strategy is also decided.

### 4. Network Boundary

- Define allowed deployment hosts and set `MASKING_APP_ALLOWED_ORIGINS` only
  for those browser origins.
- Put TLS termination and reverse proxy details in the deployment host config.
- Reject unsafe data-root settings at startup when in production mode.
  Implemented baseline: `src/server/productionSafety.js` rejects production
  startup when `MASKING_APP_DATA_DIR` is inside the repository or filesystem
  production acceptance is missing.

### 5. Audit And Retention

- Persist login/logout/admin/user/review/export events with retention rules.
  Foundation status: `src/server/auditStore.js` can append and list sanitized
  monthly JSONL audit events under `<data_root>/audit/`. Session login/logout
  and local user administration routes now write audit events. Project create,
  archive, restore, purge, image delete/restore, assignment update, successful
  review transitions, project export, immediate training-set export, saved
  training-set create/archive/restore, and saved training-set export routes
  also write audit events. `scripts/harness/audit-verify.sh` verifies
  audit JSONL parseability, required fields, timestamps, outcomes, action
  counts, and unredacted forbidden metadata. `scripts/harness/audit-retention.sh`
  provides explicit dry-run-first retention pruning for whole monthly audit
  files, and only deletes evidence when the operator passes `--apply`.
- Do not log passwords, tokens, image bytes, mask bytes, or data URLs.
- Add a reviewer/admin activity export for incident review if needed.

### 6. External Identity Provider

Move to an external identity provider when the app needs:

- shared users across systems
- password reset and MFA
- centralized deactivation
- organization-level audit
- internet-facing access

## Acceptance Criteria For Production Auth

Production identity can be considered acceptable only when:

- no default credentials are valid
- stored passwords are hashed or delegated to an external provider
- token generation uses cryptographic randomness
- new or rotated local passwords pass the minimum local password policy
- session lifetime and cleanup are configured
- role checks are covered by automated tests and browser smoke
- TLS/reverse proxy/CORS/CSRF decisions are documented
- audit logs can answer who logged in, changed users, reviewed data, and
  exported datasets

## Current Recommendation

Keep the current local MVP auth for local/staging-only work while dataset and
workflow features stabilize. Before any shared network deployment, implement at
least default-password blocking, hashed password storage, cryptographic session
tokens, and explicit network boundary checks. For production-mode release
checks, run `scripts/harness/production-gate.sh` with the real target data root
after backup and password migration. Set
`MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1` only when the team explicitly
accepts the local filesystem user directory as the first production identity
boundary; otherwise replace it with an external identity provider first.
