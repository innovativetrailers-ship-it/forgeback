import { db } from '../db'
import type { UserRole } from '@/generated/prisma/client'

const ROLE_MAP: Record<string, UserRole> = {
  free:     'FREE',
  pro:      'PRO',
  studio:   'STUDIO',
  ultimate: 'STUDIO', // Map ultimate → STUDIO until schema migration adds ULTIMATE
  admin:    'ADMIN',
}

const CREDITS_MAP: Record<string, number> = {
  free:     50,
  pro:      500,
  studio:   2000,
  ultimate: 6000,
  admin:    9_999_999,
}

async function verifyStripePayment(paymentIntentId: string): Promise<void> {
  const stripe = (await import('stripe')).default
  const client = new stripe(process.env.STRIPE_SECRET_KEY!)
  const pi = await client.paymentIntents.retrieve(paymentIntentId)
  if (pi.status !== 'succeeded') {
    throw new Error(`Stripe payment not succeeded: ${pi.status}`)
  }
}


async function sendWelcomeEmail(userId: string): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
    if (!user?.email) return
    // Placeholder — wire to your email provider (Resend, SendGrid, etc.)
    console.info(`[welcome-email] Would send welcome to ${user.email}`)
  } catch (err) {
    console.warn("[caught] src/lib/auth/verification.ts:36", err instanceof Error ? { name: err.name, message: err.message } : err)

    // Non-fatal — don't block activation on email failure
  }
}

export async function activateUser(params: {
  userId: string
  planId: 'pro' | 'studio' | 'ultimate' | 'free'
  paymentProvider?: 'stripe'
  externalPaymentId?: string
}): Promise<void> {
  if (params.paymentProvider === 'stripe' && params.externalPaymentId) {
    await verifyStripePayment(params.externalPaymentId)
  }

  const role = ROLE_MAP[params.planId] ?? 'FREE'
  const credits = CREDITS_MAP[params.planId] ?? 50

  await db.user.update({
    where: { id: params.userId },
    data: {
      role,
      creditBalance: credits,
      subscriptionTier:   params.planId === 'free' ? 'free' : params.planId,
      subscriptionStatus: params.planId === 'free' ? 'trial' : 'active',
    },
  })

  await sendWelcomeEmail(params.userId)
}
