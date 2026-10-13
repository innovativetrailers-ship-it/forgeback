import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[account-delete]', err instanceof Error ? err.message : err)
    return null
  }) as { confirm?: boolean } | null
  if (body?.confirm !== true) {
    return NextResponse.json({ error: 'Export your data first. Deletion starts only when you confirm it.' }, { status: 400 })
  }
  const retiredAt = new Date()
  await db.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: retiredAt },
  })
  await db.vaultCharacter.updateMany({
    where: { project: { userId }, retiredAt: null },
    data: { retiredAt },
  })
  await db.studioClip.updateMany({
    where: { scene: { project: { userId } }, orphanedAt: null },
    data: { orphanedAt: retiredAt, statusReason: 'deletion requested' },
  })
  return NextResponse.json({
    requested: true,
    deleted: false,
    message: 'Your deletion request is recorded. Characters and clips are marked retired. The files were kept. Nothing was removed.',
  })
}
