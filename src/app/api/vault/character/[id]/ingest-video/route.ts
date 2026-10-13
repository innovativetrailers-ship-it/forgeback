import { NextRequest, NextResponse } from 'next/server'
import { getFCCCharacter } from '@/lib/character/fccManager'
import { ingestVideoReference } from '@/lib/character/ingestion'
import { requireUserId } from '@/lib/character/auth'
import { db } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const body = (await request.json()) as { videoUrl?: string }
  if (!body.videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })

  const character = await db.vaultCharacter.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!character || character.project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const ingested = await ingestVideoReference(body.videoUrl)
    await db.vaultCharacter.update({
      where: { id },
      data: {
        referenceUrls: [ingested.frameUrl, ...character.referenceUrls.slice(1)],
        faceEmbedding: { embedding: ingested.faceEmbedding },
        bodyEmbedding: { embedding: ingested.bodyEmbedding },
        appearance: ingested.appearance as never,
      },
    })
    const view = await getFCCCharacter(id, userId)
    return NextResponse.json(view)
  } catch (e) {
    console.warn("[caught] src/app/api/vault/character/[id]/ingest-video/route.ts:39", e instanceof Error ? { name: e.name, message: e.message } : e)

    const message = e instanceof Error ? e.message : 'Video ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
