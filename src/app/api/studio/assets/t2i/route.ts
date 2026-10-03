import { buildImagePayload } from '@cinema/core'
import { buildFluxDevT2iInput } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { IMAGE_FAL_TIMEOUT_MS, runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { forgeAssetFromRow } from '@/lib/assets/shape'

const schema = z.object({
  kind: z.enum(['character', 'style', 'asset']),
  prompt: z.string().min(3).max(2000),
  name: z.string().min(1).max(80),
  parentId: z.string().min(1).optional(),
})

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const kind = req.nextUrl.searchParams.get('kind') ?? 'character'
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
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid asset request' }, { status: 400 })

  const access = await checkAccess(userId, 1)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })

  if (parsed.data.parentId) {
    const parent = await db.asset.findFirst({ where: { id: parsed.data.parentId, ownerId: userId } })
    const reference = parent?.generatedImage?.trim()
    if (!parent || !reference) {
      return NextResponse.json({ error: 'The parent asset has no reference image to derive from' }, { status: 400 })
    }
    const built = buildImagePayload({
      model: 'nano-banana-2-edit',
      prompt: parsed.data.prompt,
      imageUrls: [reference],
      numImages: 1,
    })
    const result = await runFal<{ images?: Array<{ url?: string }> }>(
      built.endpoint,
      built.input,
      undefined,
      IMAGE_FAL_TIMEOUT_MS,
      undefined,
      undefined,
      'asset.variation',
    )
    const imageUrl = result.images?.[0]?.url
    if (!imageUrl) return NextResponse.json({ error: 'Image model returned no image' }, { status: 502 })
    const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())
    const stored = await uploadToR2(bytes, `assets/${userId}/variations/${Date.now()}.png`, 'image/png')
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
    return NextResponse.json({ asset: forgeAssetFromRow(row), variation })
  }

  const t2i = buildFluxDevT2iInput(parsed.data.prompt)
  const result = await runFal<{ images?: Array<{ url?: string }> }>(
    t2i.endpoint,
    t2i.input,
    undefined,
    IMAGE_FAL_TIMEOUT_MS,
    undefined,
    undefined,
    'asset.t2i',
  )
  const imageUrl = result.images?.[0]?.url
  if (!imageUrl) return NextResponse.json({ error: 'Image model returned no image' }, { status: 502 })

  const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())
  const key = `assets/${userId}/${Date.now()}.png`
  const stored = await uploadToR2(bytes, key, 'image/png')
  const row = await db.asset.create({
    data: {
      ownerId: userId,
      kind: parsed.data.kind,
      sourcePrompt: parsed.data.prompt,
      sourceRefs: [],
      generatedImage: stored,
      usableAsReference: true,
      isPrimary: true,
      label: parsed.data.name,
    },
  })
  return NextResponse.json({ asset: forgeAssetFromRow(row) })
}
