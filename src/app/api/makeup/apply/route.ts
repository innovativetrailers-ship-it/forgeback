import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkAndDeductCredits, refundOperationCredits } from '@/lib/credits'
import { SFXMakeupEngine } from '@/lib/makeup/SFXMakeupEngine'
import type { MakeupEffect } from '@/lib/casting/types'
import { requireUser } from '@/lib/auth/requireUser'
import { recordConsent } from '@/lib/privacy/consent'

const engine = new SFXMakeupEngine()

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    videoUrl: string
    effects?: MakeupEffect[]
    intensity?: number
    naturalLanguageRequest?: string
    makeupReferenceImageUrl?: string
    characterId?: string
    mode?: 'post_generation' | 'reference_transfer' | 'natural_language'
    likenessConsent?: boolean
    notMinor?: boolean
  }

  if (!body.videoUrl) {
    return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 })
  }
  if (body.likenessConsent !== true || body.notMinor !== true) {
    return NextResponse.json({ error: 'Likeness consent is required, and the person must not be a minor. Makeup was not applied.' }, { status: 400 })
  }
  await recordConsent(userId, 'likeness', 'makeup.apply')

  const mode = body.mode ?? (body.naturalLanguageRequest ? 'natural_language'
    : body.makeupReferenceImageUrl ? 'reference_transfer'
    : 'post_generation')

  const creditKey = mode === 'reference_transfer' ? 'makeup_reference_transfer' : 'makeup_sfx_postgeneration'
  try {
    await checkAndDeductCredits(userId, creditKey)
  } catch (err) {
    console.warn("[caught] src/app/api/makeup/apply/route.ts:35", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  try {
    let videoUrl: string
    let appliedEffects: MakeupEffect[] = body.effects ?? []

    if (mode === 'natural_language' && body.naturalLanguageRequest) {
      const result = await engine.handleCustomRequest({
        videoUrl: body.videoUrl,
        naturalLanguageRequest: body.naturalLanguageRequest,
        characterId: body.characterId,
        intensity: body.intensity,
      })
      videoUrl = result.videoUrl
      appliedEffects = result.appliedEffects

    } else if (mode === 'reference_transfer' && body.makeupReferenceImageUrl) {
      videoUrl = await engine.transferMakeupFromReference({
        sourceVideoUrl: body.videoUrl,
        makeupReferenceImageUrl: body.makeupReferenceImageUrl,
        intensity: body.intensity ?? 0.75,
      })

    } else {
      if (!body.effects || body.effects.length === 0) {
        await refundOperationCredits(userId, creditKey)
        return NextResponse.json({ error: 'effects array required for post_generation mode' }, { status: 400 })
      }
      videoUrl = await engine.applyMakeupPostGeneration({
        videoUrl: body.videoUrl,
        effects: body.effects,
        intensity: body.intensity ?? 0.75,
      })
    }

    return NextResponse.json({ videoUrl, appliedEffects })
  } catch (err) {
    console.warn("[caught] src/app/api/makeup/apply/route.ts:73", err instanceof Error ? { name: err.name, message: err.message } : err)

    await refundOperationCredits(userId, creditKey)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Makeup application failed' }, { status: 500 })
  }
}
