import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const request = await db.featureRequest.findUnique({ where: { id }, select: { id: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  const existing = await db.featureRequestVote.findUnique({ where: { requestId_userId: { requestId: id, userId } } })
  if (existing) return NextResponse.json({ error: 'You already voted' }, { status: 409 })
  const updated = await db.$transaction(async (tx) => {
    await tx.featureRequestVote.create({ data: { requestId: id, userId } })
    return tx.featureRequest.update({ where: { id }, data: { upvotes: { increment: 1 } }, select: { upvotes: true } })
  })
  return NextResponse.json({ upvotes: updated.upvotes })
}
