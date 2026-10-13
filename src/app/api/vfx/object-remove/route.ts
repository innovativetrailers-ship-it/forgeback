import { type NextRequest, NextResponse } from 'next/server'
import { queueObjectRemoval, type BlendMode, type MaskArea } from '@/lib/vfx/ObjectRemoval'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'
import { requireUser } from '@/lib/auth/requireUser'

const CREDIT_COST = 20
const VALID_BLEND_MODES = new Set<BlendMode>(['seamless', 'conservative', 'aggressive'])

function isMaskArea(v: unknown): v is MaskArea {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.x === 'number' && typeof o.y === 'number' &&
    typeof o.w === 'number' && typeof o.h === 'number'
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/vfx/object-remove/route.ts:20", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof raw !== 'object' || raw === null)
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })

  const o = raw as Record<string, unknown>
  if (typeof o.clipId !== 'string' || !o.clipId) return NextResponse.json({ error: 'clipId is required' }, { status: 400 })
  if (typeof o.videoUrl !== 'string' || !o.videoUrl) return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 })
  if (typeof o.objectDescription !== 'string' || !o.objectDescription.trim())
    return NextResponse.json({ error: 'objectDescription is required' }, { status: 400 })

  const blendMode: BlendMode = (typeof o.blendMode === 'string' && VALID_BLEND_MODES.has(o.blendMode as BlendMode))
    ? (o.blendMode as BlendMode)
    : 'seamless'

  const maskArea = isMaskArea(o.maskArea) ? o.maskArea : undefined
  const includeArtifacts = o.includeArtifacts !== false

  try {
    await checkAndDeductCredits(userId, 'object_removal_per_clip', CREDIT_COST, 'Object removal')
  } catch (err) {
    console.warn("[caught] src/app/api/vfx/object-remove/route.ts:42", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: `Insufficient credits. Object removal costs ${CREDIT_COST} credits.` }, { status: 402 })
  }

  try {
    const result = await queueObjectRemoval({
      clipId: o.clipId,
      videoUrl: o.videoUrl,
      frameUrl: typeof o.frameUrl === 'string' ? o.frameUrl : undefined,
      objectDescription: o.objectDescription.trim(),
      maskArea,
      includeArtifacts,
      blendMode,
      userId,
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    await refundCredits(userId, CREDIT_COST, 'Object removal queuing failed')
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/vfx/object-remove]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
