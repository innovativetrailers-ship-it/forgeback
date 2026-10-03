import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cameraPatchFromPreset, genrePreset, isGenrePresetId } from '@cinema/core'
import { db } from '@/lib/db'

const schema = z.object({
  lipSyncEnabled: z.boolean().optional(),
  lipSyncModel: z.string().nullable().optional(),
  characterIds: z.array(z.string()).optional(),
  locationId: z.string().nullable().optional(),
  cameraAngle: z.string().nullable().optional(),
  cameraMove: z.string().nullable().optional(),
  shotSize: z.string().nullable().optional(),
  lensFeel: z.string().nullable().optional(),
  cameraSpeed: z.string().nullable().optional(),
  cameraPrecision: z.boolean().optional(),
  endFrameUrl: z.string().nullable().optional(),
  moneyShot: z.boolean().optional(),
  characterLoraId: z.string().nullable().optional(),
  styleLoraId: z.string().nullable().optional(),
  genrePresetId: z.string().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = schema.parse(await req.json())

  const clip = await db.studioClip.findUnique({
    where: { id },
    include: { scene: { include: { project: { select: { userId: true } } } } },
  })
  if (!clip || clip.scene.project.userId !== userId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }

  if (body.characterIds) {
    const found = await db.vaultCharacter.count({
      where: { id: { in: body.characterIds }, project: { userId } },
    })
    if (found !== body.characterIds.length) {
      return NextResponse.json({ error: 'Character not in this vault' }, { status: 400 })
    }
  }
  if (body.locationId) {
    const plate = await db.locationPlate.findFirst({ where: { id: body.locationId, userId } })
    if (!plate) return NextResponse.json({ error: 'Location plate not found' }, { status: 400 })
  }
  if (body.characterLoraId) {
    const asset = await db.trainedAsset.findFirst({ where: { id: body.characterLoraId, userId, deletedAt: null } })
    if (!asset) return NextResponse.json({ error: 'Character LoRA not found' }, { status: 400 })
  }
  if (body.styleLoraId) {
    const asset = await db.trainedAsset.findFirst({ where: { id: body.styleLoraId, userId, deletedAt: null } })
    if (!asset) return NextResponse.json({ error: 'Style LoRA not found' }, { status: 400 })
  }
  if (body.genrePresetId && !isGenrePresetId(body.genrePresetId)) {
    return NextResponse.json({ error: 'Unknown genre preset' }, { status: 400 })
  }

  const preset = body.genrePresetId ? genrePreset(body.genrePresetId) : null
  const cameraFromPreset = preset
    ? cameraPatchFromPreset(preset.cameraDefaults, {
        cameraAngle: body.cameraAngle !== undefined ? body.cameraAngle : clip.cameraAngle,
        cameraMove: body.cameraMove !== undefined ? body.cameraMove : clip.cameraMove,
        shotSize: body.shotSize !== undefined ? body.shotSize : clip.shotSize,
        lensFeel: body.lensFeel !== undefined ? body.lensFeel : clip.lensFeel,
        cameraSpeed: body.cameraSpeed !== undefined ? body.cameraSpeed : clip.cameraSpeed,
      })
    : {}

  const editingCamera = [
    body.cameraAngle,
    body.cameraMove,
    body.shotSize,
    body.lensFeel,
    body.cameraSpeed,
    body.cameraPrecision,
  ].some((value) => value !== undefined)
  const cameraSource = editingCamera
    ? (clip.cameraSource === 'ai' ? 'ai_then_manual' : clip.cameraSource === 'ai_then_manual' ? 'ai_then_manual' : 'manual')
    : undefined

  const updated = await db.studioClip.update({
    where: { id },
    data: {
      ...(body.lipSyncEnabled !== undefined ? { lipSyncEnabled: body.lipSyncEnabled } : {}),
      ...(body.lipSyncModel !== undefined ? { lipSyncModel: body.lipSyncModel } : {}),
      ...(body.characterIds !== undefined ? { characterIds: body.characterIds } : {}),
      ...(body.locationId !== undefined ? { locationId: body.locationId } : {}),
      ...(body.cameraAngle !== undefined ? { cameraAngle: body.cameraAngle } : {}),
      ...(body.cameraMove !== undefined ? { cameraMove: body.cameraMove } : {}),
      ...(body.shotSize !== undefined ? { shotSize: body.shotSize } : {}),
      ...(body.lensFeel !== undefined ? { lensFeel: body.lensFeel } : {}),
      ...(body.cameraSpeed !== undefined ? { cameraSpeed: body.cameraSpeed } : {}),
      ...(body.cameraPrecision !== undefined ? { cameraPrecision: body.cameraPrecision } : {}),
      ...(body.endFrameUrl !== undefined ? { endFrameUrl: body.endFrameUrl } : {}),
      ...(body.moneyShot !== undefined ? { moneyShot: body.moneyShot } : {}),
      ...(body.characterLoraId !== undefined ? { characterLoraId: body.characterLoraId } : {}),
      ...(body.styleLoraId !== undefined ? { styleLoraId: body.styleLoraId } : {}),
      ...(body.genrePresetId !== undefined ? { genrePresetId: body.genrePresetId } : {}),
      ...(preset ? cameraFromPreset : {}),
      ...(cameraSource ? { cameraSource } : {}),
    },
  })

  return NextResponse.json({ clip: updated })
}
