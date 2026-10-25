/**
 * While the waitlist is on, nobody signs in: the sign-in pages and endpoints
 * are closed and the landing page links to the waitlist only. Fixed at build
 * time; `npm run build:cf` defaults it to `false`, local development stays open.
 */
export function signInOpen() {
  return process.env.NEXT_PUBLIC_SIGN_IN_OPEN !== 'false'
}
