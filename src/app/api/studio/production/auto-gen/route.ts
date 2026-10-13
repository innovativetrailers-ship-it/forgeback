import { storeForUser } from '@/lib/storage/objects'
import { autoGenSelection, buildImagePayload, buildPayload, referenceDagCredits, referenceDagFor } from '@cinema/core'
import { buildFluxDevT2iInput } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { loadProductionBreakdown, productionAssetId } from '@/lib/studio/productionBoard'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  projectId: z.string().min(1),
  entityIds: z.array(z.string()).optional(),
  confirm: z.boolean().default(false),
})

const FLUX_PROMPT = {
  required: ['prompt'],
  forbidden: [] as string[],
  enums: {},
  types: { prompt: 'string' as const },
  audioField: null,
  schemaHash: 'flux-dev-prompt',
  fetchedAt: 0,
  properties: ['prompt'],
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid auto-gen request' }, { status: 400 })
  const breakdown = await loadProductionBreakdown(userId, parsed.data.projectId)
  if (!breakdown) return NextResponse.json({ error: 'Import a plan first' }, { status: 400 })
  const selection = autoGenSelection(breakdown.entities, parsed.data.entityIds)
  let dag
  try {
    dag = referenceDagFor(selection.selected)
  } catch (err) {
    console.warn('[variation_lineage]', err instanceof Error ? err.message : err)
    const detail = err instanceof Error ? err.message : 'variation lineage is not a finite tree'
    return NextResponse.json({ error: detail }, { status: 400 })
  }
  const estimateCredits = referenceDagCredits(dag)
  if (!parsed.data.confirm) {
    return NextResponse.json({
      confirm: false,
      estimateCredits,
      order: dag.map((node) => ({ id: node.id, kind: node.kind, entityId: node.entityId, variantId: node.variantId ?? null })),
      selected: selection.selected.map((entity) => ({ id: entity.id, name: entity.name, kind: entity.kind })),
      skipped: selection.skipped.map((entity) => ({ id: entity.id, name: entity.name, kind: entity.kind })),
    })
  }
  if (estimateCredits < 1) return NextResponse.json({ generated: [], estimateCredits: 0, fallbacks: [] })
  const access = await checkAccess(userId, estimateCredits)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  const generated: string[] = []
  const fallbacks: Array<{ id: string; reason: string }> = []
  const images = new Map<string, string>()
  for (const node of dag) {
    const parentUrl = node.dependsOn ? images.get(node.dependsOn) : undefined
    const derive = node.kind === 'variation' && Boolean(parentUrl)
    if (node.kind === 'variation' && !parentUrl) {
      const reason = 'parent reference missing; prompt-only'
      console.warn('[variation_fallback]', JSON.stringify({ id: node.id, reason }))
      fallbacks.push({ id: node.id, reason })
    }
    const imageUrl = await generateReference(node.prompt, derive ? parentUrl : undefined)
    if (!imageUrl) continue
    const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())
    const stored = await storeForUser(userId, bytes, 'png', 'image/png')
    const referenceUrl = stored.startsWith('http') ? stored : imageUrl
    images.set(node.id, referenceUrl)
    const assetId = productionAssetId(parsed.data.projectId, node.entityId)
    if (node.kind === 'primary') {
      await db.asset.update({
        where: { id: assetId },
        data: {
          generatedImage: stored,
          resolutionState: 'generated',
          usableAsReference: true,
          isPrimary: true,
        },
      })
      generated.push(node.entityId)
      continue
    }
    await writeVariation(assetId, {
      variantId: node.variantId ?? node.id,
      generatedFrom: node.dependsOn?.startsWith(`variation:${node.entityId}:`)
        ? node.dependsOn.slice(`variation:${node.entityId}:`.length)
        : node.entityId,
      modifierPrompt: node.prompt,
      generatedImage: stored,
      resolutionState: derive ? 'generated' : 'unresolved',
    })
    generated.push(node.id)
  }
  return NextResponse.json({ confirm: true, estimateCredits, generated, fallbacks })
}

async function generateReference(prompt: string, parentUrl?: string): Promise<string | undefined> {
  if (parentUrl) {
    const derived = buildImagePayload({
      model: 'nano-banana-2-edit',
      prompt,
      imageUrls: [parentUrl],
    })
    const result = await runFal<{ images?: Array<{ url?: string }> }>(
      derived.endpoint,
      derived.input,
      undefined,
      undefined,
      undefined,
      undefined,
      'production.autogen',
    )
    return result.images?.[0]?.url
  }
  const t2i = buildFluxDevT2iInput(prompt)
  const payload = buildPayload(t2i.endpoint, { prompt, duration: 5 }, {
    ...FLUX_PROMPT,
    endpoint: t2i.endpoint,
  })
  const result = await runFal<{ images?: Array<{ url?: string }> }>(
    t2i.endpoint,
    payload,
    undefined,
    undefined,
    undefined,
    undefined,
    'production.autogen',
  )
  return result.images?.[0]?.url
}

async function writeVariation(assetId: string, row: {
  variantId: string
  generatedFrom: string
  modifierPrompt: string
  generatedImage: string
  resolutionState: 'generated' | 'unresolved'
}): Promise<void> {
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { variations: true } })
  const current = Array.isArray(asset?.variations) ? asset.variations : []
  const next = current.filter((item) => {
    const record = item && typeof item === 'object' ? item as { variantId?: string } : {}
    return record.variantId !== row.variantId
  })
  next.push({
    variantId: row.variantId,
    label: row.variantId,
    generatedFrom: row.generatedFrom,
    modifierPrompt: row.modifierPrompt,
    generatedImage: row.generatedImage,
    resolutionState: row.resolutionState,
    appearsInShots: [],
  })
  await db.asset.update({
    where: { id: assetId },
    data: { variations: next as unknown as import('@/generated/prisma/client').Prisma.InputJsonValue, isPrimary: true },
  })
}
