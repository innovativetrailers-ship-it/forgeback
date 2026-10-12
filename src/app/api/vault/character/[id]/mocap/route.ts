import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { animatePortraitWithMotion } from '@/lib/character/mocap'
import { MOCAP_BASE_CREDITS, type FccMocapRequest } from '@/lib/character/characterMotion'
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
  const body = (await request.json()) as FccMocapRequest
  if (!body.motionVideoUrl) {
    return NextResponse.json({ error: 'motionVideoUrl required' }, { status: 400 })
  }

  const character = await getFCCCharacter(id, userId)
  if (!character?.refFront) {
    return NextResponse.json({ error: 'Character needs ingested DNA and reference image' }, { status: 400 })
  }

  try {
    await checkAndDeductCredits(userId, 'character_mocap')
  } catch (e) {
    console.warn("[caught] src/app/api/vault/character/[id]/mocap/route.ts:29", e instanceof Error ? { name: e.name, message: e.message } : e)

    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  try {
    const videoUrl = await animatePortraitWithMotion(character.refFront, body.motionVideoUrl, {
      drawMode: body.drawMode,
      resolution: body.resolution,
      strength: body.strength,
      prompt: body.prompt ?? character.behavioralPrompt,
      portraitLabel: character.name,
    })
    return NextResponse.json({ videoUrl })
  } catch (e) {
    await refundCredits(userId, MOCAP_BASE_CREDITS, 'character_mocap').catch((err) => logCaught('app/api/vault/character/[id]/mocap/route', err))
    const message = e instanceof Error ? e.message : 'Mocap failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
