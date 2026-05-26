import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { renderQueue, getPriorityForRole } from '@/lib/queue'
import { checkAndDeductCredits, refundCredits, OPERATION_COSTS } from '@/lib/credits'
import { routeToModel, getOperationCostKey } from '@/lib/models/router'
import { decomposeClip } from '@/lib/routing/SceneDecomposer'
import { dispatchClip } from '@/lib/routing/MediaDispatcher'
import { blendMultiEngineClip } from '@/lib/routing/SeamlessBlender'
import type { QualityTier, SceneType } from '@/lib/models/types'

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
  const userId = request.headers.get('x-user-id')
  const userRole = request.headers.get('x-user-role') ?? 'FREE'

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createJobSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { projectId, type, quality, sceneType, payload } = parsed.data

  // ── Multi-engine omnichannel path for GENERATE jobs ──────────────────────
  if (type === 'GENERATE') {
    const p = payload as {
      prompt?: string
      duration?: number
      characterIds?: string[]
      locationId?: string
      forceMultiEngine?: boolean
      loraId?: string
      characterRefs?: string[]
    }

    const prompt = (p.prompt ?? '') as string
    const duration = Number(p.duration ?? 5)
    const tierLabel = ({ draft: 'Draft', standard: 'Standard', premium: 'Standard', cinematic: 'Cinematic', film: 'Film' }[quality] ?? 'Standard')

    // Decompose into segments — Model 1 decides if multi-engine is warranted
    let segments
    try {
      segments = await decomposeClip({
        masterPrompt: prompt,
        clipId: nanoid(8),
        duration,
        tier: tierLabel,
        characterIds: p.characterIds,
        locationId: p.locationId,
        forceMultiEngine: p.forceMultiEngine,
      })
    } catch {
      // Decomposition failure — fall through to single-engine path
      segments = null
    }

    if (segments && segments.length > 1) {
      // Multi-engine path: deduct credits per segment
      const totalCost = segments.reduce((s, seg) => s + seg.estimatedCredits, 0)

      try {
        // Deduct aggregate cost as a single logical operation
        await checkAndDeductCredits(userId, 'generate_wan', Math.ceil(totalCost / (OPERATION_COSTS['generate_wan'] ?? 2)))
      } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 402 })
      }

      const jobId = nanoid()
      const renderJob = await db.renderJob.create({
        data: {
          id: jobId,
          userId,
          projectId,
          type: 'GENERATE' as never,
          status: 'PROCESSING',
          modelUsed: 'multi_engine',
          creditsCharged: totalCost,
          inputPayload: payload as never,
          priority: getPriorityForRole(userRole),
        },
      })

      // Fire-and-forget: dispatch + blend then update job
      void (async () => {
        try {
          const results = await dispatchClip({ segments })
          const { blendedUrl } = await blendMultiEngineClip({ segments: results.map((r) => ({
            segmentId: r.segmentId,
            videoUrl: r.videoUrl,
            engineId: segments!.find((s) => s.segmentId === r.segmentId)?.engineId ?? 'wan',
          })) })

          await db.renderJob.update({
            where: { id: jobId },
            data: { status: 'COMPLETE', outputUrl: blendedUrl },
          })
        } catch (err) {
          await db.renderJob.update({
            where: { id: jobId },
            data: { status: 'FAILED', errorMessage: (err as Error).message },
          })
        }
      })()

      return NextResponse.json({ jobId: renderJob.id, status: 'PROCESSING', multiEngine: true, segmentCount: segments.length })
    }
    // Single segment — fall through to standard single-engine path below
  }

  // ── Standard single-engine path ──────────────────────────────────────────
  const model =
    type === 'GENERATE'
      ? routeToModel({
          quality: quality as QualityTier,
          sceneType: sceneType as SceneType | undefined,
          hasCharacterRef: Boolean(
            (payload as { characterRefs?: string[] }).characterRefs?.length
          ),
          hasLoRA: Boolean((payload as { loraId?: string }).loraId),
          duration: Number((payload as { duration?: number }).duration ?? 5),
          userRole,
        })
      : null

  const operationKey = model
    ? getOperationCostKey(model)
    : type.toLowerCase()

  const cost = OPERATION_COSTS[operationKey] ?? 0

  try {
    await checkAndDeductCredits(userId, operationKey)
  } catch (err) {
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

  try {
    await renderQueue.add(
      'render',
      {
        jobId: renderJob.id,
        userId,
        projectId,
        type,
        modelId: model,
        payload,
      },
      { priority: getPriorityForRole(userRole) }
    )
  } catch (queueErr) {
    // Queue unavailable (Redis down) — mark job failed and refund credits
    await db.renderJob.update({ where: { id: renderJob.id }, data: { status: 'FAILED', errorMessage: 'Queue unavailable' } })
    await refundCredits(userId, cost).catch(() => {})
    console.error('[jobs/create] Queue error:', (queueErr as Error).message)
    return NextResponse.json({ error: 'Job queue temporarily unavailable. Credits refunded.' }, { status: 503 })
  }

  return NextResponse.json({ jobId: renderJob.id, status: 'QUEUED' })
}
