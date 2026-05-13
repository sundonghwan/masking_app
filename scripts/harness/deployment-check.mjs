const args = process.argv.slice(2);
const jsonOutput = takeFlag("--json");
const baseUrl = normalizeBaseUrl(args[0] || process.env.MASKING_APP_BASE_URL || defaultBaseUrl());
const healthUrl = new URL("/api/health", baseUrl);

const result = {
  ok: false,
  checked_at: new Date().toISOString(),
  base_url: baseUrl,
  health_url: healthUrl.toString(),
  status: 0,
  deployment: null,
  ai_serving: null,
  errors: [],
};

try {
  const response = await fetch(healthUrl, {
    headers: {
      accept: "application/json",
    },
  });
  result.status = response.status;
  const body = await response.json();
  result.deployment = body.deployment || null;
  result.ai_serving = body.ai_serving || null;

  if (!response.ok) {
    result.errors.push({ code: "health_not_ok", status: response.status });
  }
  if (body.ok !== true || body.service !== "masking-app-backend") {
    result.errors.push({ code: "unexpected_health_payload" });
  }
  if (!body.deployment || typeof body.deployment.mode !== "string") {
    result.errors.push({ code: "deployment_profile_missing" });
  }
  if (!body.ai_serving || !Array.isArray(body.ai_serving.tasks)) {
    result.errors.push({ code: "ai_capabilities_missing" });
  }
} catch (error) {
  result.errors.push({ code: "health_request_failed", message: error.message });
}

result.ok = result.errors.length === 0;
printResult();
process.exit(result.ok ? 0 : 1);

function takeFlag(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  const withProtocol = /^https?:\/\//u.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function defaultBaseUrl() {
  const host = process.env.MASKING_APP_HOST || "127.0.0.1";
  const port = process.env.PORT || process.env.MASKING_APP_PORT || "4173";
  return `http://${host}:${port}`;
}

function printResult() {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`deployment-check: ${result.ok ? "passed" : "failed"} url=${result.health_url}`);
  if (result.deployment) {
    console.log(`deployment-check: deployment=${JSON.stringify(result.deployment)}`);
  }
  if (result.ai_serving) {
    console.log(`deployment-check: ai_serving=${JSON.stringify(result.ai_serving)}`);
  }
  for (const error of result.errors) {
    console.error(`deployment-check: error ${error.code}${error.message ? ` ${error.message}` : ""}`);
  }
}
