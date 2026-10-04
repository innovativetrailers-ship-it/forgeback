import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { checkAccess } from '@/lib/access/guard'
import { runFal } from '@/lib/fal/client'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { db } from '@/lib/db'
import {
  buildElementsInput,
  buildReferenceInput,
  ELEMENTS_KEY,
  MULTI_VIDEO_LIMIT,
  quoteMultiRef,
  videoUrlOf,
  type ReferenceTier,
} from '@/lib/studio/multiReference'

function modeOf(value: unknown): 'elements' | 'reference' | null {
  if (value === 'elements' || value === 'reference') return value
  return null
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[multi-ref]', err instanceof Error ? err.message : err)
    return null
  }) as {
    mode?: string
    confirm?: boolean
    consent?: boolean
    prompt?: string
    imageUrls?: string[]
    videoUrl?: string
    videoUrls?: string[]
    seconds?: number
    tier?: ReferenceTier
  } | null
  const mode = modeOf(body?.mode)
  if (!mode) return NextResponse.json({ error: 'Mode is elements or reference. Clip conditioning uses the timeline inpaint path.' }, { status: 400 })
  if ((body?.videoUrls?.length ?? 0) > 1) {
    return NextResponse.json({ error: MULTI_VIDEO_LIMIT }, { status: 400 })
  }
  const seconds = body?.seconds ?? 5
  const tier: ReferenceTier = body?.tier === '4k' ? '4k' : 'standard'
  let estimateCredits = 0
  try {
    estimateCredits = quoteMultiRef({ mode, seconds, tier })
  } catch (err) {
    console.warn('[multi-ref]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not price this shot' }, { status: 400 })
  }
  if (!body?.confirm) {
    return NextResponse.json({
      estimateCredits,
      metered: true,
      limit: MULTI_VIDEO_LIMIT,
    })
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: 'Consent is required for a real-person reference' }, { status: 400 })
  }
  const access = await checkAccess(userId, estimateCredits)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  try {
    let key = ''
    let input: Record<string, unknown>
    const images = body.imageUrls ?? []
    if (mode === 'elements') {
      key = ELEMENTS_KEY
      input = buildElementsInput(body.prompt ?? '', images, seconds)
    } else {
      if (images.length !== 1) {
        return NextResponse.json({ error: 'Reference-to-video uses one image. Use Elements for 2 to 4.' }, { status: 400 })
      }
      const built = buildReferenceInput(body.prompt ?? '', images[0] ?? '', seconds, tier)
      key = built.key
      input = built.input
    }
    const data = await runFal(falEndpoint(key), input, undefined, 1_200_000, undefined, undefined, `reference.${mode}`)
    const videoUrl = videoUrlOf(data)
    if (!videoUrl) return NextResponse.json({ error: 'The reference shot did not return a video' }, { status: 502 })
    await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'asset',
        label: `${mode} take`,
        sourcePrompt: body.prompt?.trim() || mode,
        sourceRefs: [videoUrl, ...images],
        generatedImage: images[0] ?? videoUrl,
        usableAsReference: false,
        isPrimary: false,
        mediaKind: 'video',
        resolutionState: 'generated',
        boundary: { mode, endpoint: key, libraryTake: true },
      },
    })
    return NextResponse.json({ videoUrl, estimateCredits, libraryTake: true, mode })
  } catch (err) {
    console.warn('[multi-ref]', err instanceof Error ? err.message : err)
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The reference shot was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The reference shot did not run' }, { status: 502 })
  }
}
