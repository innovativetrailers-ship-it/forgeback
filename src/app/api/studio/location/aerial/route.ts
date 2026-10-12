import { storeForUser } from '@/lib/storage/objects'
import { buildFluxDevT2iInput } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { checkAccess } from '@/lib/access/guard'
import { runFal, IMAGE_FAL_TIMEOUT_MS } from '@/lib/fal/client'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { AERIAL_CREDITS, aerialPrompt } from '@/lib/studio/generationUtilities'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[aerial]', err instanceof Error ? err.message : err)
    return null
  }) as { place?: string; confirm?: boolean } | null
  let prompt = ''
  try {
    prompt = aerialPrompt(body?.place ?? '')
  } catch (err) {
    console.warn('[aerial]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Name the place' }, { status: 400 })
  }
  if (!body?.confirm) return NextResponse.json({ estimateCredits: AERIAL_CREDITS, metered: true })
  const access = await checkAccess(userId, AERIAL_CREDITS)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  try {
    const built = buildFluxDevT2iInput(prompt)
    const data = await runFal<{ images?: Array<{ url?: string }> }>(built.endpoint, built.input, undefined, IMAGE_FAL_TIMEOUT_MS, undefined, undefined, 'location.aerial')
    const imageUrl = data.images?.[0]?.url
    if (!imageUrl) return NextResponse.json({ error: 'The aerial plate did not return an image' }, { status: 502 })
    const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())
    const stored = await storeForUser(userId, bytes, 'png', 'image/png')
    const place = body.place!.trim()
    const asset = await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'location',
        label: place,
        sourcePrompt: prompt,
        generatedImage: stored,
        resolutionState: 'generated',
        usableAsReference: true,
        boundary: { source: 'synthetic-aerial', model: 'flux/dev' },
      },
      select: { id: true },
    })
    const plate = await db.locationPlate.create({
      data: {
        userId,
        imageUrl: stored,
        sourceUrl: stored,
        type: 'satellite',
        displayName: place,
        assetId: asset.id,
      },
      select: { id: true },
    })
    return NextResponse.json({ assetId: asset.id, plateId: plate.id, imageUrl: stored, estimateCredits: AERIAL_CREDITS, libraryTake: true })
  } catch (err) {
    console.warn('[aerial]', err instanceof Error ? err.message : err)
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The aerial plate was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The aerial plate did not run' }, { status: 502 })
  }
}
