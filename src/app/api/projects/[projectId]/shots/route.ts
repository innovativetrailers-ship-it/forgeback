import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listShotPlan } from '@/lib/studio/shotPlan'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const userId = (await requireUser(_req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const result = await listShotPlan(projectId, userId)
  return NextResponse.json(result)
}
