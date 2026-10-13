import { isShotPurpose, type ShotPurpose } from './premiseLock'
import { isGenrePresetId } from './genrePresets'
import type { QualityConstraint } from './modelKnowledge'
import type { TasteProfile } from './ratings'

export const PLAYBOOK_CLASSIFY_SOURCE = 'playbook.classify'

export type PlaybookGrade = 'warm' | 'cool' | 'neutral' | 'high-contrast' | 'bleach' | string
export type PlaybookQualityTier = 'draft' | 'studio' | 'blockbuster'

export interface PlaybookStyle {
  aspectRatio?: string
  grade?: PlaybookGrade
  genrePreset?: string
  grain?: string
  lut?: string
}

export interface PlaybookGeneration {
  defaultQualityTier?: PlaybookQualityTier
  modelPreferences?: Partial<Record<ShotPurpose, string>>
  maxShotDuration?: number
  defaultDuration?: number
}

export interface PlaybookLanguage {
  narrationLanguage?: string
  voiceDefaults?: string
}

export interface Playbook {
  id: string
  userId: string
  projectId?: string | null
  name: string
  style?: PlaybookStyle
  generation?: PlaybookGeneration
  language?: PlaybookLanguage
  rules?: string[]
  classifiedRules?: ClassifiedRule[]
}

export type RuleKind = 'hard' | 'soft'

export type RuleAction =
  | { type: 'max_duration'; seconds: number }
  | { type: 'no_onscreen_text' }
  | { type: 'no_dialogue_establishing' }
  | { type: 'max_chain'; shots: number }
  | { type: 'end_scene_wide' }
  | { type: 'prompt_inject'; fragment: string }
  | { type: 'rejected'; reason: string }

export interface ClassifiedRule {
  text: string
  kind: RuleKind
  action: RuleAction
}

export interface PlaybookSuggestion {
  text: string
  reason: string
  patch: Partial<Pick<Playbook, 'style' | 'generation' | 'language' | 'rules'>>
}

const UNSAFE = [
  /\bdisable\b.{0,24}\b(billing|credits?|pause|moderation|safety|gate)\b/i,
  /\bskip\b.{0,24}\b(quality gate|moderation|billing|pause|credits?)\b/i,
  /\bsuppress\b.{0,24}\b(error|flag|honest|problem)\b/i,
  /\b(hide|ignore)\b.{0,24}\b(error|flag|safety|pause|billing)\b/i,
  /\bbypass\b.{0,24}\b(billing|gate|credits?|pause|chokepoint)\b/i,
  /\bforce\s+(pass|approve)\b/i,
  /\bGENERATION_PAUSED\b/i,
  /\bno quality gate\b/i,
  /\brefund\b/i,
]

export function isUnsafePlaybookRule(text: string): boolean {
  return UNSAFE.some((re) => re.test(text))
}

export function stripUnsafeRules(rules: string[]): { kept: string[]; rejected: string[] } {
  const kept: string[] = []
  const rejected: string[] = []
  for (const rule of rules) {
    const text = rule.trim()
    if (!text) continue
    if (isUnsafePlaybookRule(text)) rejected.push(text)
    else kept.push(text)
  }
  return { kept, rejected }
}

export function parsePlaybook(raw: unknown): Playbook | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = str(row.id)
  const userId = str(row.userId)
  const name = str(row.name)
  if (!id || !userId || !name) return null
  const rules = stringList(row.rules)
  const { kept } = stripUnsafeRules(rules)
  return {
    id,
    userId,
    projectId: str(row.projectId) || null,
    name,
    style: parseStyle(row.style),
    generation: parseGeneration(row.generation),
    language: parseLanguage(row.language),
    rules: kept,
    classifiedRules: parseClassified(row.classifiedRules ?? row.ruleActions),
  }
}

/** Project playbook overlays the user-global default. Explicit empty objects stay empty. */
export function mergePlaybooks(global: Playbook | null, project: Playbook | null): Playbook | null {
  if (!project && !global) return null
  if (!project) return global
  if (!global) return project
  const rules = stripUnsafeRules([...(global.rules ?? []), ...(project.rules ?? [])]).kept
  return {
    id: project.id,
    userId: project.userId,
    projectId: project.projectId,
    name: project.name,
    style: { ...global.style, ...project.style },
    generation: {
      defaultQualityTier: project.generation?.defaultQualityTier ?? global.generation?.defaultQualityTier,
      maxShotDuration: project.generation?.maxShotDuration ?? global.generation?.maxShotDuration,
      defaultDuration: project.generation?.defaultDuration ?? global.generation?.defaultDuration,
      modelPreferences: { ...global.generation?.modelPreferences, ...project.generation?.modelPreferences },
    },
    language: { ...global.language, ...project.language },
    rules,
    classifiedRules: [...(global.classifiedRules ?? []), ...(project.classifiedRules ?? [])],
  }
}

export function classifyRule(text: string): ClassifiedRule {
  const trimmed = text.trim()
  if (isUnsafePlaybookRule(trimmed)) {
    return { text: trimmed, kind: 'hard', action: { type: 'rejected', reason: 'safety' } }
  }
  const lower = trimmed.toLowerCase()
  const dur = lower.match(/(?:under|max(?:imum)?|keep shots?(?: to| under)?|no longer than)\s+(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/)
  if (dur) {
    return { text: trimmed, kind: 'hard', action: { type: 'max_duration', seconds: Number(dur[1]) } }
  }
  if (/no on[- ]screen text|no titles?|no captions?|no lower[- ]thirds?|no overlay text/.test(lower)) {
    return { text: trimmed, kind: 'hard', action: { type: 'no_onscreen_text' } }
  }
  if (/no dialogue in establishing/.test(lower)) {
    return { text: trimmed, kind: 'hard', action: { type: 'no_dialogue_establishing' } }
  }
  const chain = lower.match(/chains? under (\d+)/)
  if (chain) {
    return { text: trimmed, kind: 'hard', action: { type: 'max_chain', shots: Number(chain[1]) } }
  }
  if (/end scenes? on a wide/.test(lower)) {
    return { text: trimmed, kind: 'hard', action: { type: 'end_scene_wide' } }
  }
  return { text: trimmed, kind: 'soft', action: { type: 'prompt_inject', fragment: trimmed } }
}

export function classifyRules(rules: string[]): ClassifiedRule[] {
  return stripUnsafeRules(rules).kept.map(classifyRule)
}

export function effectiveRules(playbook: Playbook | null | undefined): ClassifiedRule[] {
  if (!playbook) return []
  if (playbook.classifiedRules?.length) {
    return playbook.classifiedRules.filter((rule) => rule.action.type !== 'rejected')
  }
  return classifyRules(playbook.rules ?? [])
}

export interface PlaybookShot {
  visualPrompt?: string
  duration?: number
  contentType?: string
  hasDialogue?: boolean
  hasAudio?: boolean
  shotSize?: string
  cameraMove?: string
  lighting?: string
  sceneNumber?: number
  shotIndex?: number
  continuityGroup?: number
  genrePresetId?: string | null
  aspectRatio?: string
  playbookFragment?: string
}

export function applyPlaybookToShots<T extends PlaybookShot>(
  shots: T[],
  playbook: Playbook | null | undefined,
): Array<T & PlaybookShot> {
  if (!playbook || !shots.length) return shots
  const rules = effectiveRules(playbook)
  const soft = rules
    .filter((rule) => rule.kind === 'soft' && rule.action.type === 'prompt_inject')
    .map((rule) => (rule.action as { fragment: string }).fragment)
  const styleLine = stylePromptLine(playbook)
  const fragment = [...soft, styleLine].filter(Boolean).join(' ')
  const maxFromGen = playbook.generation?.maxShotDuration
  const maxFromRules = rules.reduce((max, rule) => {
    if (rule.action.type === 'max_duration') return Math.min(max, rule.action.seconds)
    return max
  }, Number.POSITIVE_INFINITY)
  const maxDuration = Number.isFinite(maxFromRules) ? Math.min(maxFromGen ?? maxFromRules, maxFromRules) : maxFromGen
  const defaultDuration = playbook.generation?.defaultDuration
  const noText = rules.some((rule) => rule.action.type === 'no_onscreen_text')
  const noEstDialogue = rules.some((rule) => rule.action.type === 'no_dialogue_establishing')
  const endWide = rules.some((rule) => rule.action.type === 'end_scene_wide')
  const maxChain = rules.find((rule) => rule.action.type === 'max_chain')
  const chainCap = maxChain && maxChain.action.type === 'max_chain' ? maxChain.action.shots : undefined

  const lastInScene = new Set<number>()
  if (endWide) {
    const last = new Map<number, number>()
    for (const shot of shots) {
      const scene = shot.sceneNumber ?? 0
      last.set(scene, shot.shotIndex ?? 0)
    }
    for (const index of last.values()) lastInScene.add(index)
  }

  let chainCount = 0
  let lastGroup: number | undefined
  return shots.map((shot) => {
    let duration = shot.duration
    if (duration == null && defaultDuration != null) duration = defaultDuration
    if (maxDuration != null && duration != null) duration = Math.min(duration, maxDuration)
    let visualPrompt = shot.visualPrompt ?? ''
    if (noText) visualPrompt = stripOnscreenText(visualPrompt)
    const establishing = /establishing|aerial_establishing/.test(shot.contentType ?? '')
    const hasDialogue = noEstDialogue && establishing ? false : shot.hasDialogue
    const hasAudio = noEstDialogue && establishing ? false : shot.hasAudio
    let shotSize = shot.shotSize
    if (endWide && lastInScene.has(shot.shotIndex ?? -1) && !shotSize?.trim()) shotSize = 'WS'
    let continuityGroup = shot.continuityGroup
    if (chainCap != null && continuityGroup != null) {
      if (lastGroup !== continuityGroup) {
        lastGroup = continuityGroup
        chainCount = 1
      } else {
        chainCount += 1
        if (chainCount > chainCap) {
          continuityGroup = (continuityGroup + 50) + (shot.shotIndex ?? 0)
          chainCount = 1
          lastGroup = continuityGroup
        }
      }
    }
    const genrePresetId = shot.genrePresetId?.trim() || playbook.style?.genrePreset || shot.genrePresetId
    const aspectRatio = shot.aspectRatio?.trim() || playbook.style?.aspectRatio || shot.aspectRatio
    return {
      ...shot,
      duration,
      visualPrompt,
      hasDialogue,
      hasAudio,
      shotSize,
      continuityGroup,
      genrePresetId,
      aspectRatio,
      playbookFragment: [shot.playbookFragment, fragment].filter(Boolean).join(' ') || undefined,
    }
  })
}

export function playbookToQualityConstraint(tier?: PlaybookQualityTier | string): QualityConstraint | undefined {
  if (tier === 'draft') return 'draft'
  if (tier === 'blockbuster') return 'blockbuster'
  if (tier === 'studio') return 'standard'
  return undefined
}

/** Explicit run/shot value wins. Playbook fills when the explicit value is absent. */
export function resolveWithPlaybook<T>(explicit: T | null | undefined, playbookValue: T | null | undefined, system: T): T {
  if (explicit != null && explicit !== '') return explicit
  if (playbookValue != null && playbookValue !== '') return playbookValue
  return system
}

export function biasCandidates<T extends { model: string; fitScore: number }>(
  candidates: T[],
  purpose: ShotPurpose,
  playbook: Playbook | null | undefined,
  suggestedModel?: string | null,
): T[] {
  if (!candidates.length) return candidates
  const ranked = candidates.map((row) => ({ ...row }))
  if (suggestedModel?.trim()) {
    const idx = ranked.findIndex((row) => row.model === suggestedModel.trim())
    if (idx >= 0) {
      const [need] = ranked.splice(idx, 1)
      return [need, ...ranked]
    }
  }
  const pref = playbook?.generation?.modelPreferences?.[purpose]
  if (!pref) return ranked
  const hit = ranked.find((row) => row.model === pref)
  if (hit) hit.fitScore += 0.12
  return ranked.sort((a, b) => b.fitScore - a.fitScore)
}

export function suggestPlaybookAdditions(taste: TasteProfile): PlaybookSuggestion[] {
  const out: PlaybookSuggestion[] = []
  if (taste.qualityVsSpeedLean >= 0.4) {
    out.push({
      text: 'Default to Blockbuster quality',
      reason: 'You keep rating higher-tier shots up.',
      patch: { generation: { defaultQualityTier: 'blockbuster' } },
    })
  } else if (taste.qualityVsSpeedLean <= -0.4) {
    out.push({
      text: 'Default to Draft quality',
      reason: 'You keep preferring faster, cheaper takes.',
      patch: { generation: { defaultQualityTier: 'draft' } },
    })
  }
  const top = Object.entries(taste.modelPreference).sort((a, b) => b[1] - a[1])[0]
  if (top && top[1] >= 3) {
    out.push({
      text: `Prefer ${top[0]} for hero shots`,
      reason: `You keep rating ${top[0]} up.`,
      patch: { generation: { modelPreferences: { hero: top[0] } } },
    })
  }
  if ((taste.dimensionSensitivity.wrong_style ?? 0) >= 2) {
    out.push({
      text: 'Keep the genre preset locked',
      reason: 'Style misses keep showing up in ratings.',
      patch: { rules: ['keep the current grade and genre look'] },
    })
  }
  if ((taste.dimensionSensitivity.bad_lighting ?? 0) >= 2) {
    out.push({
      text: 'Prefer motivated practical lighting',
      reason: 'Lighting keeps getting marked down.',
      patch: { rules: ['prefer motivated practical lighting'] },
    })
  }
  if ((taste.dimensionSensitivity.character_drifted ?? 0) >= 2) {
    out.push({
      text: 'Prefer Seedance for character shots',
      reason: 'Character consistency keeps failing.',
      patch: { generation: { modelPreferences: { consistency: 'seedance-2.0' } } },
    })
  }
  return out
}

export function parseClassifiedRuleJson(raw: unknown, fallbackType: ShotPurpose | string): ClassifiedRule {
  if (!raw || typeof raw !== 'object') return classifyRule(String(fallbackType))
  const row = raw as Record<string, unknown>
  const text = str(row.text) || str(row.rule) || ''
  if (!text) return classifyRule('')
  const kind = row.kind === 'hard' || row.kind === 'soft' ? row.kind : classifyRule(text).kind
  const action = parseAction(row.action) ?? classifyRule(text).action
  if (action.type === 'rejected' || isUnsafePlaybookRule(text)) {
    return { text, kind: 'hard', action: { type: 'rejected', reason: 'safety' } }
  }
  return { text, kind, action }
}

function stylePromptLine(playbook: Playbook): string {
  const bits: string[] = []
  if (playbook.style?.grade) bits.push(`${playbook.style.grade} grade`)
  if (playbook.style?.grain) bits.push(playbook.style.grain)
  if (playbook.style?.aspectRatio) bits.push(`framed ${playbook.style.aspectRatio}`)
  if (playbook.style?.lut) bits.push(`LUT ${playbook.style.lut}`)
  return bits.join(', ')
}

function stripOnscreenText(prompt: string): string {
  return prompt
    .replace(/\b(title cards?|lower[- ]thirds?|on[- ]screen text|burn[- ]in captions?|subtitles?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function parseStyle(raw: unknown): PlaybookStyle | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  const genre = str(row.genrePreset)
  return {
    aspectRatio: str(row.aspectRatio),
    grade: str(row.grade),
    genrePreset: genre && isGenrePresetId(genre) ? genre : undefined,
    grain: str(row.grain),
    lut: str(row.lut),
  }
}

function parseGeneration(raw: unknown): PlaybookGeneration | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  const tier = str(row.defaultQualityTier)
  const prefsRaw = row.modelPreferences && typeof row.modelPreferences === 'object'
    ? row.modelPreferences as Record<string, unknown>
    : {}
  const modelPreferences: Partial<Record<ShotPurpose, string>> = {}
  for (const [key, value] of Object.entries(prefsRaw)) {
    if (isShotPurpose(key) && typeof value === 'string' && value.trim()) {
      modelPreferences[key] = value.trim()
    }
  }
  return {
    defaultQualityTier: tier === 'draft' || tier === 'studio' || tier === 'blockbuster' ? tier : undefined,
    modelPreferences: Object.keys(modelPreferences).length ? modelPreferences : undefined,
    maxShotDuration: num(row.maxShotDuration),
    defaultDuration: num(row.defaultDuration),
  }
}

function parseLanguage(raw: unknown): PlaybookLanguage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  return {
    narrationLanguage: str(row.narrationLanguage),
    voiceDefaults: str(row.voiceDefaults),
  }
}

function parseClassified(raw: unknown): ClassifiedRule[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw.map((item) => parseClassifiedRuleJson(item, '')).filter((rule) => rule.text)
  return out.length ? out : undefined
}

function parseAction(raw: unknown): RuleAction | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const type = str(row.type)
  if (type === 'max_duration' && num(row.seconds) != null) return { type: 'max_duration', seconds: num(row.seconds)! }
  if (type === 'no_onscreen_text') return { type: 'no_onscreen_text' }
  if (type === 'no_dialogue_establishing') return { type: 'no_dialogue_establishing' }
  if (type === 'max_chain' && num(row.shots) != null) return { type: 'max_chain', shots: num(row.shots)! }
  if (type === 'end_scene_wide') return { type: 'end_scene_wide' }
  if (type === 'prompt_inject' && str(row.fragment)) return { type: 'prompt_inject', fragment: str(row.fragment)! }
  if (type === 'rejected') return { type: 'rejected', reason: str(row.reason) || 'safety' }
  return null
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}
