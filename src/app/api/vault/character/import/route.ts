import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deserializeFCC } from '@/lib/character/fccSchema'
import { getFCCCharacter, toFCCView, vaultToFCC } from '@/lib/character/fccManager'
import { requireUserId } from '@/lib/character/auth'

export async function POST(request: NextRequest) {
  const userId = await requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const body = (await request.json()) as { json?: string; projectId?: string; name?: string }
  if (!body.json) return NextResponse.json({ error: 'json required' }, { status: 400 })

  const fcc = deserializeFCC(body.json)
  if (!fcc) return NextResponse.json({ error: 'Invalid .fcc file' }, { status: 400 })

  const projectId = body.projectId ?? 'global'
  const project = await db.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const name = body.name ?? fcc.name
  const created = await db.vaultCharacter.create({
    data: {
      projectId,
      name,
      referenceUrls: [fcc.refFront, fcc.refProfile, fcc.ref3Quarter, fcc.refBack].filter(
        (u): u is string => Boolean(u),
      ),
      refProfile: fcc.refProfile ?? null,
      ref3Quarter: fcc.ref3Quarter ?? null,
      refBack: fcc.refBack ?? null,
      faceEmbedding: fcc.faceEmbedding.length ? { embedding: fcc.faceEmbedding } : undefined,
      bodyEmbedding: fcc.bodyEmbedding.length ? { embedding: fcc.bodyEmbedding } : undefined,
      appearance: fcc.appearance as never,
      behavioralPrompt: fcc.behavioralPrompt,
      loraModelId: fcc.loraWeightsRef ?? null,
    },
  })

  if (fcc.wardrobe.length > 0) {
    await db.wardrobeItem.createMany({
      data: fcc.wardrobe.map((w) => ({
        id: w.id,
        characterId: created.id,
        region: w.region,
        prompt: w.prompt,
        refImageUrl: w.refImageUrl,
        lockedHash: w.lockedHash,
        appliedAt: new Date(w.appliedAt),
      })),
    })
  }

  const view = await getFCCCharacter(created.id, userId)
  return NextResponse.json(view ?? toFCCView({ ...vaultToFCC(created), wardrobe: fcc.wardrobe }))
}
