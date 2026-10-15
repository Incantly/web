# Authentication setup

Current flow (October 14): both email signup and login use a six-digit OTP. Signup collects first name, last name, and email, then moves to code entry. Passwords, forgot-password, and verification-link controls are removed. Resend code is available only on code entry after a 30-second cooldown. Google authentication and the left-side shader remain. The old reset-password page redirects to `/auth`. Password flow descriptions below are historical and superseded.

The frontend uses the official Better Auth client with same-origin `/api/auth/*` requests and HttpOnly cookies. Next.js rewrites those requests to `AUTH_BACKEND_URL` (local default `http://localhost:3002`). Google/password authentication and email delivery are implemented in the Nest backend; this frontend has no provider secrets or database credentials.

Set `AUTH_BACKEND_URL` on the Next.js server and `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` when the backend's Google client credentials are configured. Backend `BETTER_AUTH_URL` must be the public frontend URL, locally `http://localhost:3000`, and that origin must be in backend `WEB_ORIGINS`. The Google callback is `/api/auth/callback/google` on the frontend origin. Do not use `NEXT_PUBLIC_AUTH_BASE_URL`; it is no longer consumed.

Get started opens `/auth/signup`. Users enter first name, last name, email, and a password of at least 12 characters, then verify email. `/auth` provides email/password login and Google. Forgot password sends a Resend reset link to `/auth/reset-password`; a completed reset removes the token from the address bar and returns to login. Signup and reset confirmations avoid revealing account existence. Verification resend is available on login. Workspace sign-out invalidates the server session.

Protected-page navigation checks the session with the Nest backend. Every data API must separately authorize the requested resource; a page redirect is not an authorization boundary. Credentials are never persisted in localStorage or IndexedDB.

Run `PLAYWRIGHT_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx playwright test tests/e2e/auth.spec.ts` to test form behavior and all required viewport widths. Tests mock the auth HTTP responses and are not a substitute for the backend PostgreSQL integration tests or live OAuth/provider tests.
