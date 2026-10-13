import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'
import { recordConsent } from '@/lib/privacy/consent'

const schema = z.object({
  voiceId: z.string().min(1),
  likenessConsent: z.literal(true),
  notMinor: z.literal(true),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Voice consent is required, and the person must not be a minor. The voice was not saved.' }, { status: 400 })
  }
  const { voiceId } = parsed.data

  const char = await db.vaultCharacter.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!char || char.project.userId !== userId) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  await recordConsent(userId, 'voice', 'vault.character.voice')
  await db.vaultCharacter.update({
    where: { id },
    data: { voiceId, voiceProvider: 'elevenlabs', voiceSource: 'library' },
  })

  return NextResponse.json({ ok: true })
}
