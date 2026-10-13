import { type NextRequest, NextResponse } from 'next/server'
import { generateRoughCut, type CutStyle, type CutTone, type RoughCutRequest } from '@/lib/editing/RoughCutCopilot'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'
import { requireUser } from '@/lib/auth/requireUser'

const VALID_STYLES = new Set<CutStyle>(['fast-paced', 'cinematic', 'documentary', 'interview', 'music-video'])
const VALID_TONES = new Set<CutTone>(['energetic', 'serious', 'humorous', 'emotional'])
const CREDIT_COST = 10

interface ClipPayload {
  id: string
  prompt: string
  duration: number
  trackId: string
  videoUrl: string | null
}

function isClipPayload(v: unknown): v is ClipPayload {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.prompt === 'string' &&
    typeof o.duration === 'number' &&
    typeof o.trackId === 'string' &&
    (o.videoUrl === null || typeof o.videoUrl === 'string')
  )
}

function parseBody(
  raw: unknown,
): { projectId: string; clips: ClipPayload[]; targetDuration: number; style: CutStyle; tone: CutTone } | string {
  if (typeof raw !== 'object' || raw === null) return 'Request body must be a JSON object'
  const o = raw as Record<string, unknown>
  if (typeof o.projectId !== 'string' || !o.projectId) return 'projectId is required'
  if (!Array.isArray(o.clips) || o.clips.length === 0) return 'clips array is required and must not be empty'
  if (!o.clips.every(isClipPayload)) return 'Each clip must have id, prompt, duration, trackId, videoUrl'
  if (typeof o.targetDuration !== 'number' || o.targetDuration <= 0) return 'targetDuration must be a positive number'
  if (typeof o.style !== 'string' || !VALID_STYLES.has(o.style as CutStyle))
    return `style must be one of: ${[...VALID_STYLES].join(', ')}`
  if (typeof o.tone !== 'string' || !VALID_TONES.has(o.tone as CutTone))
    return `tone must be one of: ${[...VALID_TONES].join(', ')}`
  return {
    projectId: o.projectId,
    clips: o.clips as ClipPayload[],
    targetDuration: o.targetDuration,
    style: o.style as CutStyle,
    tone: o.tone as CutTone,
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/rough-cut/generate/route.ts:58", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseBody(raw)
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 })

  // Deduct credits BEFORE processing
  try {
    await checkAndDeductCredits(userId, 'rough_cut_per_clip', CREDIT_COST, 'AI Rough Cut Copilot')
  } catch (err) {
    console.warn("[caught] src/app/api/rough-cut/generate/route.ts:68", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json(
      { error: `Insufficient credits. Rough cut costs ${CREDIT_COST} credits.` },
      { status: 402 },
    )
  }

  const roughCutReq: RoughCutRequest = {
    projectId: parsed.projectId,
    userId,
    clips: parsed.clips,
    targetDuration: parsed.targetDuration,
    style: parsed.style,
    tone: parsed.tone,
  }

  try {
    const result = await generateRoughCut(roughCutReq)
    return NextResponse.json({ result })
  } catch (err: unknown) {
    await refundCredits(userId, CREDIT_COST, 'Rough cut generation failed')
    const message = err instanceof Error ? err.message : 'Unknown error during rough cut generation'
    console.error('[rough-cut/generate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
