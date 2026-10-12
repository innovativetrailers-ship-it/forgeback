import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getFCCCharacter } from '@/lib/character/fccManager'
import { ingestPhotoReferences } from '@/lib/character/ingestion'
import { requireUserId } from '@/lib/character/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const character = await db.vaultCharacter.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!character || character.project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (character.referenceUrls.length === 0) {
    return NextResponse.json({ error: 'No reference images on character' }, { status: 400 })
  }

  try {
    const ingested = await ingestPhotoReferences(character.referenceUrls)
    await db.vaultCharacter.update({
      where: { id },
      data: {
        faceEmbedding: { embedding: ingested.faceEmbedding },
        bodyEmbedding: { embedding: ingested.bodyEmbedding },
        appearance: ingested.appearance as never,
        refProfile: character.referenceUrls[1] ?? null,
        ref3Quarter: character.referenceUrls[2] ?? null,
        refBack: character.referenceUrls[3] ?? null,
      },
    })
    const view = await getFCCCharacter(id, userId)
    return NextResponse.json(view)
  } catch (e) {
    console.warn("[caught] src/app/api/vault/character/[id]/ingest/route.ts:42", e instanceof Error ? { name: e.name, message: e.message } : e)

    const message = e instanceof Error ? e.message : 'Ingestion failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
