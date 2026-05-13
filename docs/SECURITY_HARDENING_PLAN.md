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
- there is no TLS/reverse proxy policy
- there is no CSRF/CORS policy for browser deployment beyond same-origin local
  operation
- there is no password reset, lockout, rotation, or audit retention policy

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
- Add a startup warning when default passwords are detected. Pending.
- Add a verifier check that can fail deployment if default passwords remain.
  Implemented baseline: `scripts/harness/security-check.sh --strict`.

### 2. Hash Stored Passwords

- Store password hashes, not plaintext. Implemented for newly seeded, created,
  and rotated local users through `src/server/passwords.js`.
- Use a modern password hashing algorithm available in the deployment runtime.
  Current baseline: PBKDF2-SHA256 with per-password salt.
- Keep a one-time migration path from current plaintext local files. Pending.

### 3. Session Policy

- Replace `Math.random()` token generation with cryptographic randomness.
  Implemented baseline: `src/server/sessionToken.js`.
- Make session TTL configurable.
- Add session rotation on login and explicit cleanup guidance.
- Consider HttpOnly cookies only when CSRF strategy is also decided.

### 4. Network Boundary

- Define allowed deployment hosts and CORS behavior.
- Put TLS termination and reverse proxy policy in the deployment runbook.
- Reject unsafe public-root or data-root settings at startup when in production
  mode.

### 5. Audit And Retention

- Persist login/logout/admin/user/review/export events with retention rules.
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
- session lifetime and cleanup are configured
- role checks are covered by automated tests and browser smoke
- TLS/reverse proxy/CORS/CSRF decisions are documented
- audit logs can answer who logged in, changed users, reviewed data, and
  exported datasets

## Current Recommendation

Keep the current local MVP auth for local/staging-only work while dataset and
workflow features stabilize. Before any shared network deployment, implement at
least default-password blocking, hashed password storage, cryptographic session
tokens, and explicit network boundary checks.
