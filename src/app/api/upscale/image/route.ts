import { NextRequest, NextResponse } from 'next/server'
import { checkAndDeductCredits, refundCredits, OPERATION_COSTS } from '../../../../lib/credits'
import { upscaleImage } from '../../../../lib/upscale/image'
import { engineCreditKey } from '../../../../lib/upscale/router'
import type { UpscaleFactor } from '../../../../lib/upscale/router'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    imageUrl: string
    factor: UpscaleFactor
    contentType: 'photorealistic' | 'anime' | 'cgi' | 'face_heavy' | 'text_heavy' | 'general'
    faceEnhance?: boolean
  }
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/upscale/image/route.ts:19", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { imageUrl, factor, contentType, faceEnhance } = body
  if (!imageUrl || !factor || !contentType) {
    return NextResponse.json({ error: 'imageUrl, factor, contentType required' }, { status: 400 })
  }

  const creditKey = engineCreditKey('aura_sr', factor, true)
  if (!(creditKey in OPERATION_COSTS)) {
    return NextResponse.json({ error: 'Unknown operation' }, { status: 400 })
  }

  try {
    await checkAndDeductCredits(userId, creditKey)
  } catch (e) {
    console.warn("[caught] src/app/api/upscale/image/route.ts:35", e instanceof Error ? { name: e.name, message: e.message } : e)

    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  try {
    const result = await upscaleImage({ imageUrl, factor, contentType, faceEnhance })
    return NextResponse.json(result)
  } catch (e) {
    console.warn("[caught] src/app/api/upscale/image/route.ts:42", e instanceof Error ? { name: e.name, message: e.message } : e)

    await refundCredits(userId, OPERATION_COSTS[creditKey] ?? 0, 'Image upscale failed')
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
