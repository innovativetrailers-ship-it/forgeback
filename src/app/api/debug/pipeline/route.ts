import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveModel } from '@/lib/models/resolveModel'
import { renderQueue } from '@/lib/queue'
import { queueConnection } from '@/lib/redis'

async function pingRedis(): Promise<void> {
  await queueConnection.ping()
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  const isDev = process.env.NODE_ENV === 'development' || user?.role === 'ADMIN'
  if (!isDev) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId query param required' }, { status: 400 })
  }

  const owned = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const [jobs, clips] = await Promise.all([
    db.renderJob.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        type: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.studioClip.findMany({
      where: { scene: { projectId } },
      include: { scene: { select: { sceneNumber: true } } },
      orderBy: [{ scene: { sceneNumber: 'asc' } }, { clipNumber: 'asc' }],
    }),
  ])

  let shotNumber = 0
  const shots = clips.map((c) => {
    shotNumber++
    return {
      shotNumber,
      status: c.status,
      assignedModel: c.assignedModel,
      generatingAt: c.generatingAt,
    }
  })

  const redis = await pingRedis().then(() => 'ok').catch((e: unknown) => {
    console.warn("[caught] src/app/api/debug/pipeline/route.ts:65", e instanceof Error ? { name: e.name, message: e.message } : e)
    return (`FAIL: ${e}`)
  })
  const counts = await renderQueue.getJobCounts('waiting', 'active', 'failed', 'delayed')
  const models = Object.fromEntries(
    shots.map((s) => {
      const modelId = s.assignedModel ?? 'unknown'
      try {
        return [modelId, resolveModel(modelId).falEndpoint]
      } catch (e) {
        console.warn("[caught] src/app/api/debug/pipeline/route.ts:72", e instanceof Error ? { name: e.name, message: e.message } : e)

        return [modelId, `RESOLVE FAIL: ${e}`]
      }
    }),
  )

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      error: j.errorMessage,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    })),
    shots,
    redis,
    queue: counts,
    models,
    falKeySet: Boolean(process.env.FAL_API_KEY),
  })
}
