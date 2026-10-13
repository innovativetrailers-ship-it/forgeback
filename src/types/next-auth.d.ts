import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id:                  string
      role:                string
      creditBalance:       number
      subscriptionTier?:   string
      subscriptionStatus?: string
      tier?:               string
    } & DefaultSession['user']
  }

  interface User {
    id?:                  string
    role?:                string
    tier?:                string
    creditBalance?:       number
    subscriptionTier?:    string
    subscriptionStatus?:  string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?:                  string
    role?:                string
    tier?:                string
    creditBalance?:       number
    subscriptionTier?:    string
    subscriptionStatus?:  string
  }
}
