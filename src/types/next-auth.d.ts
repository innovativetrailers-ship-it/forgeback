import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      creditBalance: number
    } & DefaultSession['user']
  }

  interface User {
    id?: string
    role?: string
    creditBalance?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    creditBalance?: number
  }
}
