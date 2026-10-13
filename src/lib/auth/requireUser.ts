import { auth } from '@/lib/auth'
import { authSecret } from '@/lib/auth/requiredEnv'
import { mobileUserId } from '@/lib/auth/mobileJwt'
import { db } from '@/lib/db'
import { verifyEntitlementToken } from '@/lib/entitlement/resolve'

export interface RequestUser {
  id: string
  role: string
  isInternal: boolean
}

/** Session or a signed entitlement bearer. Role comes from the database, never a header. */
export async function requireUser(req: Request): Promise<RequestUser | null> {
  const session = await auth()
  let userId = session?.user?.id ?? null
  if (!userId) {
    const header = req.headers.get('authorization')?.trim() ?? ''
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
    const claims = token ? verifyEntitlementToken(token) : null
    if (claims && typeof claims.userId === 'string') userId = claims.userId
    if (!userId && token) userId = await mobileUserId(token, authSecret())
  }
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isInternal: true },
  })
  if (!user) return null
  return user
}

export async function requireAdmin(req: Request): Promise<RequestUser | null> {
  const user = await requireUser(req)
  if (!user || user.role !== 'ADMIN') return null
  return user
}
