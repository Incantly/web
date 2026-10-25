import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { hasValidStamp, stampClientIdentity, validSecret } from './lib/auth/clientIdentity'

const protectedPaths = ['/notes', '/workspace', '/dashboard', '/pro']
const backendPaths = ['/api/auth', '/v1']

const matches = (pathname: string, paths: string[]) =>
  paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))

// workerd reports this user agent; Node reports "Node.js/<version>".
const onWorkers = () => typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

const refuse = (status: number) => new NextResponse(status === 403 ? 'Untrusted client identity' : 'Auth proxy unavailable', { status })

// Requests rewritten to the backend (next.config.ts) must carry a signed client
// identity. Under Node, server.mjs stamps from the socket before Next runs, so
// that stamp is checked and left alone. On Workers nothing runs before this, so
// every client-sent stamp is discarded and the request is re-signed from
// CF-Connecting-IP, which Cloudflare sets and overwrites at the edge.
async function signForBackend(request: NextRequest) {
  const secret = process.env.AUTH_PROXY_SECRET
  if (!validSecret(secret)) return refuse(503)
  if (!onWorkers()) {
    return (await hasValidStamp(request.headers, secret)) ? NextResponse.next() : refuse(403)
  }
  const headers = await stampClientIdentity(request.headers, request.headers.get('cf-connecting-ip'), secret)
  return headers ? NextResponse.next({ request: { headers } }) : refuse(403)
}

export async function middleware(request: NextRequest) {
  if (matches(request.nextUrl.pathname, backendPaths)) return signForBackend(request)

  const isProtected = matches(request.nextUrl.pathname, protectedPaths)
  // This is only an early navigation check. The API remains responsible for
  // validating the session and authorizing every protected resource.
  const hasSession = getSessionCookie(request) !== null

  if (isProtected && !hasSession) {
    const login = new URL('/auth', request.url)
    login.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/notes/:path*', '/workspace/:path*', '/dashboard/:path*', '/pro/:path*',
    '/api/auth/:path*', '/v1/:path*',
  ],
}
