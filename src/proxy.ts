import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const protectedPaths = ['/notes', '/workspace', '/dashboard', '/pro']

export function proxy(request: NextRequest) {
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`),
  )
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
  matcher: ['/notes/:path*', '/workspace/:path*', '/dashboard/:path*', '/pro/:path*'],
}
