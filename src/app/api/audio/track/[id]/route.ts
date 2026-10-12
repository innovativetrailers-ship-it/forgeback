import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

const patchSchema = z.object({
  prompt: z.string().optional(),
  voiceId: z.string().optional(),
  sunoStyle: z.string().optional(),
  sunoLyrics: z.string().optional(),
  startSec: z.number().nullable().optional(),
  volumeDb: z.number().optional(),
  muted: z.boolean().optional(),
  locked: z.boolean().optional(),
  fadeInMs: z.number().int().optional(),
  fadeOutMs: z.number().int().optional(),
  duckUnderDialogue: z.boolean().optional(),
  url: z.string().optional(),
})

async function assertTrackOwner(trackId: string, userId: string) {
  return db.audioTrack.findFirst({
    where: { id: trackId, project: { userId } },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const track = await assertTrackOwner(id, userId)
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const body = patchSchema.parse(await req.json())
  const updated = await db.audioTrack.update({
    where: { id },
    data: body,
  })
  return NextResponse.json({ track: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(_req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const track = await assertTrackOwner(id, userId)
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  await db.audioTrack.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
