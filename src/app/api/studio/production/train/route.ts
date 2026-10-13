import { recommendTrainer, trainingCostUsd } from '@cinema/core'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { productionAssetId } from '@/lib/studio/productionBoard'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  projectId: z.string().min(1),
  entityId: z.string().min(1),
  steps: z.number().int().min(100).max(8000).default(1000),
})

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid training estimate' }, { status: 400 })
  const asset = await db.asset.findFirst({
    where: { id: productionAssetId(parsed.data.projectId, parsed.data.entityId), ownerId: userId },
  })
  if (!asset) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  const image = asset.generatedImage || asset.sourceRefs[0]
  if (!image) return NextResponse.json({ error: 'Import or generate a reference before training' }, { status: 400 })
  const tab = asset.kind === 'character' ? 'cast' : 'styles'
  const recommended = recommendTrainer({ tab, kinds: ['image'] })
  return NextResponse.json({
    trainerKey: recommended.trainerKey,
    steps: parsed.data.steps,
    costUsd: trainingCostUsd(recommended.trainer, parsed.data.steps),
    imageUrl: image,
    tab,
    name: asset.sourcePrompt || asset.kind,
  })
}
