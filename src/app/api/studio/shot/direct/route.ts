import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fastEstimateCost } from '@/lib/orchestration/fastEstimate'
import { ModelResolveError, resolveModel } from '@cinema/core'
import { accessDeniedBody, checkAccess } from '@/lib/access/guard'
import { isGenerationPaused } from '@/lib/generation/pause'
import type { AnchorSource } from '@/generated/prisma/client'
import { parseQualityTier } from '@/lib/orchestration/tierPolicy'
import { resolveCollabAccess, assertCanGenerate } from '@/lib/collab/access'
import { claimOrAttachShot } from '@/lib/collab/claimShot'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  shotPlanId: z.string(),
  projectId: z.string(),
  prompt: z.string().min(3),
  anchorFrameUrl: z.string().url().optional(),
  anchorSource: z.enum(['auto', 'manual', 'keyframe', 'none']).optional(),
  modelOverride: z.string().nullable().optional(),
  directionNotes: z.string().optional(),
  mode: z.enum(['draft', 'production']).default('draft'),
  qualityTier: z.string().optional(),
})

function toAnchorSource(source: 'auto' | 'manual' | 'keyframe' | 'none'): AnchorSource {
  switch (source) {
    case 'manual': return 'MANUAL'
    case 'keyframe': return 'KEYFRAME'
    case 'none': return 'NONE'
    default: return 'AUTO'
  }
}

function fromDbAnchorSource(source: AnchorSource): 'auto' | 'manual' | 'keyframe' | 'none' {
  switch (source) {
    case 'MANUAL': return 'manual'
    case 'KEYFRAME': return 'keyframe'
    case 'AUTO': return 'auto'
    default: return 'none'
  }
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data
  const qualityTier = parseQualityTier(body.qualityTier)

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
    include: { scene: { include: { project: { select: { userId: true, id: true } } } } },
  })
  if (!clip || clip.scene.projectId !== body.projectId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }

  let resolvedAnchor: string | null
  let resolvedSource: AnchorSource
  if (body.anchorSource === 'none') {
    resolvedAnchor = null
    resolvedSource = 'NONE'
  } else if (body.anchorFrameUrl) {
    resolvedAnchor = body.anchorFrameUrl
    resolvedSource = toAnchorSource(body.anchorSource ?? 'manual')
  } else {
    resolvedAnchor = clip.anchorFrameUrl
    resolvedSource = clip.anchorFrameUrl
      ? clip.anchorSource
      : 'NONE'
  }

  const manual = body.modelOverride === undefined
    ? (clip.modelOverride?.trim() || null)
    : (body.modelOverride?.trim() || null)
  const chosen = manual ?? clip.assignedModel?.trim() ?? ''
  let effectiveModel: string
  try {
    if (!chosen) throw new ModelResolveError(`No model resolved for shot ${body.shotPlanId}`)
    effectiveModel = resolveModel(chosen).canonicalId
  } catch (err) {
    if (err instanceof ModelResolveError || (err instanceof Error && err.name === 'ModelResolveError')) {
      return NextResponse.json(
        { code: 'model_unresolved', shotId: body.shotPlanId, error: err instanceof Error ? err.message : 'No model resolved for this shot' },
        { status: 422 },
      )
    }
    throw err
  }
  const creditCost = Math.max(5, fastEstimateCost([effectiveModel], clip.duration))
  const ownerGate = await checkAccess(access.ownerUserId, creditCost)
  if (!ownerGate.allowed) {
    return NextResponse.json(accessDeniedBody(ownerGate), { status: ownerGate.code ?? 402 })
  }
  const actorGate = await checkAccess(userId, 0, 'directorMode')
  if (!actorGate.allowed) {
    return NextResponse.json({ error: actorGate.reason ?? 'Access denied' }, { status: actorGate.code ?? 403 })
  }

  const otherGenerating = await db.studioClip.count({
    where: {
      scene: { projectId: body.projectId },
      status: 'GENERATING',
      id: { not: body.shotPlanId },
    },
  })
  if (otherGenerating > 0) {
    return NextResponse.json(
      { error: 'Another shot is currently generating — one shot at a time', currentStatus: clip.status },
      { status: 409 },
    )
  }

  await db.studioClip.update({
    where: { id: body.shotPlanId },
    data: {
      prompt: body.prompt,
      anchorFrameUrl: resolvedAnchor,
      anchorSource: resolvedSource,
      modelOverride: manual,
      directionNotes: body.directionNotes ?? clip.directionNotes ?? null,
      assignedModel: manual ?? clip.assignedModel,
    },
  })

  const claimed = await claimOrAttachShot({
    clipId: clip.id,
    projectId: body.projectId,
    actorUserId: userId,
    ownerUserId: access.ownerUserId,
    creditCost,
    prompt: body.prompt,
    duration: clip.duration,
    metadata: {
      type: 'SHOT_GENERATE',
      clipId: clip.id,
      mode: body.mode,
      qualityTier,
      anchorFrameUrl: resolvedAnchor ?? undefined,
      anchorSource: fromDbAnchorSource(resolvedSource),
      effectiveModel,
      source: 'user_directed',
    },
  })

  if (claimed.outcome === 'refused') {
    const fresh = await db.studioClip.findUnique({ where: { id: clip.id }, select: { status: true } })
    return NextResponse.json(
      { error: claimed.reason, currentStatus: fresh?.status ?? clip.status },
      { status: 409 },
    )
  }
  if (claimed.outcome === 'completed') {
    return NextResponse.json({ jobId: claimed.jobId, videoUrl: claimed.videoUrl, idempotent: true, model: effectiveModel })
  }
  if (claimed.outcome === 'attached') {
    return NextResponse.json({ jobId: claimed.jobId, attached: true, model: effectiveModel })
  }

  const job = { id: claimed.jobId }

  try {
    const { renderQueue } = await import('@/lib/queue')
    await renderQueue.add('shot-generate', {
      jobId: job.id,
      userId,
      projectId: body.projectId,
      clipId: clip.id,
      prompt: body.prompt,
      anchorFrameUrl: resolvedAnchor ?? undefined,
      modelOverride: manual,
      mode: body.mode,
      qualityTier,
      source: 'user_directed',
    }, { attempts: 1 })
  } catch {
    await db.studioClip.update({
      where: { id: body.shotPlanId },
      data: {
        status: 'AWAITING_DIRECTION',
        generatingAt: null,
        generateClaimJobId: null,
        generateClaimedBy: null,
        generateClaimedAt: null,
      },
    })
    await db.renderJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: 'Queue unavailable' },
    })

    if (process.env.VERCEL) {
      const { processShotGenerateJob } = await import('@/lib/jobs/processShotGenerateJob')
      void processShotGenerateJob({
        jobId: job.id,
        userId,
        projectId: body.projectId,
        clipId: clip.id,
        prompt: body.prompt,
        anchorFrameUrl: resolvedAnchor ?? undefined,
        modelOverride: manual,
        mode: body.mode,
        qualityTier,
      }).catch((err) => console.error('[shot-direct] inline failed:', err))
    } else {
      return NextResponse.json({ error: 'Queue unavailable — try again' }, { status: 503 })
    }
  }

  return NextResponse.json({
    jobId: job.id,
    anchorUsed: resolvedAnchor,
    model: effectiveModel,
  })
}
