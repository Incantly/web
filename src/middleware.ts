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
  if (!headers) return refuse(403)
  const backend = process.env.AUTH_BACKEND_URL
  return backend ? forward(request, headers, backend) : NextResponse.next({ request: { headers } })
}

// OpenNext's rewrite proxy follows redirects inside the Worker, which swallows
// the backend's 302s (the OAuth callback) and their cookies. Forward here
// instead and hand the backend's response to the browser unchanged.
async function forward(request: NextRequest, headers: Headers, backend: string) {
  headers.delete('cf-connecting-ip')
  headers.delete('host')
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const response = await fetch(new URL(request.nextUrl.pathname + request.nextUrl.search, backend), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit)
  const responseHeaders = new Headers(response.headers)
  // workerd has already decoded the body.
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders })
}

export async function middleware(request: NextRequest) {
  // Better Auth's own error page fails on the backend; the sign-in screen
  // explains OAuth errors instead (and moves a signed-in user on).
  if (request.nextUrl.pathname === '/api/auth/error') {
    const login = new URL('/auth', request.url)
    login.searchParams.set('error', request.nextUrl.searchParams.get('error') ?? 'unknown')
    return NextResponse.redirect(login)
  }
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
