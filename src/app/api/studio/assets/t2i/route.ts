import { buildImagePayload } from '@cinema/core'
import { buildFluxDevT2iInput } from '@cinema/core/endpoints'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { referenceImagePlan } from '@/lib/studio/referenceImage'
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { EscrowError, withCreditHold } from '@/lib/billing/withCreditHold'
import { IMAGE_FAL_TIMEOUT_MS, runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { forgeAssetFromRow } from '@/lib/assets/shape'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  kind: z.enum(['character', 'style', 'asset', 'location']),
  prompt: z.string().min(3).max(2000),
  name: z.string().min(1).max(80),
  parentId: z.string().min(1).optional(),
  referenceUrls: z.array(z.string()).max(14).optional(),
  confirm: z.boolean().optional(),
  consent: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const kind = req.nextUrl.searchParams.get('kind') ?? 'character'
  if (req.nextUrl.searchParams.get('list') === 'all') {
    const listed = await db.asset.findMany({
      where: { ownerId: userId, kind },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { plates: { select: { id: true, imageUrl: true } } },
    })
    return NextResponse.json({
      assets: listed.map((row) => ({
        id: row.id,
        name: row.label || row.sourcePrompt || kind,
        imageUrl: row.generatedImage || row.plates[0]?.imageUrl || null,
        resolutionState: row.resolutionState,
        plates: row.plates.length,
        needsAction: Boolean(row.boundary && typeof row.boundary === 'object' && !Array.isArray(row.boundary) && 'needsAction' in row.boundary),
      })),
    })
  }
  const rows = await db.asset.findMany({
    where: { ownerId: userId, kind, generatedImage: { not: null } },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: { id: true, label: true, sourcePrompt: true, generatedImage: true },
  })
  return NextResponse.json({
    assets: rows.map((row) => ({ id: row.id, name: row.label || row.sourcePrompt || kind, imageUrl: row.generatedImage })),
  })
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid asset request' }, { status: 400 })

  const parent = parsed.data.parentId
    ? await db.asset.findFirst({ where: { id: parsed.data.parentId, ownerId: userId } })
    : null
  const plan = referenceImagePlan({
    uploads: parsed.data.referenceUrls ?? [],
    primaryUrl: parent?.generatedImage,
  })
  if (!parsed.data.confirm) {
    return NextResponse.json({
      estimateCredits: 1,
      metered: true,
      model: plan.model,
      referenceCount: plan.imageUrls.length,
      capped: plan.capped,
    })
  }
  if ((parsed.data.kind === 'character' || parsed.data.kind === 'location') && plan.imageUrls.length > 0 && parsed.data.consent !== true) {
    return NextResponse.json({ error: 'Consent is required before a real person or place is used as a reference' }, { status: 400 })
  }
  if (parsed.data.parentId && !parent) {
    return NextResponse.json({ error: 'The parent asset was not found' }, { status: 404 })
  }
  if (parsed.data.parentId && plan.imageUrls.length === 0) {
    return NextResponse.json({ error: 'A variation needs the primary image or an uploaded reference' }, { status: 400 })
  }
  const access = await checkAccess(userId, 1)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })

  try {
    const prompt = `${parsed.data.name}. ${parsed.data.prompt}. Keep the identity of the reference images.`
    const built = plan.model === 'nano-banana-2-edit'
      ? buildImagePayload({ model: 'nano-banana-2-edit', prompt, imageUrls: plan.imageUrls, numImages: 1 })
      : buildFluxDevT2iInput(parsed.data.prompt)
    const result = await withCreditHold(userId, 1, () => runFal<{ images?: Array<{ url?: string }> }>(
      built.endpoint,
      built.input,
      undefined,
      IMAGE_FAL_TIMEOUT_MS,
      undefined,
      undefined,
      plan.model === 'nano-banana-2-edit' ? 'asset.reference' : 'asset.t2i',
    ))
    const imageUrl = result.images?.[0]?.url
    if (!imageUrl) return NextResponse.json({ error: 'Image model returned no image' }, { status: 502 })
    const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())
    const stored = await uploadToR2(bytes, `assets/${userId}/${Date.now()}.png`, 'image/png')
    if (parent) {
      const prior = Array.isArray(parent.variations) ? parent.variations : []
      const variation = {
        variantId: nanoid(),
        label: parsed.data.name,
        generatedFrom: parent.id,
        modifierPrompt: parsed.data.prompt,
        generatedImage: stored,
        resolutionState: 'generated',
        appearsInShots: [] as string[],
      }
      const row = await db.asset.update({
        where: { id: parent.id },
        data: { variations: [...prior, variation] },
      })
      return NextResponse.json({ asset: forgeAssetFromRow(row), variation, model: plan.model, referenceCount: plan.imageUrls.length })
    }
    const row = await db.asset.create({
      data: {
        ownerId: userId,
        kind: parsed.data.kind,
        sourcePrompt: parsed.data.prompt,
        sourceRefs: plan.imageUrls,
        generatedImage: stored,
        usableAsReference: true,
        isPrimary: true,
        label: parsed.data.name,
        resolutionState: 'generated',
      },
    })
    return NextResponse.json({ asset: forgeAssetFromRow(row), model: plan.model, referenceCount: plan.imageUrls.length })
  } catch (err) {
    console.warn('[asset-t2i]', err instanceof Error ? err.message : err)
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: 402 })
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The reference was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The reference did not run' }, { status: 502 })
  }
}
