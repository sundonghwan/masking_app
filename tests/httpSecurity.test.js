import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHttpSecurityHeaders,
  createHttpSecurityPolicy,
  handleCorsPreflight,
} from "../src/server/httpSecurity.js";

test("security policy applies baseline browser hardening headers", () => {
  const policy = createHttpSecurityPolicy({});
  const response = createFakeResponse();

  applyHttpSecurityHeaders(response, { headers: {} }, policy);

  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "same-origin");
  assert.match(response.headers["content-security-policy"], /default-src 'self'/);
});

test("security policy only allows configured CORS origins", () => {
  const policy = createHttpSecurityPolicy({
    MASKING_APP_ALLOWED_ORIGINS: "https://label.example.com, https://review.example.com",
  });
  const allowed = createFakeResponse();
  const denied = createFakeResponse();

  applyHttpSecurityHeaders(allowed, { headers: { origin: "https://label.example.com" } }, policy);
  applyHttpSecurityHeaders(denied, { headers: { origin: "https://evil.example.com" } }, policy);

  assert.equal(allowed.headers["access-control-allow-origin"], "https://label.example.com");
  assert.equal(allowed.headers.vary, "Origin");
  assert.equal(denied.headers["access-control-allow-origin"], undefined);
});

test("cors preflight succeeds only for configured origins", () => {
  const policy = createHttpSecurityPolicy({
    MASKING_APP_ALLOWED_ORIGINS: "https://label.example.com",
  });
  const allowed = createFakeResponse();
  const denied = createFakeResponse();

  const allowedHandled = handleCorsPreflight({
    method: "OPTIONS",
    headers: { origin: "https://label.example.com" },
  }, allowed, policy);
  const deniedHandled = handleCorsPreflight({
    method: "OPTIONS",
    headers: { origin: "https://evil.example.com" },
  }, denied, policy);

  assert.equal(allowedHandled, true);
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.ended, true);
  assert.equal(allowed.headers["access-control-allow-origin"], "https://label.example.com");
  assert.equal(deniedHandled, true);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.ended, true);
});

function createFakeResponse() {
  return {
    headers: {},
    statusCode: 0,
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, value);
      }
    },
    end() {
      this.ended = true;
    },
  };
}
