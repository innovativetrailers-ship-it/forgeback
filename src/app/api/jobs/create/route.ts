import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/requireUser'

export const maxDuration = 300
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { renderQueue, getPriorityForRole } from '@/lib/queue'
import { checkAndDeductCredits, refundCredits, OPERATION_COSTS } from '@/lib/credits'
import { getOperationCostKey, normalizeWorkerModelId, normaliseModelId } from '@/lib/models/router'
import { orchestrate } from '@/lib/orchestration'
import type { SceneSegment } from '@/lib/routing/types'
import type { StructuredShot } from '@/lib/orchestration/types'
import { enrichGeneratePayload } from '@/lib/character/jobIdentity'
import { recordGenerateShot } from '@/lib/studio/recordGenerateShot'

const createJobSchema = z.object({
  projectId: z.string().optional(),
  type: z.enum([
    'GENERATE',
    'REPAINT',
    'RELIGHT',
    'UPSCALE',
    'EXPORT',
    'LORA_TRAIN',
    'LIPSYNC',
    'AUTO_SOCIAL',
    'TRANSCRIBE',
    'CGI_INSERT',
  ]),
  quality: z
    .enum(['draft', 'standard', 'premium', 'cinematic', 'film'])
    .optional()
    .default('standard'),
  sceneType: z
    .enum(['action', 'dialogue', 'environment', 'aerial', 'cgi_heavy', 'general'])
    .optional(),
  payload: z.record(z.string(), z.unknown()),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  const userId = (await requireUser(request))?.id ??  session?.user?.id
  const userRole = (await requireUser(request))?.role ??  (session?.user as { role?: string } | undefined)?.role ?? 'FREE'

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createJobSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  let { projectId, type, quality, payload } = parsed.data

  if (type === 'GENERATE') {
    const rawPrompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
    if (!rawPrompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }
    payload = { ...payload, prompt: rawPrompt }
    payload = await enrichGeneratePayload(userId, projectId, payload)
    if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }
    if (projectId) {
      const ids = Array.isArray(payload.characterIds)
        ? payload.characterIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : []
      const single = typeof payload.characterId === 'string' ? payload.characterId : ''
      const characterIds = ids.length > 0 ? ids : single ? [single] : []
      try {
        const studioClipId = await recordGenerateShot({
          userId,
          projectId,
          prompt: payload.prompt,
          duration: Number(payload.duration ?? 5),
          aspectRatio: typeof payload.aspectRatio === 'string' ? payload.aspectRatio : '16:9',
          characterIds,
          locationId: typeof payload.locationId === 'string' ? payload.locationId : null,
        })
        payload = { ...payload, studioClipId }
      } catch (err) {
        console.warn("[caught] src/app/api/jobs/create/route.ts:89", err instanceof Error ? { name: err.name, message: err.message } : err)

        const message = err instanceof Error ? err.message : 'Could not save the shot'
        const status = message === 'Forbidden' ? 403 : 400
        return NextResponse.json({ error: message }, { status })
      }
    }
  }

  // ── Planning for GENERATE jobs goes through orchestrate ─────────────────
  let plannedModel: string | null = null
  if (type === 'GENERATE') {
    const p = payload as {
      prompt?: string
      duration?: number
      model?: string
      characterIds?: string[]
      selectedModels?: string[]
    }

    const prompt = (p.prompt ?? '') as string
    const duration = Number(p.duration ?? 5)
    const explicit = p.model ? normaliseModelId(p.model) : null
    const council = Array.isArray(p.selectedModels)
      ? p.selectedModels.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const selectedModels = explicit ? [explicit] : council
    const directed = explicit
      ? [{
        shotIndex: 0,
        startSeconds: 0,
        endSeconds: duration,
        duration,
        contentType: 'physical_action' as const,
        visualPrompt: prompt,
        cameraMove: 'static',
        motionLevel: 'medium' as const,
        hasDialogue: false,
        hasFaces: false,
        hasAudio: false,
        hasCGI: false,
        charactersPresent: [],
        locationsPresent: [],
        lighting: 'natural_day',
        mood: 'calm',
        bridgeRequired: false,
        continuityGroup: 1,
        isChainStart: true,
        modelOverride: explicit,
      } satisfies StructuredShot]
      : undefined

    let segments: SceneSegment[] | null = null
    try {
      const planned = await orchestrate({
        prompt,
        totalDuration: duration,
        selectedModels,
        userId,
        projectId,
        planOnly: true,
        skipInterpret: Boolean(explicit),
        directedShots: directed,
        generationMode: quality === 'draft' ? 'draft' : 'production',
      })
      if (!explicit && planned.segments.length > 1) {
        const clipId = nanoid(8)
        segments = planned.segments.map((seg, index) => ({
          segmentId: `${clipId}-${index}`,
          clipId,
          shotId: seg.shotId ?? `${clipId}-${index}`,
          startSeconds: 0,
          endSeconds: seg.duration || duration,
          prompt: planned.plannedShots?.[index]?.visualPrompt || prompt,
          engineId: seg.model,
          tier: quality,
          requirements: [],
          characterIds: p.characterIds,
          isHardCut: index === 0,
          estimatedCredits: Math.max(1, Math.ceil((seg.duration || duration) / 5)),
        }))
      } else {
        plannedModel = explicit ?? planned.segments[0]?.model ?? null
      }
    } catch (err) {
      console.warn("[caught] src/app/api/jobs/create/route.ts", err instanceof Error ? { name: err.name, message: err.message } : err)
      const message = err instanceof Error ? err.message : 'Could not plan the shot'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    if (segments && segments.length > 1) {
      // Multi-engine path: deduct credits per segment
      const totalCost = segments.reduce((s, seg) => s + seg.estimatedCredits, 0)
      const chargedUnits = Math.ceil(totalCost / (OPERATION_COSTS['generate_wan'] ?? 2))

      try {
        // Deduct aggregate cost as a single logical operation
        await checkAndDeductCredits(userId, 'generate_wan', chargedUnits)
      } catch (err) {
        console.warn("[caught] src/app/api/jobs/create/route.ts:137", err instanceof Error ? { name: err.name, message: err.message } : err)

        return NextResponse.json({ error: (err as Error).message }, { status: 402 })
      }

      const jobId = nanoid()
      const renderJob = await db.renderJob.create({
        data: {
          id: jobId,
          userId,
          projectId,
          type: 'GENERATE' as never,
          status: 'QUEUED',
          modelUsed: 'multi_engine',
          creditsCharged: chargedUnits,
          inputPayload: { ...payload, segments } as never,
          priority: getPriorityForRole(userRole),
        },
      })

      try {
        await renderQueue.add(
          'multi-engine',
          {
            jobId: renderJob.id,
            userId,
            projectId,
            type: 'GENERATE',
            modelId: 'multi_engine',
            payload: { ...payload, segments },
          },
          { priority: getPriorityForRole(userRole), attempts: 1 },
        )
      } catch (queueErr) {
        await db.renderJob.update({ where: { id: renderJob.id }, data: { status: 'FAILED', errorMessage: 'Queue unavailable' } })
        await refundCredits(userId, chargedUnits, 'queue_unavailable').catch((err) => logCaught('app/api/jobs/create/route', err))
        console.error('[jobs/create] Queue error:', (queueErr as Error).message)
        return NextResponse.json({ error: 'Job queue temporarily unavailable. Credits refunded.' }, { status: 503 })
      }

      return NextResponse.json({ jobId: renderJob.id, status: 'QUEUED', multiEngine: true, segmentCount: segments.length })
    }
    // Single segment — fall through to standard single-engine path below
  }

  // ── Standard single-engine path ──────────────────────────────────────────
  let model: string | null = null

  if (type === 'GENERATE') {
    const p = payload as {
      prompt?: string
      model?: string
      duration?: number
      aspectRatio?: string
      quality?: string
      hasCharacterRef?: boolean
      hasLoRA?: boolean
      imageUrl?: string
      startFrameUrl?: string
    }

    if (p.imageUrl && !p.startFrameUrl) {
      p.startFrameUrl = p.imageUrl
      payload = { ...payload, startFrameUrl: p.imageUrl }
    }

    model = plannedModel
  }

  const operationKey = model
    ? getOperationCostKey(normalizeWorkerModelId(model))
    : type.toLowerCase()

  const cost = OPERATION_COSTS[operationKey] ?? 0

  try {
    await checkAndDeductCredits(userId, operationKey)
  } catch (err) {
    console.warn("[caught] src/app/api/jobs/create/route.ts:251", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json(
      { error: (err as Error).message },
      { status: 402 }
    )
  }

  const jobId = nanoid()

  const renderJob = await db.renderJob.create({
    data: {
      id: jobId,
      userId,
      projectId,
      type: type as never,
      status: 'QUEUED',
      modelUsed: model ?? undefined,
      creditsCharged: cost,
      inputPayload: payload as never,
      priority: getPriorityForRole(userRole),
    },
  })

  const jobData = {
    jobId: renderJob.id,
    userId,
    projectId,
    type,
    modelId: model ?? undefined,
    payload,
  }

  try {
    await renderQueue.add(
      'render',
      jobData,
      // attempts:1 — never auto-retry a paid fal.ai generation (each retry is
      // a fresh charge). Failures surface to the user to retry deliberately.
      { priority: getPriorityForRole(userRole), attempts: 1 }
    )
  } catch (queueErr) {
    // Queue unavailable (Redis down) — mark job failed and refund credits
    await db.renderJob.update({ where: { id: renderJob.id }, data: { status: 'FAILED', errorMessage: 'Queue unavailable' } })
    await refundCredits(userId, cost, 'queue_unavailable').catch((err) => logCaught('app/api/jobs/create/route', err))
    console.error('[jobs/create] Queue error:', (queueErr as Error).message)
    return NextResponse.json({ error: 'Job queue temporarily unavailable. Credits refunded.' }, { status: 503 })
  }

  return NextResponse.json({ jobId: renderJob.id, status: 'QUEUED' })
}
