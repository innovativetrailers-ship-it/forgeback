// Edge Runtime-compatible auth config (no Prisma adapter, no db import)
import type { NextAuthConfig } from 'next-auth'
import { authSecret } from './auth/requiredEnv'

export const authConfig = {
  secret:  authSecret(),
  session: { strategy: 'jwt' as const },
  pages:   { signIn: '/login' },
  trustHost: true,
  providers: [],   // providers not needed for middleware JWT reading
  callbacks: {
    authorized({ auth }) {
      // Allow all requests; individual routes enforce their own auth
      return true
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id ?? token.sub) as string
        ;(session.user as any).role               = token.role ?? 'FREE'
        ;(session.user as any).creditBalance      = token.creditBalance ?? 0
        ;(session.user as any).subscriptionStatus = token.subscriptionStatus ?? 'trial'
      }
      return session
    },
  },
} satisfies NextAuthConfig
