import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { next?: string }
  const next = typeof body.next === 'string' && body.next.startsWith('/') ? body.next : '/notes'
  const response = NextResponse.json({ next })
  response.cookies.set('incantly_session', 'active', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
