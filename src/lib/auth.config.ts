import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

/**
 * Edge-compatible auth config — no Prisma, no bcrypt, no Node.js-only modules.
 * Used by middleware (which runs on the Edge Runtime).
 * Full config with PrismaAdapter + Credentials is in auth.ts.
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id
      if ((user as { role?: string })?.role) token.role = (user as { role?: string }).role
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id
      if (token.role) (session.user as { role?: string }).role = token.role
      return session
    },
  },
}
