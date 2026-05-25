import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { recipe } = body

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updated = await db.project.update({
    where: { id },
    data: {
      timelineJson: recipe ?? undefined,
      updatedAt: new Date(),
    },
  })

  return NextResponse.json({ project: updated })
}
