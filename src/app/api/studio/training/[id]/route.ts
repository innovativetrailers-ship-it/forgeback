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
  const run = await db.trainingRun.findFirst({ where: { id, userId } })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const lastError = run.jobId
    ? await db.shotError.findFirst({
      where: { jobId: run.jobId },
      orderBy: { createdAt: 'desc' },
      select: { userMessage: true, category: true, rawError: true },
    })
    : null
  return NextResponse.json({ run, lastError })
}
