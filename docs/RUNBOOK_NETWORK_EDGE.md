# Network Edge Runbook

## Audience

Operators exposing Masking App beyond localhost through an internal reverse
proxy or an internet-facing TLS endpoint.

## Objective

Define how the Node app should sit behind TLS/reverse proxy infrastructure, what
environment variables must align with that proxy, and how to verify the network
edge without confusing example config for an installed production setup.

## Architecture

The Node server does not terminate TLS. It should listen on localhost or an
internal interface, while a host-managed reverse proxy terminates TLS and
forwards requests to the app.

```text
Browser
  -> HTTPS reverse proxy
  -> http://127.0.0.1:<MASKING_APP_PORT>
  -> Masking App Node server
  -> filesystem data root
```

Recommended default:

- reverse proxy listens on `443`
- Node server listens on `127.0.0.1:4173` or another private port
- `MASKING_APP_MODE=production`
- `MASKING_APP_HOST=127.0.0.1`
- `MASKING_APP_PUBLIC_URL=https://<your-domain>`
- `MASKING_APP_ALLOWED_ORIGINS=https://<your-domain>`
- `MASKING_APP_DATA_DIR` points outside the repository

## App Environment

Example production app environment:

```bash
MASKING_APP_MODE=production
MASKING_APP_HOST=127.0.0.1
MASKING_APP_PORT=4173
MASKING_APP_PUBLIC_URL=https://masking.example.com
MASKING_APP_ALLOWED_ORIGINS=https://masking.example.com
MASKING_APP_DATA_DIR=/srv/masking-app/data
MASKING_APP_LOG_FILE=/var/log/masking-app/runtime.jsonl
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1
MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1
```

Set `MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1` only when
`docs/PRODUCTION_BOUNDARY_DECISIONS.md` explicitly accepts controlled internal
local identity. For internet-facing deployment, replace local identity with an
external provider first.

## Caddy Example

`/etc/caddy/Caddyfile`:

```caddyfile
masking.example.com {
  encode zstd gzip

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "same-origin"
  }

  reverse_proxy 127.0.0.1:4173 {
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-For {remote_host}
  }
}
```

Verification:

```bash
caddy validate --config /etc/caddy/Caddyfile
curl -I https://masking.example.com/api/health
scripts/harness/deployment-check.sh https://masking.example.com
```

## Nginx Example

`/etc/nginx/conf.d/masking-app.conf`:

```nginx
server {
  listen 80;
  server_name masking.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name masking.example.com;

  ssl_certificate /etc/letsencrypt/live/masking.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/masking.example.com/privkey.pem;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header Referrer-Policy "same-origin" always;

  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Verification:

```bash
sudo nginx -t
curl -I https://masking.example.com/api/health
scripts/harness/deployment-check.sh https://masking.example.com
```

## CORS Policy

The app only returns CORS headers for origins listed in
`MASKING_APP_ALLOWED_ORIGINS`. For same-origin reverse-proxy deployments, the
browser usually does not need CORS, but setting the public origin explicitly is
still useful for controlled integrations.

Example:

```bash
MASKING_APP_ALLOWED_ORIGINS=https://masking.example.com
```

Do not use `*` for production. If multiple trusted internal origins are needed,
use a comma-separated list:

```bash
MASKING_APP_ALLOWED_ORIGINS=https://masking.example.com,https://ops.example.com
```

## Upload Size Alignment

The app upload policy and reverse proxy body limit must agree.

Check app-side settings:

- default upload policy in `src/upload/policy.js`
- per-project upload policy in project settings

Set reverse proxy body size high enough for the largest allowed project upload,
but not arbitrarily unlimited.

## Verification Checklist

Before exposing beyond localhost:

- `MASKING_APP_MODE=production`
- `MASKING_APP_HOST=127.0.0.1` unless the host requires an internal interface
- `MASKING_APP_PUBLIC_URL` matches the HTTPS URL
- `MASKING_APP_ALLOWED_ORIGINS` includes only trusted HTTPS origins
- `production-gate.sh` passes on the target data root
- `deployment-check.sh https://<domain>` passes
- `curl -I https://<domain>/api/health` shows HTTPS response
- TLS certificate auto-renewal is installed or delegated to the platform
- proxy request body limit matches the project upload policy
- runtime logs and proxy logs have retention policies

## Release Notes Fields

Record these before production release:

```text
Public URL:
Reverse proxy: Caddy / Nginx / managed platform
TLS certificate source:
TLS renewal owner:
Node listen address:
MASKING_APP_ALLOWED_ORIGINS:
Proxy upload limit:
deployment-check artifact:
Known edge risks:
```

## Current Verdict

This runbook provides concrete TLS/reverse-proxy templates. It does not mean
TLS or a reverse proxy is installed for the current environment. Final release
still needs target-host evidence.
