import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { animeTransformVideo } from '@/lib/character/anime'
import { ANIME_TRANSFORM_CREDITS, ANIME_STYLES, type FccAnimeRequest } from '@/lib/character/characterMotion'
import { getFCCCharacter } from '@/lib/character/fccManager'
import { requireUserId } from '@/lib/character/auth'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const body = (await request.json()) as FccAnimeRequest
  if (!body.videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })
  if (!body.style || !ANIME_STYLES.includes(body.style)) {
    return NextResponse.json({ error: 'Invalid anime style' }, { status: 400 })
  }

  const character = await getFCCCharacter(id, userId)
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await checkAndDeductCredits(userId, 'character_anime')
  } catch (e) {
    console.warn("[caught] src/app/api/vault/character/[id]/anime/route.ts:28", e instanceof Error ? { name: e.name, message: e.message } : e)

    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  try {
    const videoUrl = await animeTransformVideo(body.videoUrl, body.style, character)
    return NextResponse.json({ videoUrl })
  } catch (e) {
    await refundCredits(userId, ANIME_TRANSFORM_CREDITS, 'character_anime').catch((err) => logCaught('app/api/vault/character/[id]/anime/route', err))
    const message = e instanceof Error ? e.message : 'Anime transform failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
