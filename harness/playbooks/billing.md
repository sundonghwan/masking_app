# Billing Playbook

## Current State

Billing is not part of the current product plan. Do not introduce billing,
payments, subscriptions, invoices, or webhook payment flows unless explicitly
requested.

## If Billing Is Added Later

Create a real billing playbook before implementation. It should define:

- provider
- checkout/session flow
- webhook verification
- subscription state model
- idempotency strategy
- retry behavior
- local test fixtures
- smoke/integration checks

## Required Rule

Any future billing work is high-risk and requires impact chains before editing.
