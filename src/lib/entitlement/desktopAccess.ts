/** Desktop access decided from a database user row. Request headers are not an input. */

export interface DesktopUserRow {
  role: string
  isInternal: boolean
  hasUsedDesktopTrial: boolean
}

export interface DesktopSubscriptionRow {
  plan: string
  status: string
  currentPeriodEnd: Date | null
  seats: number
}

export interface DesktopAccess {
  plan: 'free' | 'pro' | 'ultimate' | 'desktop'
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired'
  isLive: boolean
  canUseDesktop: boolean
  internal: boolean
  seats: number
  currentPeriodEnd: string | null
  trialDaysLeft: number | null
  hasUsedDesktopTrial: boolean
}

const LIVE = new Set(['active', 'trialing'])

function asPlan(value: string): DesktopAccess['plan'] {
  if (value === 'pro' || value === 'ultimate' || value === 'desktop') return value
  return 'free'
}

function asStatus(value: string): DesktopAccess['status'] {
  if (value === 'active' || value === 'trialing' || value === 'past_due' || value === 'canceled') return value
  return 'expired'
}

/** The signed-in session or a verified token. A client header is ignored. */
export function entitlementCaller(input: {
  sessionUserId?: string | null
  tokenUserId?: string | null
  headerUserId?: string | null
}): string | null {
  if (input.tokenUserId) return input.tokenUserId
  if (input.sessionUserId) return input.sessionUserId
  return null
}

export function desktopAccessFromRows(
  user: DesktopUserRow | null,
  subscriptions: DesktopSubscriptionRow[],
  now = Date.now(),
): DesktopAccess {
  const internal = user?.role === 'ADMIN' || user?.isInternal === true
  if (internal) {
    return {
      plan: 'desktop',
      status: 'active',
      isLive: true,
      canUseDesktop: true,
      internal: true,
      seats: 99,
      currentPeriodEnd: null,
      trialDaysLeft: null,
      hasUsedDesktopTrial: user?.hasUsedDesktopTrial ?? false,
    }
  }
  const live = subscriptions.find((row) => {
    const status = asStatus(row.status)
    if (!LIVE.has(status)) return false
    if (row.currentPeriodEnd && row.currentPeriodEnd.getTime() < now) return false
    return true
  })
  const plan = live ? asPlan(live.plan) : 'free'
  const status = live ? asStatus(live.status) : 'expired'
  const isLive = Boolean(live)
  const trialDaysLeft = live?.status === 'trialing' && live.currentPeriodEnd
    ? Math.max(0, Math.ceil((live.currentPeriodEnd.getTime() - now) / 86_400_000))
    : null
  return {
    plan,
    status: isLive ? status : 'expired',
    isLive,
    canUseDesktop: isLive && (plan === 'ultimate' || plan === 'desktop'),
    internal: false,
    seats: live?.seats ?? 1,
    currentPeriodEnd: live?.currentPeriodEnd?.toISOString() ?? null,
    trialDaysLeft,
    hasUsedDesktopTrial: user?.hasUsedDesktopTrial ?? false,
  }
}
