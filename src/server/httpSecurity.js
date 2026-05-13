const DEFAULT_ALLOWED_METHODS = "GET,HEAD,POST,PUT,DELETE,OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "authorization,content-type,x-request-id,if-match";

export function createHttpSecurityPolicy(env = {}) {
  return {
    allowedOrigins: parseAllowedOrigins(env.MASKING_APP_ALLOWED_ORIGINS || ""),
    allowedMethods: env.MASKING_APP_CORS_METHODS || DEFAULT_ALLOWED_METHODS,
    allowedHeaders: env.MASKING_APP_CORS_HEADERS || DEFAULT_ALLOWED_HEADERS,
    contentSecurityPolicy: env.MASKING_APP_CONTENT_SECURITY_POLICY || [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  };
}

export function applyHttpSecurityHeaders(response, request, policy = createHttpSecurityPolicy()) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "same-origin");
  response.setHeader("cross-origin-resource-policy", "same-origin");
  response.setHeader("content-security-policy", policy.contentSecurityPolicy);

  const origin = requestOrigin(request);
  if (origin && isAllowedOrigin(origin, policy)) {
    applyCorsHeaders(response, origin, policy);
  }
}

export function handleCorsPreflight(request, response, policy = createHttpSecurityPolicy()) {
  if (request.method !== "OPTIONS") return false;

  const origin = requestOrigin(request);
  if (!origin || !isAllowedOrigin(origin, policy)) {
    response.writeHead(403, {
      "content-type": "application/json;charset=utf-8",
    });
    response.end(JSON.stringify({ error: "cors_origin_not_allowed" }));
    return true;
  }

  applyCorsHeaders(response, origin, policy);
  response.writeHead(204);
  response.end();
  return true;
}

function applyCorsHeaders(response, origin, policy) {
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-methods", policy.allowedMethods);
  response.setHeader("access-control-allow-headers", policy.allowedHeaders);
  response.setHeader("access-control-max-age", "600");
  appendVaryOrigin(response);
}

function appendVaryOrigin(response) {
  const current = response.getHeader ? response.getHeader("vary") : null;
  if (!current) {
    response.setHeader("vary", "Origin");
    return;
  }
  const values = String(current).split(",").map((value) => value.trim().toLowerCase());
  if (!values.includes("origin")) {
    response.setHeader("vary", `${current}, Origin`);
  }
}

function parseAllowedOrigins(value) {
  return String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function requestOrigin(request) {
  return String(request.headers?.origin || request.headers?.Origin || "").trim();
}

function isAllowedOrigin(origin, policy) {
  return policy.allowedOrigins.includes(origin);
}
