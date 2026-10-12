import { type NextRequest, NextResponse } from 'next/server'
import { suggestColourGrade, isColourGradeSuggestion, type ColourGradeRequest, type ColourMood } from '@/lib/color/AIColorGrading'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'
import type { ClipColourGrade } from '@/lib/timeline/schema'
import { requireUser } from '@/lib/auth/requireUser'

const VALID_MOODS = new Set<ColourMood>(['warm', 'cool', 'cinematic', 'vintage', 'moody'])
const CREDIT_OP = 'llm_claude_sonnet'
const CREDIT_COST = 3

function parseBody(raw: unknown): ColourGradeRequest | string {
  if (typeof raw !== 'object' || raw === null) return 'Request body must be a JSON object'
  const o = raw as Record<string, unknown>
  if (typeof o.clipId !== 'string' || !o.clipId.trim()) return 'clipId is required'
  if (typeof o.frameUrl !== 'string' || !o.frameUrl.trim()) return 'frameUrl is required'
  if (typeof o.mood !== 'string' || !VALID_MOODS.has(o.mood as ColourMood))
    return `mood must be one of: ${[...VALID_MOODS].join(', ')}`
  if (o.targetLook !== undefined && typeof o.targetLook !== 'string') return 'targetLook must be a string'
  return {
    clipId: o.clipId.trim(),
    frameUrl: o.frameUrl.trim(),
    mood: o.mood as ColourMood,
    targetLook: typeof o.targetLook === 'string' ? o.targetLook.trim() : undefined,
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/color/grade/route.ts:31", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseBody(raw)
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 })

  try {
    await checkAndDeductCredits(userId, CREDIT_OP, CREDIT_COST, 'AI Colour Grade suggestion')
  } catch (err) {
    console.warn("[caught] src/app/api/color/grade/route.ts:40", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json(
      { error: `Insufficient credits. AI colour grading costs ${CREDIT_COST} credits.` },
      { status: 402 },
    )
  }

  try {
    const grade = await suggestColourGrade(parsed)
    return NextResponse.json({ grade })
  } catch (err: unknown) {
    await refundCredits(userId, CREDIT_COST, 'Colour grade generation failed')
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/color/grade]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH — batch-apply a colour grade from one clip to multiple target clips
// Returns the validated grade so the client can update its recipe
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/color/grade/route.ts:65", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const o = raw as Record<string, unknown>
  if (typeof o.sourceClipId !== 'string' || !o.sourceClipId.trim())
    return NextResponse.json({ error: 'sourceClipId is required' }, { status: 400 })
  if (!Array.isArray(o.targetClipIds) || o.targetClipIds.length === 0)
    return NextResponse.json({ error: 'targetClipIds must be a non-empty array' }, { status: 400 })
  if (!o.targetClipIds.every((id: unknown) => typeof id === 'string'))
    return NextResponse.json({ error: 'All targetClipIds must be strings' }, { status: 400 })
  if (typeof o.projectId !== 'string' || !o.projectId.trim())
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

  // The grade must be supplied by the client (it lives in client-side Zustand recipe)
  if (!isColourGradeSuggestion(o.grade))
    return NextResponse.json({ error: 'grade must be a valid ColourGradeSuggestion object' }, { status: 400 })

  // Map suggestion to ClipColourGrade
  const colourGrade: ClipColourGrade = {
    shadows: Math.round(o.grade.shadows ?? 0),
    midtones: Math.round(o.grade.midtones ?? 0),
    highlights: Math.round(o.grade.highlights ?? 0),
    temperature: Math.round(o.grade.temperature ?? 0),
    tint: Math.round(o.grade.tint ?? 0),
  }

  return NextResponse.json({
    colourGrade,
    targetClipIds: o.targetClipIds as string[],
    sourceClipId: o.sourceClipId,
  })
}
