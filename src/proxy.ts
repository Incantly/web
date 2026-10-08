import { NextResponse, type NextRequest } from 'next/server'

const protectedPaths = ['/notes', '/workspace', '/dashboard', '/pro']

export function proxy(request: NextRequest) {
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`),
  )
  const hasSession = request.cookies.get('incantly_session')?.value === 'active'

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
