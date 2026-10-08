import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkAndDeductCredits, refundOperationCredits } from '@/lib/credits'
import { GreenScreenEngine } from '@/lib/greenscreen/GreenScreenEngine'
import type { GreenScreenJob } from '@/lib/greenscreen/GreenScreenEngine'

const gsEngine = new GreenScreenEngine()

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as GreenScreenJob

  if (!body.sourceVideoUrl || !body.extractionMode || !body.backdrop) {
    return NextResponse.json({ error: 'sourceVideoUrl, extractionMode and backdrop are required' }, { status: 400 })
  }

  if (body.extractionMode === 'depth_matting') {
    return NextResponse.json({ error: 'Depth-Anything-v2 is not in the registry. Depth matting is disabled.' }, { status: 400 })
  }

  const chargeExtraction = body.extractionMode !== 'chroma_key'
  const chargeBackdrop = body.backdrop.source === 'ai_generated'
  const extractionCreditKey = 'greenscreen_ai_matting'
  const backdropCreditKey = 'backdrop_ai_generate'

  if (chargeExtraction) {
    try {
      await checkAndDeductCredits(userId, extractionCreditKey)
    } catch (err) {
      console.warn("[caught] src/app/api/greenscreen/composite/route.ts:25", err instanceof Error ? { name: err.name, message: err.message } : err)
      return NextResponse.json({ error: (err as Error).message }, { status: 402 })
    }
  }

  if (chargeBackdrop) {
    try {
      await checkAndDeductCredits(userId, backdropCreditKey)
    } catch (err) {
      console.warn("[caught] src/app/api/greenscreen/composite/route.ts:31", err instanceof Error ? { name: err.name, message: err.message } : err)
      if (chargeExtraction) await refundOperationCredits(userId, extractionCreditKey)
      return NextResponse.json({ error: (err as Error).message }, { status: 402 })
    }
  }

  try {
    const compositedUrl = await gsEngine.processGreenScreen(body)

    return NextResponse.json({ composited_url: compositedUrl, preview_frame: compositedUrl })
  } catch (err) {
    console.warn("[caught] src/app/api/greenscreen/composite/route.ts:40", err instanceof Error ? { name: err.name, message: err.message } : err)

    if (chargeExtraction) await refundOperationCredits(userId, extractionCreditKey)
    if (chargeBackdrop) await refundOperationCredits(userId, backdropCreditKey)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Compositing failed' }, { status: 500 })
  }
}
