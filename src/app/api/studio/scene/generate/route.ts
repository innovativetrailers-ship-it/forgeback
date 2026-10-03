import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { MODEL_COSTS } from '@/lib/routing/engineRegistry'

const schema = z.object({
  projectId: z.string(),
  sceneId: z.string(),
  selectedModels: z.array(z.string()).min(1),
  mode: z.enum(['draft', 'production']).default('draft'),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = schema.parse(await req.json())
  const validIds = new Set(Object.keys(MODEL_COSTS))
  const selectedModels = body.selectedModels.filter((id) => validIds.has(id))
  if (!selectedModels.length) {
    return NextResponse.json({ error: 'No valid models in council selection' }, { status: 400 })
  }

  const scene = await db.studioScene.findUnique({
    where: { id: body.sceneId },
    include: { clips: { orderBy: { clipNumber: 'asc' } }, project: { select: { userId: true } } },
  })
  if (!scene || scene.projectId !== body.projectId || scene.project.userId !== userId) {
    return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
  }

  const previousScene = await db.studioScene.findFirst({
    where: { projectId: body.projectId, sceneNumber: scene.sceneNumber - 1 },
  })
  const crossSceneAnchor = previousScene?.transitionFrame ?? undefined

  const job = await db.renderJob.create({
    data: {
      userId,
      projectId: body.projectId,
      type: 'GENERATE',
      status: 'QUEUED',
      mode: 'director',
      prompt: `Scene ${scene.sceneNumber} manual generation`,
      duration: scene.clips.reduce((s, c) => s + c.duration, 0) || 10,
      metadata: {
        type: 'SCENE_GENERATE',
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        isFirstScene: scene.sceneNumber === 1,
        crossSceneAnchor,
        selectedModels,
        generationMode: body.mode,
        source: 'manual',
      },
    },
  })

  await db.studioScene.update({
    where: { id: scene.id },
    data: { status: 'GENERATING' },
  })

  try {
    const { renderQueue } = await import('@/lib/queue')
    await renderQueue.add('scene-generate', {
      jobId: job.id,
      userId,
      projectId: body.projectId,
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber,
      isFirstScene: scene.sceneNumber === 1,
      crossSceneAnchor,
      selectedModels,
      mode: body.mode,
      source: 'manual',
    })
  } catch (err) {
    console.warn("[caught] src/app/api/studio/scene/generate/route.ts:78", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Render queue unavailable' }, { status: 503 })
  }

  return NextResponse.json({ jobId: job.id })
}
