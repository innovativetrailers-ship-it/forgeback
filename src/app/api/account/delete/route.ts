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
  await db.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: new Date() },
  })
  return NextResponse.json({
    requested: true,
    deleted: false,
    note: 'The request is recorded. Projects, clips, and characters were not removed.',
  })
}
