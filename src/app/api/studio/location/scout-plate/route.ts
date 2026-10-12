import { buildImagePayload, scoutPlatePrompt } from '@cinema/core'
import { buildFluxDevT2iInput } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { checkAccess } from '@/lib/access/guard'
import { EscrowError, withCreditHold } from '@/lib/billing/withCreditHold'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { IMAGE_FAL_TIMEOUT_MS, runFal } from '@/lib/fal/client'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { referenceImagePlan } from '@/lib/studio/referenceImage'
import { AERIAL_CREDITS } from '@/lib/studio/generationUtilities'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[scout-plate]', err instanceof Error ? err.message : err)
    return null
  }) as {
    name?: string
    note?: string
    lat?: number
    lng?: number
    street?: string
    height?: number
    heading?: number
    pitch?: number
    fov?: number
    time?: string
    season?: string
    weather?: string
    referenceUrls?: string[]
    parentId?: string
    confirm?: boolean
    consent?: boolean
  } | null

  let prompt = ''
  try {
    prompt = scoutPlatePrompt({
      name: body?.name ?? '',
      note: body?.note,
      lat: body?.lat,
      lng: body?.lng,
      street: body?.street,
      height: body?.height,
      heading: body?.heading,
      pitch: body?.pitch,
      fov: body?.fov,
      time: body?.time,
      season: body?.season,
      weather: body?.weather,
    })
  } catch (err) {
    console.warn('[scout-plate]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Name the place' }, { status: 400 })
  }

  const parent = body?.parentId
    ? await db.asset.findFirst({ where: { id: body.parentId, ownerId: userId, kind: 'location' } })
    : null
  const plan = referenceImagePlan({ uploads: body?.referenceUrls ?? [], primaryUrl: parent?.generatedImage })
  if (!body?.confirm) {
    return NextResponse.json({
      estimateCredits: AERIAL_CREDITS,
      metered: true,
      model: plan.model,
      prompt,
      note: 'A new location plate. Nothing is placed on the timeline.',
    })
  }
  if (plan.imageUrls.length > 0 && body.consent !== true) {
    return NextResponse.json({ error: 'Consent is required before scout photos are used as references' }, { status: 400 })
  }
  if (body.parentId && !parent) return NextResponse.json({ error: 'The primary plate was not found' }, { status: 404 })
  const access = await checkAccess(userId, AERIAL_CREDITS)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })

  try {
    const built = plan.model === 'nano-banana-2-edit'
      ? buildImagePayload({ model: 'nano-banana-2-edit', prompt, imageUrls: plan.imageUrls, numImages: 1 })
      : buildFluxDevT2iInput(prompt)
    const data = await withCreditHold(userId, AERIAL_CREDITS, () => runFal<{ images?: Array<{ url?: string }> }>(
      built.endpoint,
      built.input,
      undefined,
      IMAGE_FAL_TIMEOUT_MS,
      undefined,
      undefined,
      'location.scout-plate',
    ))
    const imageUrl = data.images?.[0]?.url
    if (!imageUrl) return NextResponse.json({ error: 'The plate did not return an image' }, { status: 502 })
    const stored = await uploadToR2(Buffer.from(await (await fetch(imageUrl)).arrayBuffer()), `locations/${userId}/${Date.now()}.png`, 'image/png')
    const name = body.name!.trim()
    const asset = await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'location',
        label: name,
        sourcePrompt: prompt,
        sourceRefs: plan.imageUrls.filter((url) => !/mapillary|cesium|google|ggpht/i.test(url)),
        generatedImage: stored,
        resolutionState: 'generated',
        usableAsReference: true,
        isPrimary: !parent,
        variationOf: parent?.id,
        boundary: {
          source: plan.imageUrls.length ? 'generated-from-scout' : 'describe',
          licence: 'Generated plate. Scout references were not kept as the stored image.',
          lat: body.lat,
          lng: body.lng,
          camera: { height: body.height, heading: body.heading, pitch: body.pitch, fov: body.fov, time: body.time, season: body.season, weather: body.weather },
        },
      },
      select: { id: true },
    })
    const plate = await db.locationPlate.create({
      data: {
        userId,
        imageUrl: stored,
        sourceUrl: stored,
        type: 'generated',
        lat: body.lat,
        lng: body.lng,
        displayName: name,
        assetId: asset.id,
      },
      select: { id: true },
    })
    return NextResponse.json({ assetId: asset.id, plateId: plate.id, imageUrl: stored, estimateCredits: AERIAL_CREDITS, libraryTake: true })
  } catch (err) {
    console.warn('[scout-plate]', err instanceof Error ? err.message : err)
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: 402 })
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The plate was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The plate did not run' }, { status: 502 })
  }
}
