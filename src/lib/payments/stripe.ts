import Stripe from 'stripe'

const globalForStripe = globalThis as unknown as { stripe: Stripe | undefined }

export const stripe: Stripe =
  globalForStripe.stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-12-18.acacia' as Parameters<typeof Stripe>[1]['apiVersion'],
    typescript:  true,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForStripe.stripe = stripe
}

export const CREDIT_VALUE_USD   = 0.05
export const CREDITS_PER_DOLLAR = 20
export const PLATFORM_FEE_RATE  = 0.20

export function creditsToUSDCents(credits: number): number {
  return Math.round(credits * CREDIT_VALUE_USD * 100)
}

export function usdCentsToCredits(cents: number): number {
  return Math.floor((cents / 100) * CREDITS_PER_DOLLAR)
}
