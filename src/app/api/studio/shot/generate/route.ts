import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fastEstimateCost } from '@/lib/orchestration/fastEstimate'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import { checkAccess } from '@/lib/access/guard'
import { isGenerationPaused } from '@/lib/generation/pause'
import { resolveCollabAccess, assertCanGenerate } from '@/lib/collab/access'
import { claimOrAttachShot } from '@/lib/collab/claimShot'

const schema = z.object({
  shotPlanId: z.string(),
  projectId: z.string(),
  mode: z.enum(['draft', 'production']).default('draft'),
  overridePrompt: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = schema.parse(await req.json())

  if (isGenerationPaused()) {
    return NextResponse.json(
      { error: 'Generation is paused for maintenance. Set GENERATION_PAUSED=false to enable.' },
      { status: 503 },
    )
  }

  const access = await resolveCollabAccess(body.projectId, userId)
  if (!access) return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  if (!assertCanGenerate(access)) {
    return NextResponse.json({ error: 'Role cannot generate' }, { status: 403 })
  }

  const clip = await db.studioClip.findUnique({
    where: { id: body.shotPlanId },
    include: { scene: { select: { projectId: true } } },
  })
  if (!clip || clip.scene.projectId !== body.projectId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }

  const creditModel = clip.assignedModel?.trim() || refuseSilentModelSwap(body.shotPlanId ?? clip.id, 'wan-2.7')
  const creditCost = Math.max(5, fastEstimateCost([creditModel], clip.duration))
  const ownerAccess = await checkAccess(access.ownerUserId, creditCost)
  if (!ownerAccess.allowed) {
    return NextResponse.json({ error: ownerAccess.reason ?? 'Access denied' }, { status: ownerAccess.code ?? 402 })
  }
  const actorAccess = await checkAccess(userId, 0, 'directorMode')
  if (!actorAccess.allowed) {
    return NextResponse.json({ error: actorAccess.reason ?? 'Access denied' }, { status: actorAccess.code ?? 403 })
  }

  const claimed = await claimOrAttachShot({
    clipId: clip.id,
    projectId: body.projectId,
    actorUserId: userId,
    ownerUserId: access.ownerUserId,
    creditCost,
    prompt: body.overridePrompt ?? clip.prompt,
    duration: clip.duration,
    metadata: {
      type: 'SHOT_GENERATE',
      clipId: clip.id,
      mode: body.mode,
      overridePrompt: body.overridePrompt,
    },
  })

  if (claimed.outcome === 'refused') {
    return NextResponse.json({ error: claimed.reason }, { status: 409 })
  }
  if (claimed.outcome === 'completed') {
    return NextResponse.json({ jobId: claimed.jobId, videoUrl: claimed.videoUrl, idempotent: true })
  }
  if (claimed.outcome === 'attached') {
    return NextResponse.json({ jobId: claimed.jobId, attached: true })
  }

  try {
    const { renderQueue } = await import('@/lib/queue')
    await renderQueue.add('shot-generate', {
      jobId: claimed.jobId,
      userId,
      projectId: body.projectId,
      clipId: clip.id,
      prompt: body.overridePrompt,
      mode: body.mode,
    }, { attempts: 1 })
  } catch {
    if (process.env.VERCEL) {
      const { processShotGenerateJob } = await import('@/lib/jobs/processShotGenerateJob')
      void processShotGenerateJob({
        jobId: claimed.jobId,
        userId,
        projectId: body.projectId,
        clipId: clip.id,
        prompt: body.overridePrompt,
        mode: body.mode,
      }).catch((err) => console.error('[shot-generate] inline failed:', err))
    } else {
      return NextResponse.json({ error: 'Render queue unavailable' }, { status: 503 })
    }
  }

  return NextResponse.json({ jobId: claimed.jobId })
}
