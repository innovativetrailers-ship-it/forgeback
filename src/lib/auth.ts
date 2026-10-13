import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { authSecret, requiredEnv } from './auth/requiredEnv'

async function refreshGoogleAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null
  return { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
}

const isBuildTime =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export'

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret(),
  adapter: isBuildTime ? undefined : PrismaAdapter(db),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  trustHost: true,
  logger: {
    error(code, ...message) {
      console.error('[Auth Error]', code, JSON.stringify(message))
    },
  },
  providers: [
    Google(
      isBuildTime
        ? { clientId: 'build', clientSecret: 'build' }
        : {
            clientId:     requiredEnv('GOOGLE_CLIENT_ID'),
            clientSecret: requiredEnv('GOOGLE_CLIENT_SECRET'),
            authorization: {
              params: {
                access_type: 'offline',
                prompt: 'consent',
              },
            },
          },
    ),
    Credentials({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (process.env.NODE_ENV === 'development' && credentials?.email === 'dev@cinema.local') {
          return { id: 'dev-user-001', email: 'dev@cinema.local', name: 'Dev User', role: 'ADMIN', creditBalance: 9_999_999 }
        }

        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where:  { email: credentials.email as string },
          select: { id: true, email: true, name: true, avatarUrl: true, role: true, creditBalance: true, passwordHash: true, subscriptionTier: true, subscriptionStatus: true },
        })

        if (!user?.passwordHash) return null

        const isValid = await bcrypt.compare(credentials.password as string, user.passwordHash)
        if (!isValid) return null

        return {
          id:                 user.id,
          email:              user.email,
          name:               user.name,
          image:              user.avatarUrl,
          role:               user.role,
          creditBalance:      user.creditBalance,
          subscriptionTier:   user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
        }
      },
    }),
  ],
  events: {
    async signIn({ user, isNewUser }) {
      console.log('[auth] signIn event:', { userId: user?.id, isNewUser })
    },
    async session({ session }) {
      console.log('[auth] session event: user', session?.user?.id)
    },
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      console.log('[auth] jwt callback:', { hasUser: !!user, hasAccount: !!account })
      try {
        if (account?.refresh_token) token.refreshToken = account.refresh_token
        if (account?.access_token) token.accessToken = account.access_token
        if (account?.expires_at) token.accessExpires = account.expires_at * 1000
        const refreshToken = typeof token.refreshToken === 'string' ? token.refreshToken : ''
        const accessExpires = typeof token.accessExpires === 'number' ? token.accessExpires : 0
        if (refreshToken && accessExpires && Date.now() > accessExpires - 60_000) {
          const refreshed = await refreshGoogleAccessToken(refreshToken)
          if (refreshed) {
            token.accessToken = refreshed.accessToken
            token.accessExpires = refreshed.expiresAt
          } else {
            console.warn('[auth] Google access token was not refreshed. The session stays.')
          }
        }
        if (user) {
          token.id                 = user.id
          token.role               = (user as any).role
          token.creditBalance      = (user as any).creditBalance
          token.subscriptionTier   = (user as any).subscriptionTier
          token.subscriptionStatus = (user as any).subscriptionStatus
        }
        return token
      } catch (err: any) {
        console.error('[auth] jwt callback error:', err.message)
        return token
      }
    },
    async session({ session, token }) {
      try {
        if (token && session.user) {
          session.user.id = (token.id ?? token.sub) as string
          ;(session.user as any).role               = token.role ?? 'FREE'
          ;(session.user as any).creditBalance      = token.creditBalance ?? 0
          ;(session.user as any).subscriptionTier   = token.subscriptionTier ?? 'free'
          ;(session.user as any).subscriptionStatus = token.subscriptionStatus ?? 'trial'
        }
        return session
      } catch (err: any) {
        console.error('[auth] session callback error:', err.message)
        return session
      }
    },
  },
})

