import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const schema = z.object({
  target: z.enum(['shot-character', 'shot-style', 'project-style', 'character']),
  projectId: z.string().optional(),
  shotId: z.string().optional(),
  characterId: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = schema.parse(await req.json())
  const asset = await db.trainedAsset.findFirst({ where: { id, userId, deletedAt: null } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.target === 'project-style') {
    if (!body.projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    const project = await db.project.findFirst({ where: { id: body.projectId, userId } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    await db.project.update({ where: { id: project.id }, data: { styleLoraId: asset.id } })
    return NextResponse.json({ ok: true, styleLoraId: asset.id })
  }

  if (body.target === 'shot-style' || body.target === 'shot-character') {
    if (!body.shotId) return NextResponse.json({ error: 'shotId required' }, { status: 400 })
    const clip = await db.studioClip.findFirst({
      where: { id: body.shotId, scene: { project: { userId } } },
    })
    if (!clip) return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
    await db.studioClip.update({
      where: { id: clip.id },
      data: body.target === 'shot-style'
        ? { styleLoraId: asset.id }
        : { characterLoraId: asset.id },
    })
    return NextResponse.json({ ok: true, shotId: clip.id })
  }

  if (!body.characterId) return NextResponse.json({ error: 'characterId required' }, { status: 400 })
  const character = await db.vaultCharacter.findFirst({
    where: { id: body.characterId, project: { userId } },
  })
  if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  await db.vaultCharacter.update({
    where: { id: character.id },
    data: {
      trainedAssetId: asset.id,
      loraModelId: asset.loraUrl,
      loraStatus: 'READY',
    },
  })
  await db.trainedAsset.update({
    where: { id: asset.id },
    data: { linkedCharacterId: character.id },
  })
  return NextResponse.json({ ok: true, characterId: character.id })
}
