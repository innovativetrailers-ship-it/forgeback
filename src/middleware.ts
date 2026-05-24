import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/signup',
  '/api/auth',
  '/api/webhooks',
  '/api/health',
  '/review',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth
  const userId = session?.user?.id
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'FREE'

  // Redirect unauthenticated users on protected pages (not API routes)
  if (!userId && !isPublic(pathname) && !pathname.startsWith('/api/')) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Inject x-user-id / x-user-role so API route handlers can read them
  if (userId) {
    const headers = new Headers(req.headers)
    headers.set('x-user-id', userId)
    headers.set('x-user-role', userRole)
    return NextResponse.next({ request: { headers } })
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)).*)',
  ],
}
