import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { applyGarment } from '@/lib/character/apparel'
import { getFCCCharacter, saveWardrobe } from '@/lib/character/fccManager'
import { WARDROBE_REGIONS, type WardrobeRegion } from '@/lib/character/fccSchema'
import { requireUserId } from '@/lib/character/auth'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'

const WARDROBE_CREDITS = 12

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const body = (await request.json()) as {
    region?: string
    prompt?: string
    garmentImageUrl?: string
  }

  if (!body.region || !WARDROBE_REGIONS.includes(body.region as WardrobeRegion)) {
    return NextResponse.json({ error: 'Invalid wardrobe region' }, { status: 400 })
  }
  if (!body.prompt || typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }

  const existing = await getFCCCharacter(id, userId)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await checkAndDeductCredits(userId, 'character_wardrobe')
  } catch (e) {
    console.warn("[caught] src/app/api/vault/character/[id]/wardrobe/route.ts:37", e instanceof Error ? { name: e.name, message: e.message } : e)

    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  try {
    const { character, tryOnImageUrl } = await applyGarment(
      existing,
      body.region as WardrobeRegion,
      body.prompt,
      body.garmentImageUrl,
    )
    const view = await saveWardrobe(id, userId, character.wardrobe, tryOnImageUrl)
    return NextResponse.json(view)
  } catch (e) {
    await refundCredits(userId, WARDROBE_CREDITS, 'character_wardrobe').catch((err) => logCaught('app/api/vault/character/[id]/wardrobe/route', err))
    const message = e instanceof Error ? e.message : 'Wardrobe apply failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
