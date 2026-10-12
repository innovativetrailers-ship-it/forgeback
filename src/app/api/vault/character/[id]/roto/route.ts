import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { rotoAndOverlay } from '@/lib/character/roto'
import { ROTO_OVERLAY_CREDITS, type FccRotoRequest } from '@/lib/character/characterMotion'
import { getFCCCharacter } from '@/lib/character/fccManager'
import { requireUserId } from '@/lib/character/auth'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const body = (await request.json()) as FccRotoRequest
  if (!body.videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })
  if (!body.mode) return NextResponse.json({ error: 'mode required' }, { status: 400 })

  const character = await getFCCCharacter(id, userId)
  if (body.mode === 'character' && !character?.refFront) {
    return NextResponse.json({ error: 'Character DNA required for character roto mode' }, { status: 400 })
  }

  try {
    await checkAndDeductCredits(userId, 'character_roto')
  } catch (e) {
    console.warn("[caught] src/app/api/vault/character/[id]/roto/route.ts:28", e instanceof Error ? { name: e.name, message: e.message } : e)

    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  try {
    const videoUrl = await rotoAndOverlay(body.videoUrl, body.mode, character ?? undefined)
    return NextResponse.json({ videoUrl })
  } catch (e) {
    await refundCredits(userId, ROTO_OVERLAY_CREDITS, 'character_roto').catch((err) => logCaught('app/api/vault/character/[id]/roto/route', err))
    const message = e instanceof Error ? e.message : 'Roto failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
