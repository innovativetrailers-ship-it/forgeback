import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import { anonymousApiBlocked, stripSpoofedIdentity } from '@/lib/auth/identity'

const { auth } = NextAuth(authConfig)

const PUBLIC_PAGES = [
  '/login',
  '/register',
  '/signup',
  '/review',
  '/site.webmanifest',
  '/manifest.json',
  '/icon',
  '/apple-icon',
  '/opengraph-image',
]

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((p) => pathname.startsWith(p))
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth
  const userId = session?.user?.id
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'FREE'
  const hasBearer = (req.headers.get('authorization') ?? '').toLowerCase().startsWith('bearer ')

  if (!userId && !isPublicPage(pathname) && !pathname.startsWith('/api/')) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (anonymousApiBlocked(pathname, Boolean(userId), hasBearer)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const headers = stripSpoofedIdentity(req.headers)
  if (userId) {
    headers.set('x-user-id', userId)
    headers.set('x-user-role', userRole)
  }
  return NextResponse.next({ request: { headers } })
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|site\\.webmanifest|manifest\\.json|icon$|apple-icon$|opengraph-image$|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|webmanifest|json|woff2?|ttf|eot)).*)',
  ],
}
