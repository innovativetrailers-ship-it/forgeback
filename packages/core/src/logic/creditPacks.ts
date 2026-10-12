/** The only credit-pack catalog. Prices are AUD cents. Stripe price ids stay in env. */

export interface CreditPack {
  id: string
  credits: number
  priceAudCents: number
  label: string
  popular?: boolean
  stripePriceEnv: string
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'credits_100', credits: 100, priceAudCents: 800, label: '100 credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_100' },
  { id: 'credits_500', credits: 500, priceAudCents: 3200, label: '500 credits', popular: true, stripePriceEnv: 'STRIPE_PRICE_CREDITS_500' },
  { id: 'credits_2000', credits: 2000, priceAudCents: 10000, label: '2,000 credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_2000' },
  { id: 'credits_10000', credits: 10000, priceAudCents: 39000, label: '10,000 credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_10000' },
]

const LEGACY_PACK_IDS: Record<string, string> = {
  starter: 'credits_100',
  standard: 'credits_500',
  pro: 'credits_2000',
  professional: 'credits_10000',
}

export function creditPackById(id: string): CreditPack | null {
  const canonical = LEGACY_PACK_IDS[id] ?? id
  return CREDIT_PACKS.find((pack) => pack.id === canonical) ?? null
}

export function creditsForStripePrice(priceId: string, env: Record<string, string | undefined>): number | null {
  if (!priceId) return null
  const pack = CREDIT_PACKS.find((row) => env[row.stripePriceEnv] && env[row.stripePriceEnv] === priceId)
  return pack?.credits ?? null
}
