import assert from "node:assert/strict";
import test from "node:test";

import { validatePasswordPolicy } from "../src/server/passwordPolicy.js";

test("password policy accepts the documented minimum local credential shape", () => {
  assert.equal(validatePasswordPolicy("valid-pass"), undefined);
  assert.equal(validatePasswordPolicy("worker123"), undefined);
});

test("password policy rejects trivial or separator-only credentials", () => {
  for (const password of ["password", "weak pass", "short", "12345678", "--------"]) {
    assert.throws(
      () => validatePasswordPolicy(password),
      (error) => error.code === "weak_password" && error.statusCode === 400,
    );
  }
});
