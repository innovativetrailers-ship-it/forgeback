import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const clip = await db.studioClip.findFirst({
    where: { id, scene: { project: { userId } } },
    select: { id: true },
  })
  if (!clip) return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  const error = await db.shotError.findFirst({
    where: { shotId: id },
    orderBy: { createdAt: 'desc' },
  })
  if (!error) return NextResponse.json({ error: 'No captured error' }, { status: 404 })
  return NextResponse.json(error)
}
