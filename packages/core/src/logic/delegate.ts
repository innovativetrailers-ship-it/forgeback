import type { Mode } from '../types/provider'
import { assertModelIntegrity, ModelIntegrityError } from './integrity'
import { shotMode, type ModeShot } from './modePipeline'
import {
  queryModelRAG,
  getModelKnowledge,
  listModelKnowledge,
  type ModelCandidate,
  type QualityConstraint,
  type LearnedByPurpose,
} from './modelKnowledge'
import { deriveShotPurpose, type ShotPurpose } from './premiseLock'
import { resolveModel, stillHold } from './resolveModel'
import type { TasteProfile } from './ratings'
import { biasCandidates, type Playbook } from './playbook'
import {
  loraEndpointForMode,
  shouldDelegateTrainedLora,
  TRAINED_LORA_DELEGATION,
  type LoraAssetRef,
} from './trainedAsset'

export type { QualityConstraint, ShotPurpose }

export interface DelegateShot {
  id?: string
  visualPrompt?: string
  prompt?: string
  duration?: number
  purpose?: string
  contentType?: string
  hasDialogue?: boolean
  needsDialogue?: boolean
  cameraPrecision?: boolean
  cameraMove?: string
  cameraNeed?: number
  consistencyNeed?: number
  characterIds?: string[]
  charactersPresent?: string[]
  locationId?: string | null
  anchorFrameUrl?: string | null
  storyboardUrl?: string | null
  endFrameUrl?: string | null
  continueExactFrame?: boolean
  sourceVideoUrl?: string | null
  chainFrom?: string | null
  modelOverride?: string | null
  characterLora?: LoraAssetRef | null
  styleLora?: LoraAssetRef | null
  suggestedModel?: string
  budget?: number
  moneyShot?: boolean
  sceneNumber?: number
  shotIndex?: number
}

export interface DelegateProject {
  qualityTier: QualityConstraint
  budgetCents?: number
  taste?: TasteProfile
  playbook?: Playbook | null
}

export interface DelegateResult {
  model: string
  mode: Mode
  reason: string
  costEstimate: number
  purpose: ShotPurpose
}

function benched(id: string): boolean {
  return /happy-?horse/i.test(id)
}

/** Indexed models the auto path may pick. HappyHorse stays out until one clean generation. */
export function autoDelegatePool(requested?: readonly string[]): string[] {
  const indexed = listModelKnowledge().map((entry) => entry.id).filter((id) => !benched(id))
  // Hosted wan-3.0 is a closed pay-per-call model, benched by decision (Neo, 2026-09-27).
  // The open-weight flagship is Wan 2.2 and belongs to the training/local lane
  // (DEFERRED-REGISTER §O), not this hosted council. A manual model list still includes wan-3.0.
  if (!requested?.length) {
    return indexed.filter((id) => id !== 'wan-3.0' && id !== 'wan-2.2')
  }
  return requested.filter((id) => indexed.includes(id))
}

export function bumpQualityTier(tier: QualityConstraint, moneyShot?: boolean): QualityConstraint {
  if (!moneyShot) return tier
  if (tier === 'draft') return 'standard'
  if (tier === 'standard') return 'blockbuster'
  return 'blockbuster'
}

function toModeShot(shot: DelegateShot): ModeShot {
  return {
    prompt: shot.visualPrompt ?? shot.prompt ?? '',
    durationSec: shot.duration,
    anchorFrameUrl: shot.anchorFrameUrl ?? shot.storyboardUrl,
    endFrameUrl: shot.endFrameUrl,
    continueExactFrame: shot.continueExactFrame,
    characterIds: shot.characterIds,
    locationId: shot.locationId,
    sourceVideoUrl: shot.sourceVideoUrl,
  }
}

function endpointFor(modelId: string, mode: Mode): string {
  const def = resolveModel(modelId)
  const fromMode = def.endpoints?.[mode]
  if (fromMode) return fromMode
  if (mode === 'reference' && def.referenceEndpoint) return def.referenceEndpoint
  if ((mode === 'first_frame' || mode === 'first_last') && def.i2vEndpoint) return def.i2vEndpoint
  if (!def.falEndpoint) {
    throw new ModelIntegrityError(`Model '${modelId}' has no endpoint for mode '${mode}'`)
  }
  return def.falEndpoint
}

export function assertDelegatedIntegrity(chosen: { model: string; mode: Mode }): void {
  const def = resolveModel(chosen.model)
  const endpoint = endpointFor(chosen.model, chosen.mode)
  const hasStart = chosen.mode === 'first_frame' || chosen.mode === 'first_last'
  const hasRefs = chosen.mode === 'reference'
  assertModelIntegrity(chosen.model, def, endpoint, hasStart, hasRefs)
}

function hasKeyframe(shot: DelegateShot): boolean {
  return Boolean((shot.anchorFrameUrl ?? shot.storyboardUrl)?.trim())
}

function modeForStill(modelId: string, mode: Mode, shot: DelegateShot): Mode {
  if (!hasKeyframe(shot) || mode === 'video_edit') return mode
  const hold = stillHold(modelId)
  if (hold === 'reference') return mode === 'text' ? 'reference' : mode
  if (hold === 'first_frame') return mode === 'first_last' ? 'first_last' : 'first_frame'
  return mode
}

function resolveOverride(shot: DelegateShot): DelegateResult {
  const raw = (shot.modelOverride ?? '').trim()
  const def = resolveModel(raw)
  const mode = modeForStill(def.canonicalId, shotMode(toModeShot(shot)), shot)
  const purpose = deriveShotPurpose(shot)
  const knowledge = getModelKnowledge(def.canonicalId)
  const costEstimate = knowledge
    ? Math.round((knowledge.cost.perSecond['720p'] ?? 2) * 5)
    : 0
  const chosen: DelegateResult = {
    model: def.canonicalId,
    mode,
    reason: `Manual override: ${def.canonicalId} on ${mode}.`,
    costEstimate,
    purpose,
  }
  assertDelegatedIntegrity(chosen)
  return chosen
}

function logDelegation(shot: DelegateShot, chosen: DelegateResult): void {
  console.log(JSON.stringify({
    event: 'delegation',
    shot: shot.id ?? shot.shotIndex ?? null,
    model: chosen.model,
    purpose: chosen.purpose,
    reason: chosen.reason,
    cost: chosen.costEstimate,
    mode: chosen.mode,
  }))
}

export async function delegate(
  shot: DelegateShot,
  project: DelegateProject,
  pool?: readonly string[],
  learned?: Record<string, Partial<LearnedByPurpose>>,
): Promise<DelegateResult> {
  if (shot.modelOverride?.trim()) {
    const chosen = resolveOverride(shot)
    logDelegation(shot, chosen)
    return chosen
  }

  const purpose = deriveShotPurpose(shot)
  const mode = shotMode(toModeShot(shot))
  const tier = bumpQualityTier(project.qualityTier, shot.moneyShot)
  const usable = autoDelegatePool(pool)
  if (purpose === 'stylized') {
    if (!usable.includes('pixverse-v5.6')) {
      throw new ModelIntegrityError('STYLIZED shots require pixverse-v5.6, which is not in the delegate pool')
    }
    const knowledge = getModelKnowledge('pixverse-v5.6')
    const chosen: DelegateResult = {
      model: 'pixverse-v5.6',
      mode,
      reason: 'STYLIZED: pixverse-v5.6 for stylized, anime, or transition shots. The v5.6/transition endpoint is the transition tool.',
      costEstimate: knowledge ? Math.round((knowledge.cost.perSecond['720p'] ?? 2) * 5) : 0,
      purpose,
    }
    assertDelegatedIntegrity(chosen)
    logDelegation(shot, chosen)
    return chosen
  }
  const candidates = biasCandidates(
    queryModelRAG({
      purpose,
      needs: {
        mode,
        consistency: shot.consistencyNeed,
        camera: shot.cameraNeed ?? (shot.cameraPrecision ? 8 : undefined),
        audio: shot.needsDialogue ?? shot.hasDialogue,
        continuity: Boolean(shot.chainFrom),
      },
      constraint: {
        tier,
        budgetCents: shot.budget ?? project.budgetCents,
      },
    }, usable, learned, project.taste),
    purpose,
    project.playbook,
    shot.suggestedModel,
  )

  const keyframe = hasKeyframe(shot)
  const capable = keyframe ? candidates.filter((row) => stillHold(row.model)) : candidates
  if (keyframe && !capable.length && candidates.length) {
    console.warn('[delegate] keyframe shot forced onto a model with no still endpoint', JSON.stringify({
      shot: shot.id ?? shot.shotIndex ?? null,
      model: candidates[0]?.model ?? null,
    }))
  }
  const top: ModelCandidate | undefined = (capable.length ? capable : candidates)[0]
  const loraAsset = shot.characterLora ?? shot.styleLora ?? undefined
  const loraEndpoint = loraAsset ? loraEndpointForMode(loraAsset, mode) : null
  if (loraAsset?.loraUrl?.trim() && !loraEndpoint) {
    throw new ModelIntegrityError(`Trained LoRA has no inference path for mode ${mode}`)
  }
  if (
    shouldDelegateTrainedLora({
      purpose,
      consistencyNeed: shot.consistencyNeed,
      hasLoraAsset: Boolean(loraAsset?.loraUrl),
      assetType: shot.characterLora ? 'character' : shot.styleLora ? 'style' : null,
      modelOverride: shot.modelOverride,
      learned,
      loraEndpoint,
    }) && loraEndpoint
  ) {
    const chosen: DelegateResult = {
      model: loraEndpoint,
      mode: modeForStill(loraEndpoint, mode, shot),
      reason: `${top?.reason ?? 'Trained LoRA.'} ${TRAINED_LORA_DELEGATION}`,
      costEstimate: top?.costEstimate ?? 0,
      purpose,
    }
    assertDelegatedIntegrity(chosen)
    logDelegation(shot, chosen)
    return chosen
  }
  if (!top) {
    throw new ModelIntegrityError(
      `No indexed model serves purpose '${purpose}' on mode '${mode}' under ${tier}`,
    )
  }
  const chosen: DelegateResult = {
    model: top.model,
    mode: modeForStill(top.model, top.mode, shot),
    reason: top.reason,
    costEstimate: top.costEstimate,
    purpose,
  }
  assertDelegatedIntegrity(chosen)
  logDelegation(shot, chosen)
  return chosen
}
