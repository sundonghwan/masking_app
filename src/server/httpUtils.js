export const JSON_LIMIT_BYTES = 25 * 1024 * 1024;

export async function readJsonBody(request, limit = JSON_LIMIT_BYTES) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw createHttpError(413, "Request body is too large");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw createHttpError(400, `Invalid JSON body: ${error.message}`);
  }
}

export function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value, null, 2);
  response.writeHead(statusCode, {
    "content-type": "application/json;charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

export function sendBuffer(response, statusCode, buffer, headers = {}) {
  response.writeHead(statusCode, {
    "content-length": buffer.length,
    ...headers,
  });
  response.end(buffer);
}

export function sendEmpty(response, statusCode = 204) {
  response.writeHead(statusCode);
  response.end();
}

export function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function methodNotAllowed(response, allowed) {
  response.writeHead(405, {
    allow: allowed.join(", "),
    "content-type": "application/json;charset=utf-8",
  });
  response.end(JSON.stringify({ error: "method_not_allowed", allowed }));
}

export function notFound(response) {
  sendJson(response, 404, { error: "not_found" });
}
