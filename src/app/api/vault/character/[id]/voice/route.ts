import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({ voiceId: z.string().min(1) })

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { voiceId } = schema.parse(await req.json())

  const char = await db.vaultCharacter.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!char || char.project.userId !== userId) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  await db.vaultCharacter.update({
    where: { id },
    data: { voiceId, voiceProvider: 'elevenlabs', voiceSource: 'library' },
  })

  return NextResponse.json({ ok: true })
}
