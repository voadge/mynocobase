# Session Summary — NocoBase Dashboard Plugin

## Goal
Deploy a NocoBase server-only plugin that authenticates `/home` and serves dashboard HTML.

## Architecture (Final)
```
Browser → nginx-proxy (/home location)
         → proxy_pass http://app:13000/api/__dh__
         → NocoBase Gateway (passes API path to app.callback())
         → Plugin middleware (before dataSource)
           → Check auth (cookie → Bearer token → internal /api/auth:check)
           → Authenticated: serve dashboard HTML from /app/nocobase/storage/dashboard/index.html
           → Unauthenticated: 302 redirect to /signin
```

**Why not nginx `auth_request`?** NocoBase's `/api/auth:check` does NOT extract tokens from cookies (only Bearer header). Plugin's cookie→Bearer conversion solves this.

**Why not plugin directly on `/home`?** NocoBase Gateway intercepts all non-API paths for static SPA serving before reaching Koa middleware.

## Key Decisions
1. **Plugin registers middleware BEFORE dataSource** via `{ tag: 'dashboard-home', before: 'dataSource' }` — intercepts `/api/__dh__` before resource manager
2. **`ctx.withoutDataWrapping = true`** — prevents NocoBase response wrapping (`{"data":"..."}`)
3. **Auth flow**: `ctx.state.currentUser` (not set for direct page loads) → fallback: extract `nb_token` cookie → internal HTTP to `127.0.0.1:13000/api/auth:check` with Bearer header
4. **Front nginx-proxy** handles `/home` by proxying to app's Node port directly (13000) bypassing internal nginx

## Files
- **Plugin**: `E:\my-project\nocobase-plugin-dashboard-home\dist\server\index.js`
- **Deployed**: `/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/dist/server/index.js`
- **Front nginx**: `/opt/noco-base/nginx.conf` — `/home` → `http://app:13000/api/__dh__`
- **Dashboard HTML**: `/opt/noco-base/dashboard/index.html` (mounted as `/app/nocobase/storage/dashboard/index.html` in container)

## Testing
- `https://<host>:668/home` without auth → **302** `/signin`
- `https://<host>:668/home` with `nb_token` cookie → **200** HTML
- Plugin endpoint directly: `curl http://app:13000/api/__dh__` → 302/200

## Remaining Concerns
1. **Internal nginx startup script** (`10-dashboard.sh`) adds `auth_request` for `/dashboard/` to internal nginx — conflicts with this approach if `/dashboard/` is accessed directly
2. **Dashboard JS** sets `nb_token` cookie from localStorage for subsequent requests — relies on NocoBase SPA auth flow being present
3. **HEAD requests** to `/api/__dh__` return 404 (middleware checks `ctx.method !== 'GET'`)
