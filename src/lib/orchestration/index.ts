import { falEndpoint } from '@cinema/core/endpoints'
import { logCaught } from '@/lib/diagnostics/caught'
// src/lib/orchestration/index.ts
// Main entry point for the 6-phase orchestration pipeline

import { db } from '@/lib/db'
import { openHold } from '@/lib/credits/escrow'
import { generatePatientZeroAssets } from './patientZero'
import { breakdownToShots }                                     from './scriptBreakdown'
import { cognitionEnabled }                                      from '@/lib/cognition/flag'
import { pacingNote, runCognitiveDirector }                      from '@/lib/cognition/director'
import { parseCreativeLicense, type CreativeLicense }            from '@/lib/cognition/license'
import { resolveListedDurations } from '@/lib/credits'
import { buildDAG, getTotalPlanCost }         from './dagRouter'
import { generateStoryboard }                                   from './storyboard'
import { generateAllScenes }                                    from './chainGeneration'
import { extractDialogueForShots }                              from './dialogueExtractor'
import { beginLlmRun, finishLlmRun } from '@/lib/llm/runLog'
import { syncScenesFromShots }                                  from '@/lib/studio/sceneSync'
import { buildSceneStyleAnchors, injectStyleAnchor }            from './sceneStyleAnchors'
import { stitchSegments }                                       from './stitching'
import { preflight, PreflightError }                            from './preflight'
import { isGenerationPausedError }                              from '@/lib/generation/pause'
import { resolveFalVideoEndpoint }                              from './falEndpoints'
import { TIER_BUDGET_CAPS }                                     from './budget'
import type { GenerationMode } from './costGuard'
import type { OrchestrationResult, PatientZeroAssets, StructuredShot } from './types'
import type { GateMode, QualityConstraint } from '@cinema/core'
import { gateOpen, holdFor, batchLimit, type WizardRunConfig } from './wizardState'
import {
  applyPlaybookToShots,
  ORCHESTRATE_STAGES,
  orchestrate as coreOrchestrate,
  type OrchestrateHost,
  type OrchestrateProject,
  type PremiseLock,
} from '@cinema/core'

export interface OrchestrationInput {
  prompt:          string
  totalDuration:   number
  selectedModels:  string[]
  userId:          string
  jobId?:          string
  projectId?:      string
  musicUrl?:       string
  ambienceUrl?:    string
  generationMode?: GenerationMode
  qualityTier?: QualityConstraint
  creativeLicense?: CreativeLicense
  resolution?:     string
  heartbeat?:      () => void | Promise<void>
  onProgress?:     (phase: string, detail: string, progress: number) => void
  skipInterpret?:  boolean
  directedShots?:  StructuredShot[]
  gateMode?:       GateMode
  wizard?:         WizardRunConfig
  /** Interpret and delegate only. Does not render shots. */
  planOnly?:       boolean
  /** Stage 0. Same planner, no new entry. Returns a breakdown and does not render. */
  ingest?:         boolean
  /** Stage 2. Compiles the stored breakdown through this same function. */
  direct?:         boolean
  breakdown?:      import('@cinema/core').ProductionBreakdown
  entityResolutions?: import('@cinema/core').ResolvableEntity[]
}

export { PreflightError } from './preflight'

export async function orchestrate(input: OrchestrationInput): Promise<OrchestrationResult> {
  if (input.ingest) {
    const { ingestBreakdown } = await import('./ingestPlan')
    const productionBreakdown = await ingestBreakdown(input)
    const duration = productionBreakdown.scenes.reduce(
      (sum, scene) => sum + scene.shots.reduce((inner, shot) => inner + shot.duration, 0),
      0,
    )
    return {
      segments: [],
      finalVideoUrl: '',
      totalCredits: 0,
      totalDuration: duration || input.totalDuration,
      qualityScores: {},
      modelBreakdown: {},
      patientZero: { characters: [], locations: [] },
      productionBreakdown,
    }
  }
  let compiledPlan: import('@cinema/core').CompiledFilm | undefined
  let filmInput = input
  if (input.direct && input.breakdown) {
    const { compileProductionPlan } = await import('@cinema/core')
    compiledPlan = compileProductionPlan({
      breakdown: input.breakdown,
      entities: input.entityResolutions ?? [],
    })
    filmInput = {
      ...input,
      skipInterpret: true,
      directedShots: compiledPlan.shots.map((shot, index) => ({
        id: shot.id,
        shotIndex: index,
        startSeconds: 0,
        endSeconds: shot.duration,
        duration: shot.duration,
        contentType: 'physical_action' as const,
        visualPrompt: shot.prompt,
        cameraMove: 'slow_push_in',
        motionLevel: 'medium' as const,
        hasDialogue: false,
        hasFaces: shot.mode === 'reference',
        hasAudio: false,
        hasCGI: false,
        charactersPresent: [],
        locationsPresent: [],
        lighting: 'natural_day',
        mood: 'calm',
        bridgeRequired: index > 0,
        continuityGroup: Number(shot.sceneId.replace(/\D/g, '')) || 1,
        isChainStart: shot.continuity === 'cut',
        continuity: shot.continuity,
        storyboardUrl: shot.imageUrl,
        sceneNumber: Number(shot.sceneId.replace(/\D/g, '')) || 1,
      })),
    }
  }
  console.log('[orchestrate] stages', ORCHESTRATE_STAGES.join(' → '))
  beginLlmRun(input.jobId ?? 'orchestrate')
  try {
    const bag: FilmBag = { input: filmInput }
    const host = createFilmHost(bag)
    const { learnedOverlayForGate } = await import('@/lib/diagnostics/overlay')
    const learned = await learnedOverlayForGate(input.userId).catch((err) => {
      console.warn("[caught] src/lib/orchestration/index.ts:69", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (undefined)
    })
    const project = await host.loadProject()
    await coreOrchestrate(input.prompt.trim(), project, host, input.selectedModels, learned)
    if (!bag.result) throw new Error('[orchestrate] core spine returned no film')
    if (compiledPlan) bag.result.compiledPlan = compiledPlan
    return bag.result
  } finally {
    finishLlmRun()
  }
}

export async function orchestrateGeneration(
  input: OrchestrationInput,
  prepared?: FilmPrepared,
): Promise<OrchestrationResult> {

  const { prompt, totalDuration, selectedModels, onProgress, jobId } = input
  const generationMode: GenerationMode = input.generationMode ?? 'draft'
  const progress = (phase: string, detail: string, pct: number) =>
    onProgress?.(phase, detail, pct)

  const script = prompt?.trim() ?? ''
  if (script.length < 10) {
    throw new Error(
      `[orchestrate] Job ${jobId ?? 'inline'} has no script — pass current editor content as prompt`,
    )
  }

  if (!selectedModels?.length) {
    throw new Error('[orchestrate] selectedModels is empty — council selection required')
  }
  console.log(`[orchestrate] DAG model pool (job ${jobId ?? 'inline'}):`, selectedModels)

  const playbook = await (await import('@/lib/playbook')).loadActivePlaybook(input.userId, input.projectId).catch((err) => {
    console.warn("[caught] src/lib/orchestration/index.ts:103", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  const playbookTier = (await import('@cinema/core')).playbookToQualityConstraint(playbook?.generation?.defaultQualityTier)

  const { assertFalAccountUnlocked } = await import('@/lib/fal/accountStatus')
  const modelEndpoints = selectedModels
    .map((m) => resolveFalVideoEndpoint(m, 't2v'))
    .filter((ep): ep is string => Boolean(ep))
  // Probe only council-selected video endpoints + storyboard image model (not full tier defaults).
  const probeSet = [...new Set([falEndpoint('gemini-25-flash-image'), ...modelEndpoints])]
  await assertFalAccountUnlocked(probeSet)
  progress('preflight', 'fal.ai account ready', 3)

  // Premise, patient zero, and breakdown run in the core host. This tail renders.
  let premise: PremiseLock
  let patientZero: PatientZeroAssets
  let shotsWithKeyframes: StructuredShot[]
  if (prepared) {
    premise = prepared.premise
    patientZero = prepared.patientZero
    shotsWithKeyframes = prepared.shots
  } else {
    const { extractPremiseLock, savePremiseLock, loadPremiseLock } = await import('./premiseLock')
    const stored = input.projectId ? await loadPremiseLock(input.projectId) : null
    const locked = stored ?? await extractPremiseLock(script)
    if (input.projectId && !stored) await savePremiseLock(input.projectId, locked)
    const built = await collectPrepared(input, locked)
    premise = built.premise
    patientZero = built.patientZero
    shotsWithKeyframes = built.shots
  }

  const listedDurations = resolveListedDurations(shotsWithKeyframes, totalDuration)
  shotsWithKeyframes.forEach((shot, index) => {
    shot.duration = listedDurations[index]!
  })

  const { groupIntoScenes } = await import('./chainBuilder')
  const sceneGroups = groupIntoScenes(shotsWithKeyframes)
  progress('routing', `Planning ${sceneGroups.length} sequential scenes...`, 36)

  // ── Phase 3: DAG routing (with keyframed shots) ──────────────────────────
  let dag
  try {
    dag = await buildDAG(shotsWithKeyframes, selectedModels, input.userId, {
      qualityTier: input.qualityTier ?? playbookTier ?? (generationMode === 'draft' ? 'draft' : 'standard'),
      projectId: input.projectId,
      query: script,
      playbook,
      predelegated: prepared?.delegations,
    })
  } catch (err) {
    console.warn(
      '[director] plan_cap',
      err instanceof Error ? err.message : String(err),
    )
    dag = await buildDAG(shotsWithKeyframes, selectedModels, input.userId, {
      qualityTier: input.qualityTier ?? playbookTier ?? (generationMode === 'draft' ? 'draft' : 'standard'),
      projectId: input.projectId,
      query: script,
      playbook,
      predelegated: prepared?.delegations,
    })
  }

  if (input.projectId) {
    await syncScenesFromShots(input.projectId, shotsWithKeyframes, {
      dag,
      selectedModels,
    }).catch((err) => logCaught('lib/orchestration/index', err))
  }

  const totalCredits = getTotalPlanCost(dag)

  const modelBreakdown: OrchestrationResult['modelBreakdown'] = {}
  for (const node of dag) {
    if (!modelBreakdown[node.assignedModel]) {
      modelBreakdown[node.assignedModel] = { duration: 0, cost: 0, shots: [] }
    }
    modelBreakdown[node.assignedModel].duration += node.shot.duration
    modelBreakdown[node.assignedModel].cost     += node.estimatedCost
    modelBreakdown[node.assignedModel].shots.push(node.shot.shotIndex)
  }

  let styleAnchors = new Map<string, string>()
  try {
    styleAnchors = await buildSceneStyleAnchors(shotsWithKeyframes, patientZero, {
      maxAnchors: sceneGroups.length,
    })
  } catch (err) {
    console.warn(
      '[director] style anchors skipped:',
      err instanceof Error ? err.message : String(err),
    )
  }
  for (const shot of shotsWithKeyframes) {
    const anchor = injectStyleAnchor(shot, styleAnchors)
    if (anchor && !shot.storyboardUrl) shot.storyboardUrl = anchor
  }

  // ── Layer 0: Preflight gate (before paid video generation) ───────────────
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      creditBalance: true,
      role: true,
      subscriptions: { orderBy: { updatedAt: 'desc' }, take: 1, select: { plan: true, status: true } },
    },
  })
  const userCredits = user?.role === 'ADMIN' ? 9_999_999 : (user?.creditBalance ?? 0)
  const pf = await preflight({
    dag,
    shots: shotsWithKeyframes,
    patientZero,
    userCredits,
  })
  if (!pf.pass) {
    progress('preflight_failed', pf.errors.map((e) => e.detail).join('\n'), 38)
    throw new PreflightError(pf.errors)
  }
  progress('preflight_passed', `Estimated cost: ${pf.estimate.credits} credits`, 39)

  if (input.wizard && gateOpen(input.wizard, 'shots')) {
    input.wizard.spendCredits = pf.estimate.credits
    holdFor(input.wizard, 'shots')
  }

  const wizard = input.wizard
  const cursor = wizard?.shotCursor ?? 0
  const limit = wizard && wizard.mode !== 'auto' ? batchLimit(wizard, shotsWithKeyframes.length - cursor) : shotsWithKeyframes.length
  const batchShots = shotsWithKeyframes.slice(cursor, cursor + limit)
  const batchDag = dag.filter((node) => batchShots.some((shot) => shot.shotIndex === node.shot.shotIndex))
  const renderShots = batchShots.length ? batchShots : shotsWithKeyframes
  const renderDag = batchDag.length ? batchDag : dag

  // ── Layer 1: Escrow hold (after preflight, before generation) ────────────
  if (input.jobId) {
    const tier = user?.role === 'ADMIN'
      ? 'admin'
      : (user?.subscriptions[0]?.plan?.toLowerCase() ?? 'free')
    const budgetCap = TIER_BUDGET_CAPS[tier] ?? TIER_BUDGET_CAPS.free
    const held = await openHold(input.userId, input.jobId, pf.estimate.credits, budgetCap)
    await db.renderJob.update({
      where: { id: input.jobId },
      data: { creditsCharged: held },
    }).catch((err) => logCaught('lib/orchestration/index', err))
  }

  const dialogueMapPromise = extractDialogueForShots(shotsWithKeyframes, input.projectId)

  // ── Phase 3: Sequential scene generation (clips chain within each scene) ─
  progress('generating', `Rendering ${sceneGroups.length} scenes. Chains wait shot by shot; cuts run alongside.`, 40)
  let segments = await generateAllScenes(
    renderShots,
    renderDag,
    patientZero,
    ({ shotIndex, totalShots, status, subMessage }) => {
      const pct = 40 + Math.round((shotIndex / Math.max(totalShots, 1)) * 40)
      const detail = subMessage ?? `Shot ${shotIndex + 1}/${totalShots}: ${status}`
      progress('generating', detail, pct)
    },
    {
      jobId: input.jobId,
      projectId: input.projectId,
      userId: input.userId,
      onPoll: input.heartbeat,
      generationMode,
      resolution: input.resolution,
      selectedModels,
      gateMode: input.gateMode ?? (input.projectId
        ? await db.project.findUnique({ where: { id: input.projectId }, select: { gateMode: true } }).then((project) => {
            const mode = project?.gateMode
            return mode === 'manual' || mode === 'both' ? mode : 'auto'
          })
        : 'auto'),
      onPhase: (phase, detail) => progress(phase, detail, 42),
    },
  )

  const withVideo = segments.filter((segment) => Boolean(segment.videoUrl?.trim()))
  if (withVideo.length !== segments.length) {
    console.warn('[director] finish_skip_gaps', {
      kept: withVideo.length,
      skipped: segments.length - withVideo.length,
    })
  }
  segments = withVideo
  if (wizard && wizard.mode !== 'auto' && wizard.batchDepth !== 'all') {
    const nextCursor = cursor + renderShots.length
    if (nextCursor < shotsWithKeyframes.length) {
      wizard.shotCursor = nextCursor
      wizard.cleared = wizard.cleared.filter((stage) => stage !== 'shots')
      holdFor(wizard, 'shots')
    }
  }
  if (segments.length === 0) {
    throw new Error('No completed shots to assemble')
  }

  // Dialogue text stays on the shot. Voice and lip-sync wait for placement.
  await dialogueMapPromise

  console.log('[quality] scoring off', JSON.stringify({
    shots: segments.length,
    reason: 'auto path lands the video; score and repair is opt-in',
  }))
  progress('library', `${segments.length} shot${segments.length === 1 ? '' : 's'} in the library`, 90)

  progress('stitching', 'Assembling final film...', 92)
  let finalVideoUrl = segments[0]?.videoUrl ?? ''
  if (segments.length > 1) {
    try {
      finalVideoUrl = await stitchSegments(segments, input.userId)
    } catch (err) {
      console.warn('[assembly] stitch skipped', err instanceof Error ? err.message : err)
      finalVideoUrl = segments[0]?.videoUrl ?? ''
    }
  }

  // ── Phase 6: Audio assembly (data-driven AudioTrack mix) ─────────────────
  if (input.jobId && input.projectId) {
    const trackCount = await db.audioTrack.count({
      where: { projectId: input.projectId, status: 'READY', muted: false },
    })
    if (trackCount > 0) {
      progress('audio_mix', 'Mixing soundtrack...', 96)
      try {
        const { computeShotOffsets } = await import('@/lib/audio/shotOffsets')
        const { listShotPlan } = await import('@/lib/studio/shotPlan')
        const { shots: planShots } = await listShotPlan(input.projectId)
        const clipIdByIndex = new Map(planShots.map((s) => [s.shotNumber - 1, s.id]))

        const placed = segments.map((seg) => ({
          shotId: seg.shotId ?? clipIdByIndex.get(seg.shotIndex) ?? `shot-${seg.shotIndex}`,
          shotIndex: seg.shotIndex,
          videoUrl: seg.videoUrl,
        }))
        const shotOffsets = await computeShotOffsets(placed)
        const { assembleAudioFromUrl } = await import('@/lib/audio/audioAssembly')
        finalVideoUrl = await assembleAudioFromUrl({
          projectId: input.projectId,
          videoUrl: finalVideoUrl,
          shotOffsets,
          jobId: input.jobId,
        })
      } catch (err) {
        console.warn('[audio] mix skipped', err instanceof Error ? err.message : err)
      }
    }
  }

  if (input.jobId) {
    const { clearDecompositionCheckpoint } = await import('./checkpoints')
    await clearDecompositionCheckpoint(input.jobId)
  }
  const qualityScores: Record<number, number> = {}
  progress('complete', 'Film complete', 100)
  if (input.userId && input.projectId) {
    const { scheduleLibraryCopyRetry } = await import('@/lib/studio/batchClipSync')
    await scheduleLibraryCopyRetry(input.userId, input.projectId)
  }

  return {
    segments,
    finalVideoUrl,
    totalCredits,
    totalDuration,
    qualityScores,
    modelBreakdown,
    patientZero,
  }
}

interface FilmPrepared {
  premise: PremiseLock
  patientZero: PatientZeroAssets
  shots: StructuredShot[]
  scoreCue?: { mood?: string; genre?: string; tempo?: string }
  delegations: Map<string, { model: string; reason?: string; mode?: string; purpose?: string }>
}

interface FilmBag {
  input: OrchestrationInput
  premise?: PremiseLock
  prepared?: FilmPrepared
  result?: OrchestrationResult
}

async function collectPrepared(input: OrchestrationInput, premise: PremiseLock): Promise<FilmPrepared> {
  const script = input.prompt.trim()
  const progress = (phase: string, detail: string, pct: number) => input.onProgress?.(phase, detail, pct)
  const playbook = await (await import('@/lib/playbook')).loadActivePlaybook(input.userId, input.projectId).catch((err) => {
    console.warn("[caught] src/lib/orchestration/index.ts:400", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  progress('patient_zero', 'Extracting characters and locations...', 5)
  const characters = premise.characters.map((el) => ({ name: el.name, description: el.description }))
  const locations = premise.settings.map((el) => ({ name: el.name, description: el.description }))
  const ingestCtx = input.projectId
    ? await (await import('@/lib/ingest/context')).loadProjectGenerationContext({
      userId: input.userId,
      projectId: input.projectId,
      query: script,
    }).catch((err) => {
      console.warn("[caught] src/lib/orchestration/index.ts:409", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (null)
    })
    : null
  const savedRefs = input.jobId ? await (await import('./checkpoints')).loadWizardRefs(input.jobId) : null
  let patientZero: PatientZeroAssets = {
    characters: [
      ...(ingestCtx?.characters ?? []),
      ...(savedRefs?.characters ?? []).filter((row) => !(ingestCtx?.characters ?? []).some((have) => have.name.toLowerCase() === row.name.toLowerCase()))
        .map((row) => ({ ...row, embedUrl: row.imageUrl })),
    ],
    locations: [
      ...(ingestCtx?.locations ?? []),
      ...(savedRefs?.locations ?? []).filter((row) => !(ingestCtx?.locations ?? []).some((have) => have.name.toLowerCase() === row.name.toLowerCase())),
    ],
  }
  const missingChars = characters.filter((c) =>
    !patientZero.characters.some((v) => v.name.toLowerCase() === c.name.toLowerCase()),
  )
  const missingLocs = locations.filter((l) =>
    !patientZero.locations.some((v) => v.name.toLowerCase() === l.name.toLowerCase()),
  )
  const scriptGate = gateOpen(input.wizard, 'script')
  if (!scriptGate && (missingChars.length > 0 || missingLocs.length > 0)) {
    progress('patient_zero', 'Generating reference images...', 10)
    const generated = await generatePatientZeroAssets({ characters: missingChars, locations: missingLocs })
    patientZero = {
      characters: [...patientZero.characters, ...generated.characters],
      locations: [...patientZero.locations, ...generated.locations],
    }
  }
  progress('breakdown', 'Planning shot structure...', 20)
  const license = parseCreativeLicense(input.creativeLicense)
  let treatment: string | undefined
  let pacing: string | undefined
  let scoreCue: FilmPrepared['scoreCue']
  if (cognitionEnabled() && input.wizard?.cognition !== false) {
    try {
      const brief = await runCognitiveDirector({
        userId: input.userId,
        prompt: script,
        durationSec: input.totalDuration,
        license,
        premise,
        projectId: input.projectId,
      })
      if (brief.cognitionUsed) {
        treatment = brief.treatment
        pacing = pacingNote(brief.emotionalArc)
        scoreCue = {
          mood: brief.intent.targetEmotion,
          genre: brief.direction.visualStyle,
          tempo: brief.emotionalArc.rhythmNote,
        }
      }
    } catch (err) {
      console.warn('[cognition] director degraded to raw prompt:', err instanceof Error ? err.message : String(err))
    }
  }
  if (input.jobId) {
    const { loadDecompositionCheckpoint, loadKeyframeCheckpoint } = await import('./checkpoints')
    const saved = await loadDecompositionCheckpoint(input.jobId)
    if (saved?.length) {
      const resumed = saved as StructuredShot[]
      const urls = await Promise.all(resumed.map((shot) => loadKeyframeCheckpoint(input.jobId!, shot.shotIndex)))
      const withUrls = resumed.map((shot, index) => ({ ...shot, storyboardUrl: urls[index] ?? shot.storyboardUrl }))
      if (urls.every((url) => Boolean(url))) {
        progress('routing', 'Resuming after keyframes...', 32)
        return {
          premise,
          patientZero,
          shots: withUrls,
          scoreCue,
          delegations: new Map(),
        }
      }
      if (input.wizard && !gateOpen(input.wizard, 'script')) {
        if (gateOpen(input.wizard, 'references')) {
          if (input.jobId) await (await import('./checkpoints')).saveWizardRefs(input.jobId, patientZero)
          holdFor(input.wizard, 'references')
        }
        if (gateOpen(input.wizard, 'keyframes')) {
          progress('storyboard', 'Generating storyboard keyframes...', 25)
          let framed: StructuredShot[] = withUrls
          try {
            framed = await generateStoryboard(withUrls, patientZero, {
              jobId: input.jobId,
              onPoll: input.heartbeat,
              onProgress: (done, total, detail) =>
                progress('storyboard', detail ?? `Keyframe ${done}/${total}`, 25 + Math.round((done / Math.max(total, 1)) * 10)),
            })
          } catch (err) {
            console.warn('[storyboard] keyframes skipped; shots continue as text-to-video:', err instanceof Error ? err.message : err)
          }
          holdFor(input.wizard, 'keyframes')
        }
        return { premise, patientZero, shots: withUrls, scoreCue, delegations: new Map() }
      }
    }
  }
  const seeded = input.directedShots?.length
    ? input.directedShots.map((shot, index) => ({ ...shot, id: shot.id ?? `shot-${index}`, shotIndex: shot.shotIndex ?? index }))
    : null
  const planned = seeded ?? await breakdownToShots(script, input.totalDuration, patientZero, input.selectedModels, pacing, {
    treatment: [treatment, playbook?.style?.grade ? `${playbook.style.grade} grade` : ''].filter(Boolean).join('. ') || treatment,
    license,
    premise,
    qualityTier: input.qualityTier,
  })
  const shots = applyPlaybookToShots(planned, playbook)
  shots.forEach((shot, index) => {
    shot.id = shot.id ?? `shot-${index}`
  })
  if (input.jobId) {
    const { saveDecompositionCheckpoint } = await import('./checkpoints')
    await saveDecompositionCheckpoint(input.jobId, shots)
  }
  if (input.wizard && gateOpen(input.wizard, 'script')) holdFor(input.wizard, 'script')
  if (input.wizard && gateOpen(input.wizard, 'references')) {
    if (input.jobId) await (await import('./checkpoints')).saveWizardRefs(input.jobId, patientZero)
    holdFor(input.wizard, 'references')
  }
  progress('storyboard', 'Generating storyboard keyframes...', 25)
  let withFrames = shots
  try {
    withFrames = await generateStoryboard(shots, patientZero, {
      jobId: input.jobId,
      onPoll: input.heartbeat,
      onProgress: (done, total, detail) =>
        progress('storyboard', detail ?? `Keyframe ${done}/${total}`, 25 + Math.round((done / Math.max(total, 1)) * 10)),
    })
  } catch (err) {
    console.warn('[storyboard] keyframes skipped; shots continue as text-to-video:', err instanceof Error ? err.message : String(err))
  }
  if (input.wizard && gateOpen(input.wizard, 'keyframes')) holdFor(input.wizard, 'keyframes')
  return { premise, patientZero, shots: withFrames, scoreCue, delegations: new Map() }
}

async function planOnlyShots(
  input: OrchestrationInput,
  premise: PremiseLock,
  script: string,
): Promise<StructuredShot[]> {
  const { breakdownToShots } = await import('./scriptBreakdown')
  try {
    return await breakdownToShots(
      script,
      input.totalDuration,
      { characters: [], locations: [] },
      input.selectedModels,
      undefined,
      { premise },
    )
  } catch (err) {
    if (!isGenerationPausedError(err)) throw err
    return [{
      shotIndex: 0,
      startSeconds: 0,
      endSeconds: input.totalDuration,
      duration: input.totalDuration,
      contentType: 'physical_action',
      visualPrompt: script.trim().slice(0, 1500),
      cameraMove: 'slow_push_in',
      motionLevel: 'medium',
      hasDialogue: false,
      hasFaces: false,
      hasAudio: false,
      hasCGI: false,
      charactersPresent: [],
      locationsPresent: [],
      lighting: 'natural_day',
      mood: 'calm',
      bridgeRequired: false,
      continuityGroup: 0,
      isChainStart: true,
      premiseElementIds: ['story'],
    }]
  }
}

function createFilmHost(bag: FilmBag): OrchestrateHost & { loadProject: () => Promise<OrchestrateProject> } {
  return {
    async loadProject() {
      const playbook = await (await import('@/lib/playbook')).loadActivePlaybook(bag.input.userId, bag.input.projectId).catch((err) => {
        console.warn("[caught] src/lib/orchestration/index.ts:530", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (null)
      })
      const { playbookToQualityConstraint } = await import('@cinema/core')
      const { tasteProfileFor } = await import('@/lib/cognition/shotRatings')
      const taste = await tasteProfileFor(bag.input.userId).catch((err) => {
        console.warn("[caught] src/lib/orchestration/index.ts:533", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (undefined)
      })
      const directed = bag.input.directedShots?.map((shot, index) => ({ ...shot, id: shot.id ?? `shot-${index}` }))
      return {
        qualityTier: bag.input.qualityTier
          ?? playbookToQualityConstraint(playbook?.generation?.defaultQualityTier)
          ?? (bag.input.generationMode === 'draft' ? 'draft' : 'standard'),
        playbook,
        taste,
        gateMode: bag.input.gateMode ?? 'auto',
        skipInterpret: bag.input.skipInterpret,
        directedShots: directed,
        premise: bag.premise,
      }
    },
    async premiseLock(script) {
      const { extractPremiseLock, savePremiseLock, loadPremiseLock } = await import('./premiseLock')
      bag.input.onProgress?.('breakdown', 'Locking the premise...', 4)
      const stored = bag.input.projectId ? await loadPremiseLock(bag.input.projectId) : null
      try {
        const premise = stored ?? await extractPremiseLock(script)
        if (bag.input.projectId && !stored) await savePremiseLock(bag.input.projectId, premise)
        bag.premise = premise
        return premise
      } catch (err) {
        if (!bag.input.planOnly || !isGenerationPausedError(err)) throw err
        const premise = { characters: [], settings: [], story: script.trim(), genre: '', tone: '' }
        bag.premise = premise
        return premise
      }
    },
    async interpretToShots(script, premise) {
      if (bag.input.planOnly) {
        const shots = await planOnlyShots(bag.input, premise, script)
        bag.prepared = {
          premise,
          patientZero: { characters: [], locations: [] },
          shots,
          delegations: new Map(),
        }
        return { shots }
      }
      const prepared = await collectPrepared(bag.input, premise)
      bag.prepared = prepared
      return { shots: prepared.shots }
    },
    async afterDelegate(delegated) {
      const delegations = new Map<string, { model: string; reason?: string; mode?: string; purpose?: string }>()
      delegated.forEach((shot, index) => {
        const key = shot.id ?? `shot-${index}`
        delegations.set(key, {
          model: shot.delegation.model,
          reason: shot.delegation.reason,
          mode: shot.delegation.mode,
          purpose: shot.delegation.purpose,
        })
        if (bag.prepared) {
          const row = bag.prepared.shots[index]
          if (row) {
            row.id = key
            row.suggestedModel = shot.delegation.model
            row.delegationReason = shot.delegation.reason
            row.delegatedMode = shot.delegation.mode
          }
        }
      })
      if (bag.input.planOnly) {
        bag.result = {
          segments: delegated.map((shot, index) => ({
            shotIndex: index,
            shotId: shot.id ?? `shot-${index}`,
            videoUrl: '',
            duration: shot.duration ?? bag.input.totalDuration,
            model: shot.delegation.model,
            contentType: (shot.contentType ?? 'physical_action') as OrchestrationResult['segments'][number]['contentType'],
            tailFrameUrl: '',
            qualityScore: 0,
            retryCount: 0,
          })),
          finalVideoUrl: '',
          totalCredits: 0,
          totalDuration: bag.input.totalDuration,
          qualityScores: {},
          modelBreakdown: {},
          patientZero: bag.prepared?.patientZero ?? { characters: [], locations: [] },
          plannedShots: bag.prepared?.shots,
        }
        return
      }
      if (bag.input.skipInterpret) {
        const { orchestrateDirectedShots } = await import('./directedRun')
        bag.result = await orchestrateDirectedShots({
          ...bag.input,
          directedShots: (bag.input.directedShots ?? delegated) as StructuredShot[],
          predelegated: delegations,
        })
        return
      }
      if (!bag.prepared) throw new Error('[orchestrate] interpret did not prepare shots')
      bag.prepared.delegations = delegations
      bag.result = await orchestrateGeneration(bag.input, bag.prepared)
    },
    async generateShot(shot) {
      if (bag.input.planOnly) return { ok: true }
      const seg = bag.result?.segments.find((row) => row.shotId === shot.id || row.shotIndex === shot.shotIndex)
      const ok = Boolean(seg?.videoUrl?.trim())
      return { ok, failed: !ok }
    },
    async qualityGate() {
      return 'pass' as const
    },
    async recordOutcome(shot, delegated, signal) {
      const { recordShotOutcome } = await import('@/lib/cognition/learnOutcomes')
      await recordShotOutcome({
        userId: bag.input.userId,
        shotId: shot.id,
        jobId: bag.input.jobId,
        signal,
        model: delegated.model,
        purpose: delegated.purpose,
        mode: delegated.mode,
        source: 'behaviour',
      }).catch((err) => logCaught('lib/orchestration/index', err))
    },
    async assemble() {
      return { ok: Boolean(bag.result?.finalVideoUrl) }
    },
  }
}

export { getTotalPlanCost, buildDAG }  from './dagRouter'
export type { OrchestrationResult }    from './types'
