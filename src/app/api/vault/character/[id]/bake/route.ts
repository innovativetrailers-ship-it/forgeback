import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { bakeAppearancePreview } from '@/lib/character/appearanceBake'
import { getFCCCharacter, updateRefFront } from '@/lib/character/fccManager'
import { requireUserId } from '@/lib/character/auth'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'

const BAKE_CREDITS = 8

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const existing = await getFCCCharacter(id, userId)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await checkAndDeductCredits(userId, 'character_appearance_bake')
  } catch (e) {
    console.warn("[caught] src/app/api/vault/character/[id]/bake/route.ts:23", e instanceof Error ? { name: e.name, message: e.message } : e)

    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  try {
    const bakedUrl = await bakeAppearancePreview(existing)
    const view = await updateRefFront(id, userId, bakedUrl)
    return NextResponse.json(view)
  } catch (e) {
    await refundCredits(userId, BAKE_CREDITS, 'character_appearance_bake').catch((err) => logCaught('app/api/vault/character/[id]/bake/route', err))
    const message = e instanceof Error ? e.message : 'Bake failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
