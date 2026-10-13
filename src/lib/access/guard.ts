// Single source of truth for ALL access decisions.
// Only the one ungated account skips the credit check. An admin role does not.
// Pro (Simple): credits-only OK — no active subscription required.
// Studio/Ultimate: require active billing (active | past_due).

import { db } from '@/lib/db'
import { isUngatedAccount } from '@/lib/billing/accountAllow'
import { shouldMeter } from '@/lib/credits/meter'
import {
  getEffectiveTier,
  getRequiredUpgrade,
  resolveSubscriptionTier,
  TIER_PERMISSIONS,
  type SubscriptionTier,
  type TierPermissions,
} from './tiers'

export type AccessResult =
  | { allowed: true;  isAdmin: boolean; credits: number; tier: SubscriptionTier }
  | {
      allowed: false
      reason: string
      code: 401 | 402 | 403 | 404 | 503
      tier?: SubscriptionTier
      reasonCode?: 'insufficient_credits'
      required?: number
      balance?: number
    }

export function accessDeniedBody(result: Extract<AccessResult, { allowed: false }>): {
  error: string
  code?: 'insufficient_credits'
  required?: number
  balance?: number
} {
  if (result.reasonCode === 'insufficient_credits') {
    return {
      error: result.reason,
      code: 'insufficient_credits',
      required: result.required ?? 0,
      balance: result.balance ?? 0,
    }
  }
  return { error: result.reason }
}

export type TierAccessResult =
  | { allowed: true }
  | { allowed: false; reason: string; requiredTier: SubscriptionTier }

const TIER_LABELS: Record<string, string> = {
  pro:      'Simple ($19/mo)',
  studio:   'Advanced ($49/mo)',
  ultimate: 'Ultimate ($99/mo)',
}

type FeatureFlag = 'studioFeatures' | 'ultimateFeatures' | 'download' | 'directorMode'

async function loadUserAccess(userId: string) {
  return db.user.findUnique({
    where:  { id: userId },
    select: {
      role: true,
      creditBalance: true,
      isInternal: true,
      email: true,
      subscriptions: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { plan: true, status: true },
      },
    },
  })
}

/** Tier comes from the Subscription row. User.subscriptionTier is not read. */
export function tierFieldsFromSubscription(
  subscription: { plan: string; status: string } | null,
  role: string,
): { tier: SubscriptionTier; effectiveTier: SubscriptionTier } {
  const tier = resolveSubscriptionTier(subscription?.plan, subscription?.status, role)
  return { tier, effectiveTier: getEffectiveTier(tier, subscription?.status, role === 'ADMIN') }
}

function tierFromUser(
  user: { role: string; isInternal?: boolean; subscriptions: Array<{ plan: string; status: string }> } | null,
): { tier: SubscriptionTier; effectiveTier: SubscriptionTier; isAdmin: boolean; isInternal: boolean } {
  const isAdmin = user?.role === 'ADMIN'
  const isInternal = user?.isInternal === true
  const fields = tierFieldsFromSubscription(user?.subscriptions[0] ?? null, user?.role ?? 'USER')
  return { ...fields, isAdmin, isInternal }
}

export async function checkAccess(
  userId:          string | null,
  creditsRequired: number = 0,
  featureFlag?:    FeatureFlag,
): Promise<AccessResult> {
  if (!Number.isFinite(creditsRequired) || creditsRequired < 0) {
    return {
      allowed: false,
      reason: 'Cost estimate was not a finite credit number',
      code: 402,
      reasonCode: 'insufficient_credits',
    }
  }

  if (!userId) {
    return { allowed: false, reason: 'Not authenticated', code: 401 }
  }

  const user = await loadUserAccess(userId)
  if (!user) {
    return { allowed: false, reason: 'User not found', code: 404 }
  }

  const { tier, effectiveTier, isAdmin, isInternal } = tierFromUser(user)

  if (isUngatedAccount(user.email, isInternal)) {
    return { allowed: true, isAdmin: true, credits: 0, tier: 'admin' }
  }

  const perms = TIER_PERMISSIONS[tier]
  const effectivePerms = TIER_PERMISSIONS[effectiveTier]

  if (perms.requiresSubscription && effectiveTier === 'free' && tier !== 'free') {
    return {
      allowed: false,
      reason:  `${perms.displayName} features require an active subscription.`,
      code:    402,
      tier,
    }
  }

  const balance = user.creditBalance ?? 0
  const metered = shouldMeter({ isInternal: false, balance, required: creditsRequired })
  if (!metered.allowed) {
    return {
      allowed: false,
      reason:  `Insufficient credits. You have ${balance} credits, this costs ${creditsRequired}.`,
      code:    402,
      tier,
      reasonCode: 'insufficient_credits',
      required: creditsRequired,
      balance,
    }
  }

  if (featureFlag === 'directorMode' && !effectivePerms.maxDirectorModels) {
    return {
      allowed: false,
      reason:  'Director mode requires an upgrade.',
      code:    403,
      tier,
    }
  }

  if (featureFlag && featureFlag !== 'directorMode') {
    const allowed = (effectivePerms as TierPermissions)[featureFlag]
    if (!allowed) {
      return {
        allowed: false,
        reason:  `${String(featureFlag)} requires a higher subscription tier.`,
        code:    403,
        tier,
      }
    }
  }

  return { allowed: true, isAdmin, credits: balance, tier: effectiveTier }
}

export async function checkTierAccess(
  userId:     string | null,
  featureKey: string,
): Promise<TierAccessResult> {
  if (!userId) return { allowed: false, reason: 'Not authenticated', requiredTier: 'pro' }

  const user = await loadUserAccess(userId)
  const { effectiveTier, isAdmin } = tierFromUser(user)

  if (isAdmin) return { allowed: true }

  const required = getRequiredUpgrade(effectiveTier, featureKey)
  if (required) {
    return {
      allowed:      false,
      reason:       `This feature requires ${TIER_LABELS[required] ?? required}`,
      requiredTier: required,
    }
  }

  return { allowed: true }
}

export async function checkDirectorModelLimit(
  userId:        string | null,
  selectedCount: number,
): Promise<TierAccessResult> {
  if (!userId) return { allowed: false, reason: 'Not authenticated', requiredTier: 'pro' }

  const user = await loadUserAccess(userId)
  const { effectiveTier, isAdmin } = tierFromUser(user)
  const perms = TIER_PERMISSIONS[effectiveTier]

  if (isAdmin) return { allowed: true }

  if (selectedCount > perms.maxDirectorModels) {
    const needed: SubscriptionTier =
      selectedCount <= 2 ? 'pro' : selectedCount <= 7 ? 'studio' : 'ultimate'
    return {
      allowed:      false,
      reason:       `Your plan allows ${perms.maxDirectorModels} model${perms.maxDirectorModels === 1 ? '' : 's'} in Director mode.`,
      requiredTier: needed,
    }
  }

  return { allowed: true }
}

export async function deductUserCredits(
  userId:         string,
  amount:         number,
  description:    string,
  vendor?:        string,
  vendorCostUSD?: number,
): Promise<void> {
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { role: true, creditBalance: true },
  })

  if (user?.role === 'ADMIN') return

  const newBalance = (user?.creditBalance ?? 0) - amount

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data:  { creditBalance: { decrement: amount } },
    }),
    db.creditTransaction.create({
      data: {
        userId,
        amount:       -amount,
        description,
        balanceAfter: newBalance,
      },
    }),
    ...(vendor && vendorCostUSD !== undefined
      ? [db.vendorUsageLog.create({
          data: { userId, vendor, operation: description, costUSD: vendorCostUSD, creditCost: amount },
        })]
      : []),
  ])
}
