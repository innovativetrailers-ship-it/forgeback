import { storeForUser } from '@/lib/storage/objects'
import { buildPayload } from '@cinema/core'
import { buildFluxDevT2iInput } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { productionAssetId } from '@/lib/studio/productionBoard'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  projectId: z.string().min(1),
  entityId: z.string().min(1),
  action: z.enum(['import', 'generate', 'prompt']),
  url: z.string().optional(),
  descriptor: z.string().optional(),
})

const FLUX_PROMPT = {
  endpoint: '',
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
  if (!parsed.success) return NextResponse.json({ error: 'Invalid resolution' }, { status: 400 })
  const id = productionAssetId(parsed.data.projectId, parsed.data.entityId)
  const asset = await db.asset.findFirst({ where: { id, ownerId: userId } })
  if (!asset) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  if (asset.mediaKind) {
    return NextResponse.json({ error: 'Finished media is not an entity reference' }, { status: 400 })
  }

  if (parsed.data.action === 'prompt') {
    const sourcePrompt = (parsed.data.descriptor || asset.sourcePrompt || '').trim()
    if (!sourcePrompt) return NextResponse.json({ error: 'A descriptor is required' }, { status: 400 })
    await db.asset.update({ where: { id }, data: { sourcePrompt, resolutionState: 'unresolved' } })
    return NextResponse.json({ id, resolutionState: 'unresolved' })
  }

  if (parsed.data.action === 'import') {
    const url = parsed.data.url?.trim()
    if (!url) return NextResponse.json({ error: 'An image URL is required' }, { status: 400 })
    await db.asset.update({
      where: { id },
      data: { sourceRefs: [url], resolutionState: 'imported', usableAsReference: true },
    })
    return NextResponse.json({ id, resolutionState: 'imported' })
  }

  const access = await checkAccess(userId, 1)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  const prompt = (parsed.data.descriptor || asset.sourcePrompt || '').trim()
  const t2i = buildFluxDevT2iInput(prompt)
  const payload = buildPayload(t2i.endpoint, { prompt, duration: 5 }, { ...FLUX_PROMPT, endpoint: t2i.endpoint })
  const result = await runFal<{ images?: Array<{ url?: string }> }>(
    t2i.endpoint,
    payload,
    undefined,
    undefined,
    undefined,
    undefined,
    'production.entity',
  )
  const imageUrl = result.images?.[0]?.url
  if (!imageUrl) return NextResponse.json({ error: 'Image model returned no image' }, { status: 502 })
  const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())
  const stored = await storeForUser(userId, bytes, 'png', 'image/png')
  await db.asset.update({
    where: { id },
    data: { generatedImage: stored, resolutionState: 'generated', usableAsReference: true },
  })
  return NextResponse.json({ id, resolutionState: 'generated', generatedImage: stored })
}
