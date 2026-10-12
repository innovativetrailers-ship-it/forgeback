import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateDesktopCloudRequest } from '@/lib/desktop/cloudAuth'

async function caller(request: NextRequest) {
  const userId = await validateDesktopCloudRequest(request)
  if (typeof userId !== 'string') return userId
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { canUseOwnKeys: true, creditBalance: true },
  })
  if (!user) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  return { userId, user }
}

export async function GET(request: NextRequest) {
  const found = await caller(request)
  if (found instanceof NextResponse) return found
  return NextResponse.json({ canUseOwnKeys: found.user.canUseOwnKeys === true })
}

export async function POST(request: NextRequest) {
  const found = await caller(request)
  if (found instanceof NextResponse) return found
  if (!found.user.canUseOwnKeys) {
    return NextResponse.json({ error: 'This account cannot use its own provider key.' }, { status: 403 })
  }
  const body = await request.json().catch((err) => {
    console.warn('[own-key] body', err instanceof Error ? err.message : err)
    return null
  }) as Record<string, unknown> | null
  if (!body || typeof body.endpointKey !== 'string') {
    return NextResponse.json({ error: 'Choose a model.' }, { status: 400 })
  }
  if ('key' in body || 'secret' in body || 'token' in body) {
    return NextResponse.json({ error: 'Do not send a key to the server.' }, { status: 400 })
  }
  await db.creditTransaction.create({
    data: {
      userId: found.userId,
      amount: 0,
      type: 'own-key',
      description: `own-key ${body.endpointKey}`,
      balanceAfter: found.user.creditBalance,
    },
  })
  return NextResponse.json({ ok: true, label: 'own key — not billed by Forge' })
}
