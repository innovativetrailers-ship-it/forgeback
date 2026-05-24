import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { db } from './db'

const isBuildTime =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export'

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
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
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (process.env.NODE_ENV === 'development' && credentials?.email === 'dev@cinema.local') {
          return { id: 'dev-user-001', email: 'dev@cinema.local', name: 'Dev User', role: 'STUDIO', creditBalance: 99999 }
        }

        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user?.passwordHash) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          role: user.role,
          creditBalance: user.creditBalance,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role
        token.creditBalance = (user as { creditBalance?: number }).creditBalance
      }
      return token
    },
    async session({ session, token }) {
      if (isBuildTime) return session

      if (token) {
        session.user.id = token.id as string
        ;(session.user as { role?: string }).role = token.role as string
        ;(session.user as { creditBalance?: number }).creditBalance =
          token.creditBalance as number

        // Sync live credit balance from DB on every session check
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: { creditBalance: true, role: true },
        })
        if (dbUser) {
          ;(session.user as { creditBalance?: number }).creditBalance = dbUser.creditBalance
          ;(session.user as { role?: string }).role = dbUser.role
        }
      }
      return session
    },
  },
})

