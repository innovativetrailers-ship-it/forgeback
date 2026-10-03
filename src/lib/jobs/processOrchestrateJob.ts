import type { StructuredShot } from '@/lib/orchestration/types'
import { logCaught } from '@/lib/diagnostics/caught'
/**
 * Director-mode orchestration — BullMQ worker + Vercel inline `after()`.
 */
import { db } from '@/lib/db'
import type { CreativeBrief } from '@/lib/cognition'
import { Prisma } from '@/generated/prisma/client'
import { appendJobProgressEvent, parseProgressEvents } from '@/lib/jobs/jobProgressEvents'
import { formatFalBalanceError } from '@/lib/fal/accountStatus'
import { parseQualityTier, TIER_POLICY, toRagConstraint } from '@/lib/orchestration/tierPolicy'
import { parseCreativeLicense, type CreativeLicense } from '@/lib/cognition/license'
import { parseWizard, WizardHold } from '@/lib/orchestration/wizardState'

function readTemplateShots(value: unknown): StructuredShot[] | undefined {
  if (!Array.isArray(value)) return undefined
  const shots = value.filter((row): row is StructuredShot => {
    return Boolean(row) && typeof row === 'object' && typeof (row as StructuredShot).visualPrompt === 'string'
  })
  return shots.length ? shots : undefined
}

function describeProviderError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { status?: number; message?: string; body?: { detail?: unknown } }
    const detail = e.body?.detail
    const detailStr =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((d) => (d as { msg?: string; message?: string })?.msg ?? (d as { message?: string })?.message)
              .filter(Boolean)
              .join('; ')
          : ''
    if (detailStr) return formatFalBalanceError(detailStr)
    if (e.message) {
      const msg = e.status ? `${e.message} (${e.status})` : e.message
      return formatFalBalanceError(msg)
    }
  }
  const msg = err instanceof Error ? err.message : 'Unknown error'
  return formatFalBalanceError(msg)
}

export interface ProcessOrchestrateInput {
  jobId: string
  userId: string
  prompt: string
  duration: number
  selectedModels: string[]
  creditCost?: number
  useCognition?: boolean
  fccCognitionContext?: {
    name: string
    behavioralPrompt?: string
    wardrobeSummary?: string
    appearanceSummary?: string
  }
  projectId?: string
  generationMode?: 'draft' | 'production'
  qualityTier?: string
  creativeLicense?: CreativeLicense
  source?: string
  heartbeat?: () => void | Promise<void>
}

export async function processOrchestrateJob(input: ProcessOrchestrateInput): Promise<void> {
  const {
    jobId,
    userId,
    prompt,
    duration,
    selectedModels,
    creditCost,
    useCognition,
    fccCognitionContext,
    projectId,
    generationMode: inputGenerationMode,
    qualityTier: inputQualityTier,
    creativeLicense: inputLicense,
    source,
    heartbeat: inputHeartbeat,
  } = input

  const heartbeat = inputHeartbeat ?? (async () => {
    await db.renderJob.update({
      where: { id: jobId },
      data:  { updatedAt: new Date() },
    }).catch((err) => {
      // A missed heartbeat must not fail the job.
      logCaught('heartbeat', err, { jobId, stage: 'heartbeat' })
    })
  })

  const { resolveOrchestrationScript } = await import('@/lib/jobs/resolveOrchestrationScript')
  const script = await resolveOrchestrationScript(jobId, { prompt })

  console.log('[orchestrate] Received job payload:', {
    prompt: script.slice(0, 100),
    jobId,
    source: source ?? 'unknown',
  })

  if (jobId) {
    const { clearDecompositionCheckpoint } = await import('@/lib/orchestration/checkpoints')
    await clearDecompositionCheckpoint(jobId)
  }
  let modelsToUse = selectedModels?.filter(Boolean) ?? []
  if (!modelsToUse.length && jobId) {
    const row = await db.renderJob.findUnique({
      where: { id: jobId },
      select: { metadata: true },
    })
    const meta = row?.metadata as { selectedModels?: string[] } | null
    if (meta?.selectedModels?.length) {
      modelsToUse = meta.selectedModels
    }
  }
  if (!modelsToUse.length) {
    throw new Error(
      `[orchestrate] Director job ${jobId} arrived with empty selectedModels (source=${source ?? 'unknown'})`,
    )
  }

  let generationMode: 'draft' | 'production' = inputGenerationMode ?? 'draft'
  if (!inputGenerationMode && jobId) {
    const row = await db.renderJob.findUnique({
      where: { id: jobId },
      select: { metadata: true },
    })
    const meta = row?.metadata as { generationMode?: string } | null
    if (meta?.generationMode === 'production') generationMode = 'production'
  }

  let license = parseCreativeLicense(inputLicense)
  if (!inputLicense && jobId) {
    const row = await db.renderJob.findUnique({
      where: { id: jobId },
      select: { metadata: true },
    })
    const meta = row?.metadata as { creativeLicense?: string } | null
    license = parseCreativeLicense(meta?.creativeLicense)
  }

  let qualityName = inputQualityTier
  if (!qualityName && jobId) {
    const row = await db.renderJob.findUnique({
      where: { id: jobId },
      select: { metadata: true },
    })
    const meta = row?.metadata as { qualityTier?: string } | null
    qualityName = meta?.qualityTier
  }
  if (!qualityName && projectId) {
    const playbook = await (await import('@/lib/playbook')).loadActivePlaybook(userId, projectId).catch((err) => {
      console.warn("[caught] src/lib/jobs/processOrchestrateJob.ts:146", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (null)
    })
    const tier = playbook?.generation?.defaultQualityTier
    if (tier === 'draft') qualityName = 'Draft'
    else if (tier === 'blockbuster') qualityName = 'Blockbuster'
    else if (tier === 'studio') qualityName = 'Studio'
  }
  const qualityTier = parseQualityTier(qualityName)
  const tierPolicy = TIER_POLICY[qualityTier]
  console.log(`[orchestrate] Model pool for job ${jobId}:`, modelsToUse, `mode=${generationMode}`, `tier=${qualityTier}`, `resolution=${tierPolicy.resolution}`)

  const jobStartTime = Date.now()
  await appendJobProgressEvent(
    jobId,
    { phase: 'starting', status: 'running', detail: 'Starting director orchestration…', pct: 2 },
    {
      status: 'PROCESSING',
      progressPct: 2,
      phase: 'patient_zero',
      statusMessage: 'Starting…',
    },
  )

  let brief: CreativeBrief | null = null

  try {
    let finalPrompt = script

    if (useCognition) {
      const { think } = await import('@/lib/cognition')
      let characterContext = fccCognitionContext ?? null
      if (!characterContext && projectId) {
        try {
          const { resolveMatchedVaultCharacter, toCognitionContext } = await import('@/lib/character/jobIdentity')
          const matched = await resolveMatchedVaultCharacter(userId, projectId, script)
          if (matched) characterContext = toCognitionContext(matched)
        } catch (err) {
          // Character context is optional. think() still runs.
          logCaught('lib/jobs/processOrchestrateJob', err, { jobId, stage: 'character-context' })
        }
      }
      await db.renderJob.update({
        where: { id: jobId },
        data: { phase: 'thinking', statusMessage: 'The director is thinking…' },
      }).catch((err) => {
        // Status text is optional. The think() call still runs.
        logCaught('status', err, { jobId, stage: 'thinking' })
      })
      try {
        brief = await think({
          userId,
          prompt: script,
          durationSec: duration,
          characterContext,
          license,
          onProgress: async (detail) => {
            await appendJobProgressEvent(
              jobId,
              { phase: 'thinking', status: 'running', detail },
              { phase: 'thinking', statusMessage: detail },
            ).catch((err) => {
              // Progress text is optional. Director thinking continues.
              logCaught('progress', err, { jobId, stage: 'thinking' })
            })
          },
        })
        finalPrompt = script
      } catch (e) {
        console.warn('[cognition] director degraded → raw prompt:', e instanceof Error ? e.message : String(e))
        finalPrompt = script
      }
    }

    const orchestrationPrompt = (finalPrompt?.trim() || script.trim())
    if (!orchestrationPrompt) {
      throw new Error('Prompt is required for director orchestration')
    }

    const { orchestrate, PreflightError } = await import('@/lib/orchestration')
    const { settleHold, getHold } = await import('@/lib/credits/escrow')
    const { NeedsAttentionError, BudgetCapReached } = await import('@/lib/orchestration/budget')

    let result: Awaited<ReturnType<typeof orchestrate>>
    try {
      const jobRow = await db.renderJob.findUnique({
        where: { id: jobId },
        select: { metadata: true, projectId: true },
      })
      const jobMeta = (jobRow?.metadata as Record<string, unknown>) ?? {}
      let musicUrl: string | undefined
      let ambienceUrl: string | undefined
      const pid = projectId ?? jobRow?.projectId ?? undefined
      if (pid) {
        const proj = await db.project.findUnique({
          where: { id: pid },
          select: { musicUrl: true, ambienceUrl: true },
        })
        musicUrl = proj?.musicUrl ?? (typeof jobMeta.musicUrl === 'string' ? jobMeta.musicUrl : undefined)
        ambienceUrl = proj?.ambienceUrl ?? (typeof jobMeta.ambienceUrl === 'string' ? jobMeta.ambienceUrl : undefined)
      }

      const STALL_MS = 3 * 60 * 1000
      let lastBeat = Date.now()
      let stage = 'starting'
      const mark = (phase: string) => {
        lastBeat = Date.now()
        stage = phase
      }
      let stallTimer: ReturnType<typeof setInterval> | undefined
      const stallPromise = new Promise<never>((_, reject) => {
        stallTimer = setInterval(() => {
          if (Date.now() - lastBeat <= STALL_MS) return
          if (stallTimer) clearInterval(stallTimer)
          const minutes = Math.round(STALL_MS / 60_000)
          reject(new Error(`Stalled at ${stage}: no progress in ${minutes}m`))
        }, 15_000)
      })
      const orchestration = orchestrate({
        prompt: orchestrationPrompt,
        totalDuration: duration,
        selectedModels: modelsToUse,
        userId,
        jobId,
        projectId: pid,
        musicUrl,
        ambienceUrl,
        generationMode,
        qualityTier: toRagConstraint(qualityTier),
        creativeLicense: license,
        wizard: parseWizard(jobMeta.wizard),
        directedShots: readTemplateShots(jobMeta.templateShots),
        resolution: tierPolicy.resolution,
        heartbeat: async () => {
          mark(stage)
          await heartbeat()
        },
        onProgress: async (phase, detail, pct) => {
        mark(phase)
        const elapsedSec = (Date.now() - jobStartTime) / 1000
        const etaSeconds = pct > 5 ? Math.max(0, Math.round((elapsedSec / pct) * (100 - pct))) : null
        await appendJobProgressEvent(
          jobId,
          {
            phase,
            status: pct >= 100 ? 'completed' : 'running',
            detail,
            pct,
          },
          {
            progressPct: pct,
            phase,
            statusMessage: detail,
            ...(etaSeconds !== null ? { etaSeconds } : {}),
          },
        ).catch((err) => {
          // Progress percentage is optional. Generation continues.
          logCaught('progress', err, { jobId, stage: 'generating' })
        })
        },
      })
      try {
        result = await Promise.race([orchestration, stallPromise])
      } finally {
        if (stallTimer) clearInterval(stallTimer)
      }
    } catch (orchErr) {
      if (orchErr instanceof PreflightError) {
        await appendJobProgressEvent(
          jobId,
          { phase: 'preflight_failed', status: 'failed', detail: orchErr.message },
          { status: 'FAILED', errorMessage: orchErr.message, statusMessage: 'Preflight failed' },
        ).catch((err) => {
          // The preflight error is rethrown below. This write is the status row.
          logCaught('preflight_status', err, { jobId, stage: 'preflight_failed' })
        })
        throw orchErr
      }
      if (orchErr instanceof WizardHold) {
        const held = await db.renderJob.findUnique({ where: { id: jobId }, select: { metadata: true } })
        const meta = (held?.metadata && typeof held.metadata === 'object' ? held.metadata : {}) as Record<string, unknown>
        await appendJobProgressEvent(
          jobId,
          { phase: `awaiting_user:${orchErr.stage}`, status: 'paused', detail: orchErr.message },
          {
            status: 'NEEDS_ATTENTION',
            phase: `awaiting_user:${orchErr.stage}`,
            statusMessage: orchErr.message,
          },
        ).catch((err) => {
          console.warn('[wizard] hold status write failed', err instanceof Error ? err.message : err)
        })
        const fresh = await db.renderJob.findUnique({ where: { id: jobId }, select: { metadata: true } })
        const saved = (fresh?.metadata && typeof fresh.metadata === 'object' ? fresh.metadata : meta) as Record<string, unknown>
        await db.renderJob.update({
          where: { id: jobId },
          data: { metadata: { ...saved, wizard: JSON.parse(JSON.stringify(orchErr.next)) } },
        }).catch((err) => {
          console.warn('[wizard] hold metadata write failed', err instanceof Error ? err.message : err)
        })
        return
      }
      if (orchErr instanceof NeedsAttentionError || orchErr instanceof BudgetCapReached) {
        const phase = orchErr instanceof BudgetCapReached ? 'budget_cap_reached' : 'paused_needs_attention'
        await appendJobProgressEvent(
          jobId,
          { phase, status: 'paused', detail: orchErr.message },
          { status: 'NEEDS_ATTENTION', statusMessage: orchErr.message },
        ).catch((err) => {
          logCaught('needs_attention', err, { jobId, stage: phase })
          throw err
        })
        return
      }
      const hold = await getHold(jobId)
      if (hold?.status === 'ACTIVE') {
        await settleHold(jobId)
      }
      throw orchErr
    }

    const settlement = await settleHold(jobId)
    const actualCredits = settlement?.used ?? result.totalCredits

    await appendJobProgressEvent(
      jobId,
      { phase: 'complete', status: 'completed', detail: 'Film complete', pct: 100 },
      {
        status: 'COMPLETE',
        progressPct: 100,
        phase: 'complete',
        etaSeconds: 0,
        statusMessage: 'Complete',
        outputUrl: result.finalVideoUrl,
        completedAt: new Date(),
      },
    )

    const row = await db.renderJob.findUnique({ where: { id: jobId }, select: { metadata: true } })
    const prevMeta = (row?.metadata as Record<string, unknown>) ?? {}
    const progressEvents = parseProgressEvents(prevMeta)

    await db.renderJob.update({
      where: { id: jobId },
      data: {
        metadata: {
          ...prevMeta,
          progressEvents,
          segments: result.segments,
          modelBreakdown: result.modelBreakdown,
          qualityScores: result.qualityScores,
          patientZero: result.patientZero,
          actualCredits,
          escrowSettlement: settlement,
        } as unknown as Prisma.InputJsonValue,
      },
    })

    const { learn } = await import('@/lib/cognition')
    learn({
      userId,
      jobId,
      result: {
        segments: result.segments ?? [],
        qualityScores: Object.fromEntries(Object.entries(result.qualityScores ?? {})),
      },
      brief,
    }).catch((e) => console.warn('[learn]', e instanceof Error ? e.message : String(e)))
  } catch (err) {
    const { CanaryFailure } = await import('@/lib/orchestration/chainGeneration')
    const msg = describeProviderError(err)
    const isCanary = err instanceof CanaryFailure
    await appendJobProgressEvent(
      jobId,
      { phase: isCanary ? 'canary_failed' : 'failed', status: 'failed', detail: msg },
      {
        status: 'FAILED',
        errorMessage: msg,
        statusMessage: msg.startsWith('Stalled at') ? msg : isCanary ? 'Pipeline validation failed' : 'Generation failed',
      },
    ).catch((progressErr) => {
      console.error('ERROR-CAPTURE-FAILED', 'orchestrate progress', progressErr instanceof Error ? progressErr.message : progressErr)
    })
    const { captureGenerationError } = await import('@/lib/diagnostics/capture')
    await captureGenerationError({
      err,
      rawError: msg,
      userId,
      jobId,
      stage: 'submit',
      endpoint: 'orchestrate',
      model: 'orchestrate',
    })
    throw err
  }
}

export async function processOrchestrateJobWithRefund(input: ProcessOrchestrateInput): Promise<void> {
  try {
    await processOrchestrateJob(input)
  } catch (err) {
    const { getHold, settleHold } = await import('@/lib/credits/escrow')
    const hold = await getHold(input.jobId)
    if (hold?.status === 'ACTIVE') {
      await settleHold(input.jobId)
    }
    throw err
  }
}

export interface ProcessRenderSimpleInput {
  jobId: string
  userId: string
  prompt: string
  duration: number
  engine: string
}

export async function processRenderSimpleJob(input: ProcessRenderSimpleInput): Promise<void> {
  const { jobId, prompt, duration, engine } = input

  await appendJobProgressEvent(
    jobId,
    { phase: 'generating', status: 'running', detail: 'Generating video…', pct: 20 },
    { status: 'PROCESSING', progressPct: 20, phase: 'generating', statusMessage: 'Generating video…' },
  )

  try {
    const { submitEngineVideo } = await import('@/lib/jobs/submitEngineVideo')
    const result = await submitEngineVideo({ model: engine, prompt, duration })
    await appendJobProgressEvent(
      jobId,
      { phase: 'complete', status: 'completed', detail: 'Complete', pct: 100 },
      {
        status: 'COMPLETE',
        progressPct: 100,
        phase: 'complete',
        etaSeconds: 0,
        statusMessage: 'Complete',
        outputUrl: result.videoUrl ?? result.imageUrl,
        completedAt: new Date(),
      },
    )
  } catch (err) {
    const msg = describeProviderError(err)
    await appendJobProgressEvent(
      jobId,
      { phase: 'failed', status: 'failed', detail: msg },
      { status: 'FAILED', errorMessage: msg, statusMessage: 'Generation failed' },
    ).catch((err) => {
      // The generation error is rethrown below. This write is the status row.
      logCaught('failed_status', err, { jobId, stage: 'failed' })
    })
    throw err
  }
}
