import { storeForUser } from '@/lib/storage/objects'
import { makeupLook } from '@cinema/core'
import { buildImagePayload } from '@cinema/core'
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { checkAccess } from '@/lib/access/guard'
import { EscrowError, withCreditHold } from '@/lib/billing/withCreditHold'
import { IMAGE_FAL_TIMEOUT_MS, runFal } from '@/lib/fal/client'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { referenceImagePlan } from '@/lib/studio/referenceImage'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db.asset.findMany({
    where: { ownerId: userId, kind: 'character' },
    select: { id: true, label: true, lookStack: true, generatedImage: true, variationOf: true },
    take: 80,
  })
  const plates = rows.flatMap((row) => {
    if (!row.generatedImage || !Array.isArray(row.lookStack) || row.lookStack.length === 0) return []
    const layer = row.lookStack[0]
    const lookId = layer && typeof layer === 'object' && 'lookId' in layer ? String(layer.lookId) : ''
    return [{ id: row.id, label: row.label, imageUrl: row.generatedImage, parentId: row.variationOf, lookId }]
  })
  return NextResponse.json({ characters: rows.filter((row) => row.lookStack != null), plates })
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[looks]', err instanceof Error ? err.message : err)
    return null
  }) as {
    lookId?: string
    assetId?: string
    intensity?: number
    referenceUrls?: string[]
    confirm?: boolean
    graphicAck?: boolean
    consent?: boolean
    saveOnly?: boolean
  } | null
  const look = makeupLook(body?.lookId ?? '')
  if (!look) return NextResponse.json({ error: 'Unknown look' }, { status: 400 })
  if (look.methods.bake !== 'live') {
    return NextResponse.json({ error: 'This look has no live bake model' }, { status: 400 })
  }
  if (look.safety === 'graphic' && body?.graphicAck !== true) {
    return NextResponse.json({ error: 'Graphic looks need an explicit acknowledgement' }, { status: 400 })
  }
  if (body?.saveOnly) {
    if (!body.assetId) return NextResponse.json({ error: 'Choose a character' }, { status: 400 })
    const asset = await db.asset.findFirst({ where: { id: body.assetId, ownerId: userId, kind: 'character' } })
    if (!asset) return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    const prior = Array.isArray(asset.lookStack) ? asset.lookStack : []
    await db.asset.update({
      where: { id: asset.id },
      data: { lookStack: [...prior, { lookId: look.id, intensity: body.intensity ?? look.intensity, opacity: 1 }] },
    })
    return NextResponse.json({ saved: true, generated: false })
  }
  const plan = referenceImagePlan({ uploads: body?.referenceUrls ?? [] })
  if (!body?.confirm) {
    return NextResponse.json({ estimateCredits: 1, metered: true, model: plan.imageUrls.length ? plan.model : 'flux/dev', referenceCount: plan.imageUrls.length })
  }
  if (look.safety === 'real-person-restricted' && body.consent !== true) {
    return NextResponse.json({ error: 'Likeness consent is required for this look' }, { status: 400 })
  }
  const parent = body.assetId
    ? await db.asset.findFirst({ where: { id: body.assetId, ownerId: userId, kind: 'character' } })
    : null
  if (body.assetId && !parent) return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  const access = await checkAccess(userId, 1)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  try {
    const prompt = `${look.prompt}. Intensity ${body?.intensity ?? look.intensity}. ${look.negative}`
    const built = plan.imageUrls.length
      ? buildImagePayload({ model: 'nano-banana-2-edit', prompt, imageUrls: plan.imageUrls, numImages: 1 })
      : buildImagePayload({ model: 'nano-banana-2', prompt, numImages: 1 })
    const result = await withCreditHold(userId, 1, () => runFal<{ images?: Array<{ url?: string }> }>(built.endpoint, built.input, undefined, IMAGE_FAL_TIMEOUT_MS, undefined, undefined, 'makeup.bake'))
    const imageUrl = result.images?.[0]?.url
    if (!imageUrl) return NextResponse.json({ error: 'The look bake returned no image' }, { status: 502 })
    const stored = await storeForUser(userId, Buffer.from(await (await fetch(imageUrl)).arrayBuffer()), 'png', 'image/png')
    const variantId = nanoid()
    const created = await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'character',
        label: look.name,
        sourcePrompt: prompt,
        negativePrompt: look.negative,
        generatedImage: stored,
        sourceRefs: plan.imageUrls,
        isPrimary: false,
        variationOf: parent?.id ?? null,
        resolutionState: 'generated',
        usableAsReference: true,
        lookStack: [{ lookId: look.id, intensity: body?.intensity ?? look.intensity, opacity: 1, variantId }],
      },
      select: { id: true },
    })
    if (parent) {
      const priorVars = Array.isArray(parent.variations) ? parent.variations : []
      const priorLooks = Array.isArray(parent.lookStack) ? parent.lookStack : []
      await db.asset.update({
        where: { id: parent.id },
        data: {
          variations: [...priorVars, {
            variantId,
            label: look.name,
            generatedFrom: parent.id,
            generatedImage: stored,
            lookId: look.id,
            resolutionState: 'generated',
            appearsInShots: [] as string[],
          }],
          lookStack: [...priorLooks, { lookId: look.id, intensity: body?.intensity ?? look.intensity, opacity: 1, variantId, imageUrl: stored }],
        },
      })
    }
    return NextResponse.json({ assetId: created.id, imageUrl: stored, libraryTake: true, estimateCredits: 1, loraPlate: true })
  } catch (err) {
    console.warn('[looks]', err instanceof Error ? err.message : err)
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: 402 })
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The look was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The look bake did not run' }, { status: 502 })
  }
}
