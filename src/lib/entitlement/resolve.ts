import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { desktopAccessFromRows } from './desktopAccess'

export type EntitlementPlan = 'free' | 'pro' | 'ultimate' | 'desktop'
export type EntitlementStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired'

export interface Entitlement {
  plan: EntitlementPlan
  status: EntitlementStatus
  isLive: boolean
  canUseDesktop: boolean
  canUseWeb: boolean
  includedCredits: number
  seats: number
  currentPeriodEnd: string | null
  hasUsedDesktopTrial: boolean
  trialDaysLeft: number | null
  /** Database ADMIN or isInternal. No plan and no expiry. */
  internal: boolean
}

function asPlan(value: string): EntitlementPlan {
  if (value === 'pro' || value === 'ultimate' || value === 'desktop') return value
  return 'free'
}

function asStatus(value: string): EntitlementStatus {
  if (value === 'active' || value === 'trialing' || value === 'past_due' || value === 'canceled') return value
  return 'expired'
}

export async function resolveEntitlement(userId: string): Promise<Entitlement> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { hasUsedDesktopTrial: true, role: true, isInternal: true },
  })
  const rows = await db.subscription.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })
  const access = desktopAccessFromRows(
    user ? { role: user.role, isInternal: user.isInternal, hasUsedDesktopTrial: user.hasUsedDesktopTrial } : null,
    rows.map((row) => ({
      plan: row.plan,
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
      seats: row.seats,
    })),
  )
  return {
    plan: access.plan,
    status: access.status,
    isLive: access.isLive,
    canUseDesktop: access.canUseDesktop,
    canUseWeb: true,
    includedCredits: 0,
    seats: access.seats,
    currentPeriodEnd: access.currentPeriodEnd,
    hasUsedDesktopTrial: access.hasUsedDesktopTrial,
    trialDaysLeft: access.trialDaysLeft,
    internal: access.internal,
  }
}

export async function upsertSubscription(input: {
  userId: string
  providerSubId: string
  providerCustomerId?: string | null
  plan: string
  status: string
  currentPeriodEnd?: Date | null
}): Promise<void> {
  await db.subscription.upsert({
    where: { providerSubId: input.providerSubId },
    create: {
      userId: input.userId,
      providerSubId: input.providerSubId,
      providerCustomerId: input.providerCustomerId ?? null,
      plan: asPlan(input.plan),
      status: asStatus(input.status),
      currentPeriodEnd: input.currentPeriodEnd ?? null,
    },
    update: {
      plan: asPlan(input.plan),
      status: asStatus(input.status),
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      providerCustomerId: input.providerCustomerId ?? undefined,
    },
  })
}

function secret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''
}

export function signEntitlementToken(claims: Record<string, unknown>, ttlSec = 86_400): string {
  const key = secret()
  if (!key) throw new Error('NEXTAUTH_SECRET is not set')
  const body = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url')
  const sig = createHmac('sha256', key).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyEntitlementToken(token: string): Record<string, unknown> | null {
  const key = secret()
  if (!key) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', key).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>
  const exp = Number(claims.exp)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null
  return claims
}
