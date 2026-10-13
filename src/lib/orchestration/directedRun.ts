import { logCaught } from '@/lib/diagnostics/caught'
import { ORCHESTRATE_STAGES, type GateMode, type QualityConstraint } from '@cinema/core'
import { buildDAG, getTotalPlanCost } from './dagRouter'
import { generateAllScenes } from './chainGeneration'
import { stitchSegments } from './stitching'
import { syncScenesFromShots } from '@/lib/studio/sceneSync'
import type { GenerationMode } from './costGuard'
import type { OrchestrationResult, PatientZeroAssets, StructuredShot } from './types'

export interface DirectedRunInput {
  prompt: string
  totalDuration: number
  selectedModels: string[]
  userId: string
  jobId?: string
  projectId?: string
  generationMode?: GenerationMode
  qualityTier?: QualityConstraint
  resolution?: string
  heartbeat?: () => void | Promise<void>
  onProgress?: (phase: string, detail: string, progress: number) => void
  directedShots?: StructuredShot[]
  gateMode?: GateMode
  predelegated?: Map<string, { model: string; reason?: string; mode?: string; purpose?: string }>
}

/**
 * Skip interpretation: the user directed the shot list. Delegate + generate + gate + assemble.
 */
export async function orchestrateDirectedShots(
  input: DirectedRunInput,
): Promise<OrchestrationResult> {
  const shots = input.directedShots
  if (!shots?.length) {
    throw new Error('Direct a shot to skip interpretation')
  }
  if (!input.predelegated?.size) {
    throw new Error('Directed shots are planned by orchestrate')
  }
  const selectedModels = input.selectedModels
  if (!selectedModels?.length) {
    throw new Error('[orchestrate] selectedModels is empty — council selection required')
  }
  console.log('[orchestrate] stages', ORCHESTRATE_STAGES.join(' → '), 'skipInterpret')
  input.onProgress?.('interpret', 'Interpretation skipped — using the directed shot', 8)

  const ingestCtx = input.projectId
    ? await (await import('@/lib/ingest/context')).loadProjectGenerationContext({
      userId: input.userId,
      projectId: input.projectId,
      query: input.prompt,
    }).catch((err) => {
      console.warn("[caught] src/lib/orchestration/directedRun.ts:49", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (null)
    })
    : null

  const playbook = await (await import('@/lib/playbook')).loadActivePlaybook(input.userId, input.projectId).catch((err) => {
    console.warn("[caught] src/lib/orchestration/directedRun.ts:52", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  const { applyPlaybookToShots, playbookToQualityConstraint } = await import('@cinema/core')
  const planned = applyPlaybookToShots(shots, playbook)

  const dag = await buildDAG(planned, selectedModels, input.userId, {
    qualityTier: input.qualityTier
      ?? playbookToQualityConstraint(playbook?.generation?.defaultQualityTier)
      ?? (input.generationMode === 'draft' ? 'draft' : 'standard'),
    projectId: input.projectId,
    query: input.prompt,
    playbook,
    predelegated: input.predelegated,
  })
  if (input.projectId) {
    await syncScenesFromShots(input.projectId, planned, { dag, selectedModels }).catch((err) => logCaught('lib/orchestration/directedRun', err))
  }

  const assets: PatientZeroAssets = {
    characters: ingestCtx?.characters ?? [],
    locations: ingestCtx?.locations ?? [],
  }
  const gateMode = input.gateMode ?? 'auto'
  input.onProgress?.('generating', 'Rendering directed shots', 40)
  let segments = await generateAllScenes(
    planned,
    dag,
    assets,
    ({ shotIndex, totalShots, status, subMessage }) => {
      const pct = 40 + Math.round((shotIndex / Math.max(totalShots, 1)) * 50)
      input.onProgress?.('generating', subMessage ?? `Shot ${shotIndex + 1}/${totalShots}: ${status}`, pct)
    },
    {
      jobId: input.jobId,
      projectId: input.projectId,
      userId: input.userId,
      onPoll: input.heartbeat,
      generationMode: input.generationMode ?? 'draft',
      resolution: input.resolution,
      selectedModels,
      gateMode,
    },
  )
  segments = segments.filter((segment) => Boolean(segment.videoUrl?.trim()))
  if (segments.length === 0) throw new Error('No completed shots to assemble')

  input.onProgress?.('assemble', 'Assembling directed shots onto the timeline', 92)
  const finalVideoUrl = segments.length === 1
    ? segments[0].videoUrl
    : await stitchSegments(segments, input.userId)

  const totalCredits = getTotalPlanCost(dag)
  const modelBreakdown: OrchestrationResult['modelBreakdown'] = {}
  for (const node of dag) {
    if (!modelBreakdown[node.assignedModel]) {
      modelBreakdown[node.assignedModel] = { duration: 0, cost: 0, shots: [] }
    }
    modelBreakdown[node.assignedModel].duration += node.shot.duration
    modelBreakdown[node.assignedModel].cost += node.estimatedCost
    modelBreakdown[node.assignedModel].shots.push(node.shot.shotIndex)
  }

  input.onProgress?.('complete', 'Directed shot complete', 100)
  return {
    segments,
    finalVideoUrl,
    totalCredits,
    totalDuration: input.totalDuration,
    qualityScores: {},
    modelBreakdown,
    patientZero: assets,
  }
}

export function directedFromPrompt(prompt: string, duration: number, modelOverride?: string | null): StructuredShot[] {
  return [{
    shotIndex: 0,
    startSeconds: 0,
    endSeconds: duration,
    duration,
    contentType: 'physical_action',
    visualPrompt: prompt,
    cameraMove: 'static',
    motionLevel: 'medium',
    hasDialogue: false,
    hasFaces: true,
    hasAudio: false,
    hasCGI: false,
    charactersPresent: [],
    locationsPresent: [],
    lighting: 'natural_day',
    mood: 'calm',
    bridgeRequired: false,
    continuityGroup: 1,
    isChainStart: true,
    modelOverride: modelOverride ?? undefined,
  }]
}
