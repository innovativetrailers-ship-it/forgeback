import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/db'
import { renderQueue } from '../../../lib/queue'
import { requireUser } from '@/lib/auth/requireUser'

// Plugin API — Studio tier only, authenticated via API key
async function authenticatePlugin(req: NextRequest): Promise<{ userId: string | null }> {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.PLUGIN_API_SECRET) {
    // Also allow x-user-id from normal auth middleware for Studio users
    const userId = (await requireUser(req))?.id ?? null
    return { userId }
  }
  // For now, plugin key maps to a system user — in production, use a key→userId lookup
  return { userId: (await requireUser(req))?.id ?? null }
}

export async function GET(req: NextRequest) {
  const { userId } = await authenticatePlugin(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const resource = searchParams.get('resource')

  if (resource === 'timeline') {
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const project = await db.project.findUnique({
      where: { id: projectId, userId },
      select: { timelineJson: true, title: true },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ timeline: project.timelineJson, title: project.title })
  }

  if (resource === 'vault') {
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const [characters, locations] = await Promise.all([
      db.vaultCharacter.findMany({ where: { projectId } }),
      db.vaultLocation.findMany({ where: { projectId } }),
    ])
    return NextResponse.json({ characters, locations })
  }

  return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const { userId } = await authenticatePlugin(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/plugin/route.ts:60", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (action === 'create_job') {
    const { projectId, modelId, payload, type = 'GENERATE' } = body as {
      projectId: string
      modelId: string
      payload: Record<string, unknown>
      type?: string
    }

    const renderJob = await db.renderJob.create({
      data: {
        userId,
        projectId: projectId ?? null,
        type: 'GENERATE',
        status: 'QUEUED',
        modelUsed: modelId,
        inputPayload: payload as never,
        creditsCharged: 0,
      },
    })

    await renderQueue.add('render', {
      userId,
      projectId,
      jobId: renderJob.id,
      modelId,
      payload,
      type,
    })

    return NextResponse.json({ jobId: renderJob.id }, { status: 201 })
  }

  if (action === 'export') {
    const { projectId } = body as { projectId: string }
    const project = await db.project.findUnique({
      where: { id: projectId, userId },
      select: { timelineJson: true },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const exportJob = await renderQueue.add('export', { userId, projectId, timeline: project.timelineJson })
    return NextResponse.json({ jobId: exportJob.id })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
