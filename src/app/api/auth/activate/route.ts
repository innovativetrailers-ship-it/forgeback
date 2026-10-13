import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { UserRole } from '@/generated/prisma/client'
import { requireUser } from '@/lib/auth/requireUser'

const ROLE_MAP: Record<string, UserRole> = {
  free: 'FREE',
  pro: 'PRO',
  studio: 'STUDIO',
  ultimate: 'STUDIO',
}

const CREDITS_MAP: Record<string, number> = {
  free: 50,
  pro: 500,
  studio: 2000,
  ultimate: 6000,
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  const body = await req.json()
  const { userId: bodyUserId, planId, paymentProvider, externalPaymentId } = body

  const uid = userId ?? bodyUserId
  if (!uid) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (!planId || !ROLE_MAP[planId]) return NextResponse.json({ error: 'invalid planId' }, { status: 400 })

  // For paid plans, the webhook will have already verified payment
  // This endpoint is called after Stripe webhook confirms, or directly for free plan
  await db.user.update({
    where: { id: uid },
    data: {
      role: ROLE_MAP[planId],
      creditBalance: CREDITS_MAP[planId],
    },
  })

  return NextResponse.json({ success: true })
}
