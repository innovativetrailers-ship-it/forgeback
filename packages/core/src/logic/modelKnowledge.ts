import type { Mode } from '../types/provider'
import { SHOT_PURPOSES, type ShotPurpose } from './premiseLock'
import { isCircuitOpen, learnedBlendWeight, applyOutcome, type OutcomeSource, type PurposeScore } from './learn'
import { tasteBoost, type TasteProfile } from './ratings'
import { TOOL_EXPOSURE, type ToolCell, type ToolExposureRow } from './toolMatrix'
import { exposedControls } from './toolControls'
import { isVideoReferenceCapable } from './chainContinuity'
import { VIDEO_MODEL_REGISTRY } from './registry'
import { seedanceModeModel } from './seedance'
import { klingModeModel } from './kling'
import { veoModeModel } from './veo'
import { wanModeModel } from './wan'
import { wan30ModeModel } from './wan30'
import { grokModeModel } from './grok'
import { pixverseModeModel } from './pixverse'
import { happyhorseModeModel } from './happyhorse'
import { ltxModeModel } from './ltx'
import { hailuoModeModel } from './hailuo'
import { omniModeModel } from './omni'
import type { ModeModel } from './modePipeline'

/**
 * Model-knowledge store. Retrieval is by shot need. A new model is an indexed
 * entry; queryModelRAG reads whatever is in the store.
 * Layer 1 is seeded from the family maps and the verified tool matrix.
 * Layer 2 is the live ModeModel endpoints (refreshed from OpenAPI when a host
 * calls refreshLiveCapability). Layer 3 starts empty until OR-04 writes scores.
 */

export type KnowledgeTier = 'draft' | 'standard' | 'premium'
export type QualityConstraint = 'draft' | 'standard' | 'blockbuster'

export interface ToolCapability {
  camera: boolean
  reference: boolean
  firstLast: boolean
  nativeAudio: boolean
  voice: boolean
  videoReference: boolean
}

export interface ModelKnowledgeDoc {
  strengths: string[]
  weaknesses: string[]
  bestFor: ShotPurpose[]
  tools: ToolCapability
  cost: { perSecond: Record<string, number>; tier: KnowledgeTier }
  ranks: { consistency: number; motion: number; camera: number; audio: number; quality: number }
  maxDuration: number
  nativeAudio: boolean
  videoRefCapable: boolean
}

export type LearnedByPurpose = Record<ShotPurpose, { worked: number; total: number; score: number }>

export interface ModelKnowledgeEntry {
  id: string
  strengths: string[]
  weaknesses: string[]
  bestFor: ShotPurpose[]
  tools: ToolCapability
  cost: { perSecond: Record<string, number>; tier: KnowledgeTier }
  ranks: { consistency: number; motion: number; camera: number; audio: number; quality: number }
  maxDuration: number
  nativeAudio: boolean
  videoRefCapable: boolean
  liveModes: Mode[]
  liveFields: Partial<Record<Mode, string[]>>
  /** Set when a live OpenAPI fetch replaced the seed field list. Absent means cache miss. */
  liveFetchedAt?: string
  liveLimits: { maxPromptChars: number }
  learned: LearnedByPurpose
  embedding: number[]
  /** Verified /lora inference ids. Empty on council models — LoRA ids are not auto-pooled. */
  loraCapable: boolean
  loraEndpoints: string[]
}

export interface ModelNeed {
  purpose: ShotPurpose
  needs: {
    mode: Mode
    consistency?: number
    camera?: number
    audio?: boolean
    continuity?: boolean
  }
  constraint: {
    tier: QualityConstraint
    budgetCents?: number
  }
}

export interface ModelCandidate {
  model: string
  mode: Mode
  fitScore: number
  reason: string
  costEstimate: number
}

const EXPOSURE_ID: Record<string, string> = { 'hailuo-02': 'hailuo', 'gemini-omni-flash': 'gemini-omni' }

const emptyLearned = (): LearnedByPurpose => {
  const learned = {} as LearnedByPurpose
  for (const purpose of SHOT_PURPOSES) learned[purpose] = { worked: 0, total: 0, score: 0 }
  return learned
}

function schemaOn(cell: ToolCell | undefined): boolean {
  return cell === 'schema'
}

function toolsFrom(row: ToolExposureRow | undefined, id: string): ToolCapability {
  const caps = exposedControls(id)
  return {
    camera: schemaOn(row?.camera),
    reference: schemaOn(row?.reference),
    firstLast: schemaOn(row?.firstLast),
    nativeAudio: schemaOn(row?.nativeAudio) || caps.nativeAudioLockedOn,
    voice: schemaOn(row?.voice),
    videoReference: schemaOn(row?.videoReference) || isVideoReferenceCapable(id),
  }
}

function knowledgeTier(id: string): KnowledgeTier {
  if (id === 'ltx-2.3-fast' || id === 'hailuo-02') return 'draft'
  if (id === 'gemini-omni' || id === 'veo-3.1' || id === 'runway-gen4' || id === 'happyhorse-1.0' || id === 'wan-3.0') return 'premium'
  return 'standard'
}

function creditsPerSecond(id: string): Record<string, number> {
  const table: Record<string, number> = {
    'veo-3.1': 4.6,
    'kling-3.0': 3.4,
    'seedance-2.0': 4,
    'runway-gen4': 4.4,
    'grok-imagine-video': 4,
    'wan-2.7': 1.6,
    'ltx-2.3-fast': 0.4,
    'hailuo-02': 0.6,
    'wan-3.0': 3.2,
    'pixverse-v5.6': 2.4,
    'happyhorse-1.0': 5,
    'gemini-omni': 5,
  }
  if (id === 'gemini-omni') return { '360p': 1.5, '720p': 5, '1080p': 7.5, '4k': 15 }
  const n = table[id] ?? 2
  return { '720p': n, '1080p': n }
}

function maxDurationOf(model: ModeModel): number {
  const spec = model.fields.duration
  if (spec.max != null) return spec.max
  const nums = (spec.values ?? []).map((value) => Number(String(value).replace(/s$/, ''))).filter((n) => Number.isFinite(n))
  return nums.length ? Math.max(...nums) : 8
}

function fieldNames(model: ModeModel): string[] {
  const fields = model.fields
  const names = [fields.firstFrame, fields.duration.field, fields.audio.field]
  if (fields.lastFrame) names.push(fields.lastFrame)
  if (fields.firstFrameForLast) names.push(fields.firstFrameForLast)
  if (fields.references.field) names.push(fields.references.field)
  if (fields.resolution) names.push(fields.resolution.field)
  if (fields.aspect) names.push(fields.aspect.field)
  if (fields.negative) names.push(fields.negative)
  if (fields.seed) names.push(fields.seed)
  return names.filter(Boolean)
}

function liveFrom(model: ModeModel): Pick<ModelKnowledgeEntry, 'liveModes' | 'liveFields' | 'liveLimits'> {
  const liveModes = (Object.keys(model.endpoints) as Mode[]).filter((mode) => Boolean(model.endpoints[mode]))
  const liveFields: Partial<Record<Mode, string[]>> = {}
  const names = fieldNames(model)
  for (const mode of liveModes) liveFields[mode] = names
  return { liveModes, liveFields, liveLimits: { maxPromptChars: model.limits.maxPromptChars } }
}

function modeModelFor(id: string): ModeModel | undefined {
  if (id === 'seedance-2.0') return seedanceModeModel()
  if (id === 'kling-3.0') return klingModeModel()
  if (id === 'veo-3.1') return veoModeModel()
  if (id === 'wan-2.7') return wanModeModel()
  if (id === 'wan-3.0') return wan30ModeModel()
  if (id === 'grok-imagine-video') return grokModeModel()
  if (id === 'pixverse-v5.6') return pixverseModeModel()
  if (id === 'happyhorse-1.0') return happyhorseModeModel()
  if (id === 'ltx-2.3-fast') return ltxModeModel()
  if (id === 'hailuo-02') return hailuoModeModel()
  if (id === 'gemini-omni') return omniModeModel()
  return undefined
}

function embedNeed(text: string[]): number[] {
  const axis = ['consistency', 'motion', 'camera', 'audio', 'quality', 'hero', 'fill', 'dialogue', 'continuity', 'draft']
  return axis.map((word) => (text.some((item) => item.toLowerCase().includes(word)) ? 1 : 0))
}

const DOC: Record<string, Omit<ModelKnowledgeDoc, 'tools' | 'cost' | 'nativeAudio' | 'videoRefCapable' | 'maxDuration'>> = {
  'seedance-2.0': {
    strengths: ['character consistency', 'multimodal composition', 'dialogue audio tags'],
    weaknesses: ['long establishing takes'],
    bestFor: ['consistency', 'dialogue', 'continuity', 'hero'],
    ranks: { consistency: 9, motion: 6, camera: 6, audio: 8, quality: 8 },
  },
  'kling-3.0': {
    strengths: ['human motion', 'action', 'elements on image-to-video'],
    weaknesses: ['no voice_id on v3', 'no seed'],
    bestFor: ['motion', 'camera', 'consistency'],
    ranks: { consistency: 7, motion: 9, camera: 7, audio: 4, quality: 7 },
  },
  'gemini-omni': {
    strengths: ['primary quality t2v', 'first-last on image-to-video', 'video reference and edit'],
    weaknesses: ['max 10s', 'no generate_audio field so native audio cannot be switched off', 'no seed'],
    bestFor: ['hero', 'consistency', 'continuity'],
    ranks: { consistency: 9, motion: 8, camera: 7, audio: 5, quality: 10 },
  },
  'veo-3.1': {
    strengths: ['4K', 'extend for long takes', 'first-last frames'],
    weaknesses: ['secondary to Omni on short quality t2v', 'no video file on reference', 'native audio forced off on submit'],
    bestFor: ['hero'],
    ranks: { consistency: 7, motion: 7, camera: 6, audio: 5, quality: 9 },
  },
  'wan-2.7': {
    strengths: ['budget volume', 'image reference'],
    weaknesses: ['no native audio field', 'no video-reference chain'],
    bestFor: ['fill', 'consistency'],
    ranks: { consistency: 6, motion: 5, camera: 5, audio: 2, quality: 6 },
  },
  'wan-3.0': {
    strengths: ['video reference', '30s takes', 'chained continuity'],
    weaknesses: ['out of the default council', 'reference excludes keyframes'],
    bestFor: ['continuity', 'consistency', 'hero'],
    ranks: { consistency: 8, motion: 6, camera: 5, audio: 4, quality: 8 },
  },
  'happyhorse-1.0': {
    strengths: ['dialogue quality', 'character reference', 'video edit'],
    weaknesses: ['benched until one clean generation', 'no last frame'],
    bestFor: ['dialogue', 'hero', 'consistency'],
    ranks: { consistency: 8, motion: 6, camera: 6, audio: 3, quality: 9 },
  },
  'hailuo-02': {
    strengths: ['cheap pro text', 'fast drafts'],
    weaknesses: ['no reference endpoint', 'pro text has no duration'],
    bestFor: ['draft', 'fill', 'dialogue'],
    ranks: { consistency: 4, motion: 5, camera: 4, audio: 2, quality: 5 },
  },
  'grok-imagine-video': {
    strengths: ['native audio that cannot be switched off', 'image reference'],
    weaknesses: ['no last frame', 'no seed'],
    bestFor: ['fill'],
    ranks: { consistency: 6, motion: 5, camera: 4, audio: 9, quality: 6 },
  },
  'pixverse-v5.6': {
    strengths: ['stylized and anime looks', 'transition last frame', 'negative prompt'],
    weaknesses: ['no character reference endpoint'],
    bestFor: ['stylized', 'camera', 'fill'],
    ranks: { consistency: 4, motion: 6, camera: 8, audio: 3, quality: 6 },
  },
  'ltx-2.3-fast': {
    strengths: ['draft speed', 'last frame on image'],
    weaknesses: ['no character reference', 'no seed'],
    bestFor: ['draft', 'fill'],
    ranks: { consistency: 3, motion: 4, camera: 3, audio: 2, quality: 4 },
  },
}

const store = new Map<string, ModelKnowledgeEntry>()

function buildEntry(id: string, mode: ModeModel, row: ToolExposureRow | undefined): ModelKnowledgeEntry {
  const doc = DOC[id]
  const tools = toolsFrom(row, id)
  const live = liveFrom(mode)
  const strengths = doc?.strengths ?? [row?.note ?? id]
  const weaknesses = doc?.weaknesses ?? []
  const bestFor = doc?.bestFor ?? (['fill'] as ShotPurpose[])
  const ranks = doc?.ranks ?? { consistency: 5, motion: 5, camera: 5, audio: 3, quality: 5 }
  return {
    id,
    strengths,
    weaknesses,
    bestFor,
    tools,
    cost: { perSecond: creditsPerSecond(id), tier: knowledgeTier(id) },
    ranks,
    maxDuration: maxDurationOf(mode),
    nativeAudio: tools.nativeAudio,
    videoRefCapable: tools.videoReference,
    ...live,
    learned: emptyLearned(),
    embedding: embedNeed([...strengths, ...bestFor, id]),
    loraCapable: false,
    loraEndpoints: [],
  }
}

function seedStore(): void {
  if (store.size) return
  for (const id of Object.keys(VIDEO_MODEL_REGISTRY)) {
    const mode = modeModelFor(id)
    if (!mode) continue
    const row = TOOL_EXPOSURE.find((item) => item.model === (EXPOSURE_ID[id] ?? id))
    store.set(id, buildEntry(id, mode, row))
  }
}

export function listModelKnowledge(): ModelKnowledgeEntry[] {
  seedStore()
  return [...store.values()]
}

export function getModelKnowledge(id: string): ModelKnowledgeEntry | undefined {
  seedStore()
  return store.get(id)
}

/** Index or replace an entry. A new model becomes retrievable with no other code change. */
export function indexModelKnowledge(entry: ModelKnowledgeEntry): void {
  seedStore()
  store.set(entry.id, entry)
}

export function recordLearnedOutcome(id: string, purpose: ShotPurpose, worked: boolean): ModelKnowledgeEntry | undefined {
  return applyLearnedSignal(id, purpose, worked ? 1 : -1, 'behaviour')
}

export function applyLearnedSignal(
  id: string,
  purpose: ShotPurpose,
  signal: number,
  source: OutcomeSource = 'behaviour',
): ModelKnowledgeEntry | undefined {
  seedStore()
  const entry = store.get(id)
  if (!entry) return undefined
  entry.learned[purpose] = applyOutcome(entry.learned[purpose], signal, source)
  return entry
}

export function loadLearnedLayer(overlay: Record<string, Partial<LearnedByPurpose>>): void {
  seedStore()
  for (const [id, byPurpose] of Object.entries(overlay)) {
    const entry = store.get(id)
    if (!entry) continue
    for (const purpose of SHOT_PURPOSES) {
      const cell = byPurpose[purpose]
      if (cell) entry.learned[purpose] = cell
    }
  }
}

export async function refreshLiveCapability(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelKnowledgeEntry | undefined> {
  seedStore()
  const entry = store.get(id)
  const mode = modeModelFor(id)
  if (!entry || !mode) return entry
  const { getOpenApiSchema } = await import('./modePipeline')
  const liveFields: Partial<Record<Mode, string[]>> = { ...entry.liveFields }
  const liveModes: Mode[] = []
  for (const [modeName, endpoint] of Object.entries(mode.endpoints) as [Mode, string | undefined][]) {
    if (!endpoint) continue
    const schema = await getOpenApiSchema(endpoint, fetchImpl)
    liveModes.push(modeName)
    liveFields[modeName] = schema.properties
  }
  const next = {
    ...entry,
    liveModes: [...new Set(liveModes)],
    liveFields,
    liveFetchedAt: new Date().toISOString(),
  }
  store.set(id, next)
  return next
}

function constraintBand(tier: QualityConstraint): KnowledgeTier {
  if (tier === 'draft') return 'draft'
  if (tier === 'blockbuster') return 'premium'
  return 'standard'
}

function servesNeed(entry: ModelKnowledgeEntry, need: ModelNeed): boolean {
  if (!entry.liveModes.includes(need.needs.mode)) return false
  if (need.needs.continuity && !entry.videoRefCapable) return false
  if ((need.needs.camera ?? 0) >= 7 && !entry.tools.camera) return false
  return true
}

function costFor(entry: ModelKnowledgeEntry, seconds = 5): number {
  return Math.round((entry.cost.perSecond['720p'] ?? 2) * seconds)
}

function constraintFit(entry: ModelKnowledgeEntry, tier: QualityConstraint): number {
  if (tier === 'draft') return entry.cost.tier === 'draft' ? 1 : entry.cost.tier === 'standard' ? 0.4 : 0.1
  if (tier === 'blockbuster') return entry.cost.tier === 'premium' ? 1 : entry.cost.tier === 'standard' ? 0.6 : 0.2
  return entry.cost.tier === 'standard' ? 1 : 0.5
}

function rankFor(entry: ModelKnowledgeEntry, purpose: ShotPurpose, needs: ModelNeed['needs']): number {
  if (purpose === 'consistency' || (needs.consistency ?? 0) >= 6) return entry.ranks.consistency
  if (purpose === 'motion') return entry.ranks.motion
  if (purpose === 'camera' || (needs.camera ?? 0) >= 6) return entry.ranks.camera
  if (purpose === 'dialogue' || needs.audio) return entry.ranks.audio
  if (purpose === 'hero') return entry.ranks.quality
  if (purpose === 'draft' || purpose === 'fill') return 10 - Math.min(10, entry.ranks.quality)
  return entry.ranks.quality
}

function reasonFor(entry: ModelKnowledgeEntry, need: ModelNeed, score: number, learned: PurposeScore): string {
  const w = learnedBlendWeight(learned.total)
  const learnedBit = learned.total
    ? ` Learned ${Math.round(learned.score * 100)}% on ${need.purpose} (${learned.worked}/${learned.total}, weight ${w.toFixed(2)}).`
    : ' No learned outcomes yet.'
  return `${entry.id} for ${need.purpose} on ${need.needs.mode} (score ${score.toFixed(2)}). ${entry.strengths[0] ?? ''}.${learnedBit}`
}

export function queryModelRAG(
  need: ModelNeed,
  pool?: readonly string[],
  overlay?: Record<string, Partial<LearnedByPurpose>>,
  taste?: TasteProfile,
): ModelCandidate[] {
  seedStore()
  const ids = pool?.length ? pool : [...store.keys()]
  const eligible = ids
    .map((id) => store.get(id))
    .filter((entry): entry is ModelKnowledgeEntry => Boolean(entry && servesNeed(entry, need)))
  const band = constraintBand(need.constraint.tier)
  const inBand = eligible.filter((entry) => entry.cost.tier === band)
  const considered = inBand.length ? inBand : eligible
  const learnedOf = (entry: ModelKnowledgeEntry): PurposeScore =>
    overlay?.[entry.id]?.[need.purpose] ?? entry.learned[need.purpose]
  const live = considered.filter((entry) => !isCircuitOpen(learnedOf(entry)))
  const rankable = live.length ? live : considered
  const ranked: ModelCandidate[] = []
  for (const entry of rankable) {
    const purposeFit = entry.bestFor.includes(need.purpose) ? 1 : 0.15
    const dim = rankFor(entry, need.purpose, need.needs) / 10
    const costFit = constraintFit(entry, need.constraint.tier)
    const budgetOk = need.constraint.budgetCents == null
      || costFor(entry) * 100 <= need.constraint.budgetCents
    if (!budgetOk) continue
    const learned = learnedOf(entry)
    const w = learnedBlendWeight(learned.total)
    const staticPart = purposeFit * 0.55 + dim * 0.3 + costFit * 0.15
    const learnedPart = learned.total ? learned.score : 0.5
    const personal = tasteBoost(entry.id, entry.cost.tier, need.purpose, taste)
    const fitScore = Number(((1 - w) * staticPart + w * learnedPart + personal).toFixed(4))
    ranked.push({
      model: entry.id,
      mode: need.needs.mode,
      fitScore,
      reason: reasonFor(entry, need, fitScore, learned),
      costEstimate: costFor(entry),
    })
  }
  return ranked.sort((a, b) => b.fitScore - a.fitScore)
}
