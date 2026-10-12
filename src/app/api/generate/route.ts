import { logCaught } from '@/lib/diagnostics/caught'
import { requireUser } from '@/lib/auth/requireUser'
// src/app/api/generate/route.ts
// Fast path — never waits for rendering. Returns jobId in <2s.

export const maxDuration = 300

import { fastEstimateCost, estimateRenderSeconds } from '@/lib/orchestration/fastEstimate'
import { calculateSimpleCost }                     from '@/lib/credits'
import { checkAccess, deductUserCredits }          from '@/lib/access/guard'
import { MODEL_COUNCIL_DISPLAY, MODEL_COSTS, TIER_ENGINE_MAP } from '@/lib/routing/engineRegistry'
import { parseQualityTier } from '@/lib/orchestration/tierPolicy'
import { parseCreativeLicense } from '@/lib/cognition/license'
import { defaultWizard, parseWizard, type DirectorRunMode } from '@/lib/orchestration/wizardState'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import { db }                                      from '@/lib/db'

export async function POST(req: Request) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    prompt?:           string
    script?:           string
    duration?:         number
    selectedModels?:   string[]
    mode?:             string
    generationMode?:   string
    source?:           string
    tier?:             string
    qualityTier?:      string
    creativeLicense?:  string
    projectId?:        string
    characterId?:      string
    musicUrl?:         string
    ambienceUrl?:      string
    directorMode?:     string
    wizard?:           unknown
    templateShots?:    unknown
    musicVideo?:       { audioUrl?: string; rights?: boolean }
  }

  const rawPrompt = (body.prompt ?? body.script)?.trim()
  let duration       = body.duration ?? 10
  const requestedModels = body.selectedModels
  const mode           = body.mode ?? 'simple'
  const generationMode = (body.generationMode === 'production' ? 'production' : 'draft') as 'draft' | 'production'
  const source         = body.source ?? (mode === 'director' ? 'director' : 'simple')
  const tier           = body.tier ?? 'standard'
  const qualityTier    = parseQualityTier(body.qualityTier)
  const creativeLicense = parseCreativeLicense(body.creativeLicense)
  const directorMode: DirectorRunMode = body.directorMode === 'auto' || body.directorMode === 'hybrid' || body.directorMode === 'wizard'
    ? body.directorMode
    : 'wizard'
  const wizard = mode === 'director'
    ? (parseWizard(body.wizard) ?? defaultWizard(directorMode))
    : undefined
  const { projectId, characterId, musicUrl, ambienceUrl } = body
  if (body.musicVideo?.audioUrl && body.musicVideo.rights !== true) {
    return Response.json({ error: 'Music rights are required before a video can be made from this track' }, { status: 400 })
  }

  if (!rawPrompt || rawPrompt.length < 10) {
    return Response.json(
      { error: 'Script is required — send current editor content as "prompt"' },
      { status: 400 },
    )
  }

  const validModelIds = new Set([
    ...MODEL_COUNCIL_DISPLAY.map((m) => m.id),
    ...Object.keys(MODEL_COSTS),
  ])
  let selectedModels = (requestedModels ?? []).filter((id) => validModelIds.has(id))

  if (mode === 'director' && requestedModels?.length && selectedModels.length === 0) {
    return Response.json({
      error: 'No valid models in council selection — refresh and re-select models',
    }, { status: 400 })
  }

  if (mode === 'director' && selectedModels.length === 0) {
    return Response.json({
      error: 'Select at least one model in the council before generating',
    }, { status: 400 })
  }

  const { enrichGeneratePayload } = await import('@/lib/character/jobIdentity')
  const enriched = await enrichGeneratePayload(userId, projectId, {
    prompt: rawPrompt,
    characterId,
  })
  const prompt = typeof enriched.prompt === 'string' ? enriched.prompt : rawPrompt
  const fccCognitionContext = enriched.fccCognitionContext as
    | { name: string; behavioralPrompt: string; wardrobeSummary: string; appearanceSummary: string }
    | undefined

  let creditCost = mode === 'director'
    ? fastEstimateCost(selectedModels, duration)
    : calculateSimpleCost(tier, duration)

  if (creditCost === 0) {
    creditCost = Math.max(5, Math.ceil((duration / 5) * 6))
  }

  const access = await checkAccess(
    userId,
    creditCost,
    mode === 'director' ? 'directorMode' : undefined,
  )
  if (!access.allowed) {
    const status = access.code ?? 402
    return Response.json({
      error:           access.reason ?? 'Access denied',
      code:            status === 403 ? 'TIER_RESTRICTED' : undefined,
      upgradeRequired: status === 403,
    }, { status })
  }

  const etaSeconds = estimateRenderSeconds(selectedModels, duration)
  const engine     = TIER_ENGINE_MAP[tier] ?? refuseSilentModelSwap(tier, 'ltx-2.3-fast')

  const job = await db.renderJob.create({
    data: {
      userId,
      projectId: projectId ?? undefined,
      prompt,
      duration,
      mode,
      status:        'QUEUED',
      progressPct:   0,
      statusMessage: mode === 'director' ? 'Queued — starting director orchestration…' : 'Queued — waiting for an available worker',
      etaSeconds,
      creditsCharged: creditCost,
      metadata: {
        selectedModels,
        generationMode,
        qualityTier,
        creativeLicense,
        source,
        tier,
        engine,
        estimatedCredits: creditCost,
        projectId,
        characterId,
        fccCognitionContext,
        characterRefs: Array.isArray(enriched.characterRefs) ? enriched.characterRefs : undefined,
        loraId: typeof enriched.loraId === 'string' ? enriched.loraId : undefined,
        musicUrl: typeof musicUrl === 'string' ? musicUrl : undefined,
        ambienceUrl: typeof ambienceUrl === 'string' ? ambienceUrl : undefined,
        wizard: wizard ? JSON.parse(JSON.stringify(wizard)) : undefined,
        templateShots: Array.isArray(body.templateShots) ? JSON.parse(JSON.stringify(body.templateShots)) : undefined,
      },
    },
  })

  if (projectId && (musicUrl || ambienceUrl)) {
    await db.project.update({
      where: { id: projectId },
      data: {
        ...(typeof musicUrl === 'string' ? { musicUrl } : {}),
        ...(typeof ambienceUrl === 'string' ? { ambienceUrl } : {}),
      },
    }).catch((err) => logCaught('app/api/generate/route', err))
  }

  const queuePayload = {
    jobId: job.id,
    userId,
    prompt,
    duration,
    selectedModels,
    generationMode,
    qualityTier,
    creativeLicense,
    source,
    tier,
    engine,
    creditCost,
    useCognition: mode === 'director',
    fccCognitionContext,
    projectId,
  }

  try {
    const { renderQueue } = await import('@/lib/queue')
    await renderQueue.add(
      mode === 'director' ? 'orchestrate' : 'render-simple',
      queuePayload,
      { attempts: 1, removeOnComplete: 200, removeOnFail: 500 },
    )
  } catch (err) {
    console.warn('[generate] queue failed', err instanceof Error ? err.message : err)
    await db.renderJob.update({
      where: { id: job.id },
      data:  { status: 'FAILED', errorMessage: 'Queue unavailable — check REDIS_URL', statusMessage: 'Queue unavailable' },
    })
    return Response.json({ error: 'Render queue unavailable. Try again shortly.' }, { status: 503 })
  }

  if (mode !== 'director') {
    await deductUserCredits(userId, creditCost, `${mode}: ${prompt.slice(0, 40)}`, 'fal')
  }

  return Response.json({
    jobId:            job.id,
    queued:           true,
    estimatedCredits: creditCost,
    etaSeconds,
    selectedModels:   mode === 'director' ? selectedModels : undefined,
  })
}
