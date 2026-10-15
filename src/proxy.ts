import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const protectedPaths = ['/notes', '/workspace', '/dashboard', '/pro']

export async function proxy(request: NextRequest) {
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`),
  )
  // This is only an early navigation check. The API remains responsible for
  // validating the signed session and authorizing every protected resource.
  let hasSession = false
  if (getSessionCookie(request)) {
    try {
      const response = await fetch((process.env.AUTH_BACKEND_URL ?? 'http://localhost:3002') + '/api/auth/get-session', {
        headers: {
          cookie: request.headers.get('cookie') ?? '',
          'x-incantly-client-ip': request.headers.get('x-incantly-client-ip') ?? '',
          'x-incantly-client-time': request.headers.get('x-incantly-client-time') ?? '',
          'x-incantly-client-signature': request.headers.get('x-incantly-client-signature') ?? '',
        }, cache: 'no-store', signal: AbortSignal.timeout(5000),
      })
      const session = response.ok ? await response.json() : null
      hasSession = Boolean(session?.user?.id)
    } catch { hasSession = false }
  }

  if (isProtected && !hasSession) {
    const login = new URL('/auth', request.url)
    login.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/notes/:path*', '/workspace/:path*', '/dashboard/:path*', '/pro/:path*'],
}
