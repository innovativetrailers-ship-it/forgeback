// Stripe subscription + credit pack price IDs (from .env.local).

import type { SubscriptionTier } from '@/lib/access/tiers'

export type BillingInterval = 'monthly' | 'yearly'

export const STRIPE_SUBSCRIPTION_PRICES: Record<
  Exclude<SubscriptionTier, 'free' | 'admin'>,
  Record<BillingInterval, string>
> = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    yearly:  process.env.STRIPE_PRICE_PRO_YEARLY ?? '',
  },
  studio: {
    monthly: process.env.STRIPE_PRICE_STUDIO_MONTHLY ?? '',
    yearly:  process.env.STRIPE_PRICE_STUDIO_YEARLY ?? '',
  },
  ultimate: {
    monthly: process.env.STRIPE_PRICE_ULTIMATE_MONTHLY ?? '',
    yearly:  process.env.STRIPE_PRICE_ULTIMATE_YEARLY ?? '',
  },
}

export const STRIPE_CREDIT_PACK_PRICES: Record<string, string> = {
  credits_100:    process.env.STRIPE_PRICE_CREDITS_100 ?? '',
  credits_500:    process.env.STRIPE_PRICE_CREDITS_500 ?? '',
  credits_2000:   process.env.STRIPE_PRICE_CREDITS_2000 ?? '',
  credits_10000:  process.env.STRIPE_PRICE_CREDITS_10000 ?? '',
}

function buildPriceToTierMap(): Record<string, SubscriptionTier> {
  const map: Record<string, SubscriptionTier> = {}
  for (const tier of ['pro', 'studio', 'ultimate'] as const) {
    for (const interval of ['monthly', 'yearly'] as const) {
      const id = STRIPE_SUBSCRIPTION_PRICES[tier][interval]
      if (id) map[id] = tier
    }
  }
  return map
}

export const STRIPE_PRICE_TO_TIER = buildPriceToTierMap()

export function subscriptionPriceId(
  tier: Exclude<SubscriptionTier, 'free' | 'admin'>,
  billing: BillingInterval = 'monthly',
): string | null {
  const id = STRIPE_SUBSCRIPTION_PRICES[tier][billing]
  return id || null
}

export const SUBSCRIPTION_PLAN_CREDITS: Record<
  Exclude<SubscriptionTier, 'free' | 'admin'>,
  number
> = {
  pro:      500,
  studio:   2000,
  ultimate: 6000,
}
