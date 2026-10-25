# Deploying to Cloudflare Workers

Production runs on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`), as the Worker `incantly-web` at `https://incantly.xyz`. Configuration lives in `wrangler.jsonc` and `open-next.config.ts`. Local development is unchanged: `npm run dev` / `npm start` still run `server.mjs`.

## Client identity on Workers

Workers never run `server.mjs`, so `src/middleware.ts` signs every request that the `next.config.ts` rewrites send to the backend (`/api/auth/*` and `/v1/*`). The middleware picks its behavior from the runtime, not from anything in the request:

- On Workers (`navigator.userAgent === 'Cloudflare-Workers'`), it deletes every incoming `x-incantly-*` identity header, reads the client IP from `CF-Connecting-IP` (set and overwritten by Cloudflare at the edge), and signs it with Web Crypto. A missing or invalid IP gets 403.
- On Node, `server.mjs` has already stamped the request from the socket. The middleware only checks that stamp (fresh, correctly signed) and passes it through unchanged; anything else gets 403. This also closes the gap if someone runs bare `next start`.

This is the edge-runtime `middleware.ts`, not Next 16's `proxy.ts`: `proxy.ts` always runs on the Node runtime, which OpenNext for Cloudflare does not support yet (the build fails and its docs list Node middleware as unsupported). Next 16 still supports `middleware.ts` but prints a deprecation notice; move to `proxy.ts` once OpenNext supports it.

Without a valid `AUTH_PROXY_SECRET` of at least 32 characters the middleware answers 503 and forwards nothing. `src/lib/auth/clientIdentity.test.ts` checks that the Web Crypto signature is byte-identical to `server/client-identity.mjs`.

## Secrets and variables

| Name | Where | Value |
| --- | --- | --- |
| `AUTH_PROXY_SECRET` | Worker secret | Exactly the backend's `AUTH_PROXY_SECRET`. Set with `npx wrangler secret put AUTH_PROXY_SECRET`. Never a `NEXT_PUBLIC_` variable, never in `wrangler.jsonc`. |
| `AUTH_BACKEND_URL` | `wrangler.jsonc` var and build env | `https://api.incantly.xyz`. Next fixes rewrite destinations at build time, so `npm run build:cf` sets it for the build (override by exporting it first). |
| `GITHUB_PACKAGES_TOKEN` | Build env only | A read-only GitHub token (`read:packages`) so `npm ci` can install `@incantly/canvas-*` through the committed `.npmrc`. Never commit it. |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Build env | `true` when the backend has Google credentials. It is inlined at build time. |

## Deploy

Run these yourself; the repo never deploys on its own.

```bash
npx wrangler login
```

```bash
npx wrangler secret put AUTH_PROXY_SECRET
```

```bash
GITHUB_PACKAGES_TOKEN=<read-only token> npm ci
```

```bash
npm run deploy
```

`npm run preview` builds and serves the Worker locally in workerd; put `AUTH_PROXY_SECRET=...` in an ignored `.dev.vars` file first. `npm run cf-typegen` regenerates `cloudflare-env.d.ts` after binding changes.

With Cloudflare Workers Builds (Git integration), use build command `npm run build:cf`, deploy command `npx opennextjs-cloudflare deploy`, and add `GITHUB_PACKAGES_TOKEN` as a build secret. The Worker secret above is still set once with `wrangler secret put`.

## Custom domain

`wrangler.jsonc` sends `incantly.xyz/*` to the Worker with a route, not a custom domain. A route runs in front of the apex's existing proxied DNS record, so that record stays (its origin is never reached). A custom domain would require deleting the record first. The record must stay proxied (orange cloud) for the route to apply. `api.incantly.xyz` stays a proxied A record to the VPS.

## Backend settings

- `AUTH_PROXY_SECRET` must equal the Worker secret. Rotate both together.
- `BETTER_AUTH_URL=https://incantly.xyz`, and `https://incantly.xyz` in `WEB_ORIGINS`.
- The backend trusts only the signed `x-incantly-client-ip`, never `X-Forwarded-For` or `CF-Connecting-IP` on its own hostname: the Worker's subrequest to `api.incantly.xyz` passes through Cloudflare again, which rewrites those headers.

After deploying, `curl -i https://incantly.xyz/api/auth/get-session` should return 200 (no session) rather than 403 `UNTRUSTED_PROXY`.
