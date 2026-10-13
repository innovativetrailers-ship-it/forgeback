import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readDialogue, selectVoiceTake } from '@/lib/audio/dialogueIntent'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  projectId: z.string().min(1),
  shotId: z.string().min(1),
  lineId: z.string().min(1),
  mediaId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid take selection' }, { status: 400 })
  const clip = await db.studioClip.findUnique({
    where: { id: parsed.data.shotId },
    select: { dialogue: true, scene: { select: { project: { select: { userId: true, id: true } } } } },
  })
  if (!clip || clip.scene.project.userId !== userId || clip.scene.project.id !== parsed.data.projectId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }
  const asset = await db.asset.findFirst({
    where: { id: parsed.data.mediaId, ownerId: userId, mediaKind: 'voice' },
    select: { id: true },
  })
  if (!asset) return NextResponse.json({ error: 'Voice take not found' }, { status: 404 })
  const dialogue = selectVoiceTake(readDialogue(clip.dialogue), parsed.data.lineId, parsed.data.mediaId)
  await db.studioClip.update({
    where: { id: parsed.data.shotId },
    data: { dialogue: JSON.parse(JSON.stringify(dialogue)) },
  })
  return NextResponse.json({ dialogue })
}
