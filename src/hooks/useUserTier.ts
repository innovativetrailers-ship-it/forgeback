import { useQuery } from '@tanstack/react-query'
import {
  getEffectiveTier,
  getRequiredUpgrade,
  resolveSubscriptionTier,
  TIER_DISPLAY_NAMES,
  TIER_PERMISSIONS,
  hasActiveBilling,
  type SubscriptionTier,
} from '@/lib/access/tiers'

interface BalanceResponse {
  isAdmin?:            boolean
  subscriptionTier?:   string | null
  subscriptionStatus?: string | null
  credits?:            number
}

export function useUserTier() {
  const { data } = useQuery<BalanceResponse>({
    queryKey:  ['credits', 'balance'],
    queryFn:   () => fetch('/api/credits/balance', { credentials: 'include' }).then(r => r.json()),
    staleTime: 60_000,
  })

  const isAdmin = data?.isAdmin ?? false
  const tier = (isAdmin
    ? 'admin'
    : resolveSubscriptionTier(data?.subscriptionTier, data?.subscriptionStatus, 'USER')) as SubscriptionTier

  const hasActiveSubscription =
    isAdmin || !TIER_PERMISSIONS[tier].requiresSubscription || hasActiveBilling(data?.subscriptionStatus)

  const effectiveTier = getEffectiveTier(tier, data?.subscriptionStatus, isAdmin)
  const perms = TIER_PERMISSIONS[effectiveTier]

  const canUse = (featureKey: string): boolean =>
    isAdmin || !getRequiredUpgrade(effectiveTier, featureKey)

  return {
    tier,
    effectiveTier,
    displayName:          TIER_DISPLAY_NAMES[tier],
    isAdmin,
    hasActiveSubscription,
    permissions:          perms,
    perms,
    canUseStudio:         perms.studioFeatures,
    canUseUltimate:       perms.ultimateFeatures,
    canDownload:          perms.download,
    canUse,
  }
}
