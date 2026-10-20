# Authentication client identity

Run the Node entry point with `npm run dev` or `npm start`. Do not run bare `next dev` or `next start`: they bypass identity stamping. The custom entry point is required for socket identity, which a Next route or rewrite cannot reliably reconstruct from browser-supplied headers.

Set an independent random `AUTH_PROXY_SECRET` of at least 32 characters in web `.env.local` and backend `.env`. Use the same value on both sides, never a `NEXT_PUBLIC_` variable. Keep these files ignored. Existing auth rewrites remain in place. Protected-page session checks also forward the short-lived signature. Restart both services when changing the secret.

`AUTH_TRUSTED_PROXY_CIDRS` defaults to empty. In that mode browser forwarding headers are ignored and actual socket identity is signed. For a reverse-proxy deployment, allow only the real proxy IP ranges, require it to append or overwrite the actual client address in `X-Forwarded-For`, and restrict direct origin access. Resolution stops at the first untrusted hop walking right-to-left. Incorrectly trusting broad networks or an ingress that preserves arbitrary caller headers defeats that guarantee. Missing or malformed information from a trusted proxy is rejected.

`BIND_ADDRESS` defaults to `127.0.0.1`; containers must explicitly bind an appropriate interface behind restricted ingress. Keep backend traffic private/encrypted and clocks within 30 seconds. Signed assertions are internal request credentials, not browser responses or log fields. The backend rejects unsigned auth requests and configures both Redis and Better Auth limits to use the same verified IP. An assertion can be replayed for that same IP within 30 seconds, so do not expose it.

Deployment requires a Node process. Next standalone output and managed entry points that bypass `server.mjs` require an equivalent trusted ingress before use. Docker Compose was not changed.

Run `node --test server/client-identity.test.mjs` for spoofing, trusted chains, canonicalization and configuration checks. Backend `auth-client-identity.spec.ts` covers HTTP isolation and forgery. The backend k6 auth scenario now targets the web entry point; the isolated backend scenario signs synthetic clients using a test-only secret.
