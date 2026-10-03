import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = patchSchema.parse(await req.json())
  const asset = await db.trainedAsset.findFirst({ where: { id, userId, deletedAt: null } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const updated = await db.trainedAsset.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    },
  })
  return NextResponse.json({ asset: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const asset = await db.trainedAsset.findFirst({ where: { id, userId, deletedAt: null } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.trainedAsset.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
  if (asset.trainingRunId) {
    await db.trainingRun.update({
      where: { id: asset.trainingRunId },
      data: { dataUrl: null, loraUrl: null, configUrl: null, errorMessage: 'Dataset and asset deleted by user' },
    })
  }
  await db.trainingRun.updateMany({
    where: { trainedAssetId: id, userId },
    data: { dataUrl: null, loraUrl: null, configUrl: null },
  })
  await db.vaultCharacter.updateMany({
    where: { trainedAssetId: id, project: { userId } },
    data: { trainedAssetId: null, loraStatus: 'PENDING', loraModelId: null },
  })
  await db.project.updateMany({
    where: { styleLoraId: id, userId },
    data: { styleLoraId: null },
  })
  await db.studioClip.updateMany({
    where: { characterLoraId: id, scene: { project: { userId } } },
    data: { characterLoraId: null },
  })
  await db.studioClip.updateMany({
    where: { styleLoraId: id, scene: { project: { userId } } },
    data: { styleLoraId: null },
  })
  return NextResponse.json({ ok: true })
}
