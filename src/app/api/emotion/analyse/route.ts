import { type NextRequest, NextResponse } from 'next/server'
import { analyzeEmotionalArc, type EmotionLatticeRequest } from '@/lib/emotion/EmotionLattice'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'

const CREDIT_COST = 5

interface ClipPayload { id: string; prompt: string; duration: number; startTime: number }

function isClipPayload(v: unknown): v is ClipPayload {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.prompt === 'string' &&
    typeof o.duration === 'number' && typeof o.startTime === 'number'
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/emotion/analyse/route.ts:21", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof raw !== 'object' || raw === null)
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })

  const o = raw as Record<string, unknown>
  if (typeof o.projectId !== 'string') return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  if (!Array.isArray(o.clips) || o.clips.length < 3)
    return NextResponse.json({ error: 'At least 3 clips are required' }, { status: 400 })
  if (!o.clips.every(isClipPayload))
    return NextResponse.json({ error: 'Each clip must have id, prompt, duration, startTime' }, { status: 400 })

  try {
    await checkAndDeductCredits(userId, 'emotion_analysis_per_project', CREDIT_COST, 'Emotion Lattice analysis')
  } catch (err) {
    console.warn("[caught] src/app/api/emotion/analyse/route.ts:37", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: `Insufficient credits. Analysis costs ${CREDIT_COST} credits.` }, { status: 402 })
  }

  const request: EmotionLatticeRequest = {
    projectId: o.projectId,
    userId,
    clips: o.clips as ClipPayload[],
  }

  try {
    const result = await analyzeEmotionalArc(request)
    return NextResponse.json({ result })
  } catch (err: unknown) {
    await refundCredits(userId, CREDIT_COST, 'Emotion analysis failed')
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/emotion/analyse]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
