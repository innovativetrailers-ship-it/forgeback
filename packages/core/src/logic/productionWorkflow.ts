import { VIDEO_REFERENCE_MODELS } from './chainContinuity'
import { mergeTimelineClips, type TimelineClipContract } from './timelineContract'
import { loraCapableBases } from './trainerRegistry'

export const ENTITY_KINDS = ['character', 'location', 'asset'] as const
export type EntityKind = (typeof ENTITY_KINDS)[number]

export const RESOLUTION_STATES = ['unresolved', 'imported', 'generated', 'trained'] as const
export type ResolutionState = (typeof RESOLUTION_STATES)[number]

export type IngestRichness = 'plan' | 'screenplay' | 'idea'

export interface ShotEntityRef {
  entityId: string
  variantId?: string
}

export interface EntityVariation {
  variantId: string
  label: string
  generatedFrom: string
  modifierPrompt: string
  generatedImage?: string | null
  resolutionState: ResolutionState
  appearsInShots: string[]
}

export interface BreakdownShot {
  id: string
  type?: string
  angle?: string
  movement?: string
  duration: number
  description: string
  entityRefs: ShotEntityRef[]
  continuity?: 'continuous' | 'cut'
  /** Music-video timing. Absent on a normal shot. */
  section?: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro'
  barStart?: number
  barEnd?: number
  choreography?: string
  lipSync?: boolean
}

export interface BreakdownScene {
  id: string
  location?: string
  timeOfDay?: string
  description?: string
  shots: BreakdownShot[]
}

export interface BreakdownEntity {
  id: string
  kind: EntityKind
  name: string
  descriptor: string
  appearsInShots: string[]
  isPrimary?: boolean
  variations?: EntityVariation[]
}

export interface ProductionBreakdown {
  scenes: BreakdownScene[]
  entities: BreakdownEntity[]
}

export interface TrainedLoRARef {
  weightsKey: string
  baseModel: string
  baseVersion: string
  baseBackupKey: string
}

export interface ResolvableEntity {
  id: string
  name: string
  descriptor: string
  sourcePrompt?: string | null
  sourceRefs?: string[]
  generatedImage?: string | null
  trainedLoRA?: TrainedLoRARef | null
  resolutionState?: ResolutionState | null
  isPrimary?: boolean
  variations?: EntityVariation[]
}

export type ResolutionLevel = 'trained' | 'reference' | 'prompt' | 'generate-fresh'

export interface EntityResolution {
  entityId: string
  variantId?: string
  level: ResolutionLevel
  text: string
  imageUrl?: string
  lora?: TrainedLoRARef
  resolutionState: ResolutionState
  carrier: 'lora' | 'variation' | 'primary' | 'prompt'
}

export interface CompiledShot {
  id: string
  sceneId: string
  description: string
  duration: number
  continuity: 'continuous' | 'cut'
  entityIds: string[]
  mode: 'text' | 'reference'
  prompt: string
  imageUrl?: string
  useLora: boolean
  useVideoRef: boolean
  consistencyReason: string
  modelId: string
}

export interface CompiledFilm {
  shots: CompiledShot[]
  resolutions: EntityResolution[]
}

const SCREENPLAY = /(^|\n)\s*(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i

export function detectIngestRichness(text: string): IngestRichness {
  const raw = text.trim()
  if (!raw) return 'idea'
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') return 'plan'
    } catch {
      /* a brace that is not JSON is still prose */
    }
  }
  if (SCREENPLAY.test(raw)) return 'screenplay'
  return 'idea'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function textOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numOf(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function kindOf(value: unknown): EntityKind {
  const raw = textOf(value)
  return (ENTITY_KINDS as readonly string[]).includes(raw) ? raw as EntityKind : 'asset'
}

function slug(kind: EntityKind, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entity'
  return `${kind}:${base}`
}

function refFromItem(item: unknown): ShotEntityRef | null {
  if (typeof item === 'string' && item.trim()) return { entityId: item.trim() }
  const row = asRecord(item)
  if (!row) return null
  const entityId = textOf(row.entityId) || textOf(row.id)
  if (!entityId) return null
  const variantId = textOf(row.variantId)
  return variantId ? { entityId, variantId } : { entityId }
}

function shotFromRow(row: Record<string, unknown>, index: number, sceneId: string): BreakdownShot {
  const id = textOf(row.id) || `${sceneId}-shot-${index}`
  const refs = Array.isArray(row.entityRefs)
    ? row.entityRefs.map(refFromItem).filter((item): item is ShotEntityRef => Boolean(item))
    : []
  const continuity = row.continuity === 'continuous' || row.continuity === 'cut' ? row.continuity : undefined
  return {
    id,
    type: textOf(row.type) || textOf(row.shotSize) || undefined,
    angle: textOf(row.angle) || textOf(row.cameraAngle) || undefined,
    movement: textOf(row.movement) || textOf(row.cameraMove) || undefined,
    duration: numOf(row.duration, 5),
    description: textOf(row.description) || textOf(row.visualPrompt) || textOf(row.prompt) || 'Cinematic shot',
    entityRefs: refs,
    continuity,
  }
}

function stateOf(value: unknown): ResolutionState {
  const raw = textOf(value)
  return (RESOLUTION_STATES as readonly string[]).includes(raw) ? raw as ResolutionState : 'unresolved'
}

function variationFromRow(row: Record<string, unknown>, entityId: string): EntityVariation | null {
  const variantId = textOf(row.variantId) || textOf(row.id)
  if (!variantId) return null
  const label = textOf(row.label) || variantId
  return {
    variantId,
    label,
    generatedFrom: textOf(row.generatedFrom) || entityId,
    modifierPrompt: textOf(row.modifierPrompt) || label,
    generatedImage: textOf(row.generatedImage) || null,
    resolutionState: stateOf(row.resolutionState),
    appearsInShots: Array.isArray(row.appearsInShots)
      ? row.appearsInShots.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function entityFromRow(row: Record<string, unknown>, index: number): BreakdownEntity | null {
  const name = textOf(row.name)
  if (!name) return null
  const kind = kindOf(row.kind)
  const id = textOf(row.id) || slug(kind, name)
  const appears = Array.isArray(row.appearsInShots)
    ? row.appearsInShots.filter((item): item is string => typeof item === 'string')
    : []
  const variations = Array.isArray(row.variations)
    ? row.variations
      .map((item) => variationFromRow(asRecord(item) ?? {}, id))
      .filter((item): item is EntityVariation => Boolean(item))
    : []
  return {
    id,
    kind,
    name,
    descriptor: textOf(row.descriptor) || textOf(row.description) || name,
    appearsInShots: appears,
    isPrimary: row.isPrimary === false ? false : true,
    variations,
  }
}

/** Accepts a full plan, a shot array, or a partial object. Missing fields stay optional. */
export function normalizeBreakdown(input: unknown): ProductionBreakdown {
  if (Array.isArray(input)) return breakdownFromShotRows(input)
  const root = asRecord(input)
  if (!root) {
    return { scenes: [], entities: [] }
  }
  const sceneRows = Array.isArray(root.scenes) ? root.scenes : Array.isArray(root.shots) ? [{ shots: root.shots }] : []
  const scenes: BreakdownScene[] = sceneRows.map((item, sceneIndex) => {
    const scene = asRecord(item) ?? {}
    const id = textOf(scene.id) || `scene-${sceneIndex + 1}`
    const shots = (Array.isArray(scene.shots) ? scene.shots : []).map((shot, shotIndex) => {
      return shotFromRow(asRecord(shot) ?? {}, shotIndex, id)
    })
    return {
      id,
      location: textOf(scene.location) || undefined,
      timeOfDay: textOf(scene.timeOfDay) || undefined,
      description: textOf(scene.description) || undefined,
      shots,
    }
  }).filter((scene) => scene.shots.length > 0)

  const declared = (Array.isArray(root.entities) ? root.entities : [])
    .map((item, index) => entityFromRow(asRecord(item) ?? {}, index))
    .filter((item): item is BreakdownEntity => Boolean(item))
  return linkEntities({ scenes, entities: declared })
}

export function breakdownFromShotRows(rows: unknown[]): ProductionBreakdown {
  const scenes: BreakdownScene[] = []
  rows.forEach((item, index) => {
    const row = asRecord(item) ?? {}
    const sceneNumber = numOf(row.sceneNumber, index + 1)
    const sceneId = `scene-${sceneNumber}`
    let scene = scenes.find((candidate) => candidate.id === sceneId)
    if (!scene) {
      scene = {
        id: sceneId,
        location: textOf(row.location) || (Array.isArray(row.locationsPresent) ? textOf(row.locationsPresent[0]) : '') || undefined,
        description: textOf(row.sceneDescription) || undefined,
        shots: [],
      }
      scenes.push(scene)
    }
    const shot = shotFromRow(row, scene.shots.length, scene.id)
    const names = [
      ...nameRefs(row.charactersPresent, 'character'),
      ...nameRefs(row.locationsPresent, 'location'),
    ]
    const seen = new Set(shot.entityRefs.map((ref) => ref.entityId))
    for (const entity of names) {
      if (seen.has(entity.id)) continue
      seen.add(entity.id)
      shot.entityRefs.push({ entityId: entity.id })
    }
    scene.shots.push(shot)
  })
  const named = rows.flatMap((item) => {
    const row = asRecord(item) ?? {}
    return [
      ...nameRefs(row.charactersPresent, 'character'),
      ...nameRefs(row.locationsPresent, 'location'),
    ]
  })
  return linkEntities({ scenes, entities: named })
}

function nameRefs(value: unknown, kind: EntityKind): BreakdownEntity[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const name = typeof item === 'string' ? item.trim() : textOf(asRecord(item)?.name)
    if (!name) return []
    return [{ id: slug(kind, name), kind, name, descriptor: name, appearsInShots: [] }]
  })
}

function linkEntities(breakdown: ProductionBreakdown): ProductionBreakdown {
  const byId = new Map<string, BreakdownEntity>()
  for (const entity of breakdown.entities) {
    const prev = byId.get(entity.id)
    if (!prev) byId.set(entity.id, { ...entity, appearsInShots: [...entity.appearsInShots] })
    else if (!prev.descriptor && entity.descriptor) prev.descriptor = entity.descriptor
  }
  for (const scene of breakdown.scenes) {
    for (const shot of scene.shots) {
      for (const ref of shot.entityRefs) {
        const entity = byId.get(ref.entityId)
        if (!entity) continue
        if (!entity.appearsInShots.includes(shot.id)) entity.appearsInShots.push(shot.id)
        if (!ref.variantId) continue
        const variation = entity.variations?.find((item) => item.variantId === ref.variantId)
        if (variation && !variation.appearsInShots.includes(shot.id)) variation.appearsInShots.push(shot.id)
      }
    }
  }
  return { scenes: breakdown.scenes, entities: [...byId.values()] }
}

/** A loose idea still yields one scene, one shot, and no required entities. */
export function breakdownFromIdea(text: string, duration = 5): ProductionBreakdown {
  const description = text.trim() || 'Untitled idea'
  return normalizeBreakdown({
    scenes: [{
      id: 'scene-1',
      description,
      shots: [{
        id: 'scene-1-shot-0',
        duration,
        description,
        entityRefs: [],
        continuity: 'cut',
      }],
    }],
    entities: [],
  })
}

export function resolutionKey(entityId: string, variantId?: string): string {
  return variantId ? `${entityId}::${variantId}` : entityId
}

export function resolveEntity(entity: ResolvableEntity, variantId?: string): EntityResolution {
  const variation = variantId
    ? entity.variations?.find((item) => item.variantId === variantId)
    : undefined
  const text = [
    entity.sourcePrompt || entity.descriptor || entity.name || 'Cinematic subject',
    variation?.modifierPrompt,
  ].filter(Boolean).join('. ').trim()
  const lora = entity.trainedLoRA
  const trained = Boolean(lora?.weightsKey && lora.baseModel && lora.baseVersion && lora.baseBackupKey)
  if (trained && lora) {
    console.log('[variation_carrier]', JSON.stringify({ entityId: entity.id, variantId: variantId ?? null, carrier: 'lora' }))
    return {
      entityId: entity.id,
      variantId,
      level: 'trained',
      text,
      imageUrl: variation?.generatedImage?.trim()
        || entity.generatedImage?.trim()
        || entity.sourceRefs?.find((ref) => ref.trim())
        || undefined,
      lora,
      resolutionState: 'trained',
      carrier: 'lora',
    }
  }
  const variationImage = variation?.generatedImage?.trim()
  if (variationImage) {
    console.log('[variation_carrier]', JSON.stringify({ entityId: entity.id, variantId, carrier: 'variation' }))
    return {
      entityId: entity.id,
      variantId,
      level: 'reference',
      text,
      imageUrl: variationImage,
      resolutionState: variation?.resolutionState === 'unresolved' ? 'generated' : (variation?.resolutionState ?? 'generated'),
      carrier: 'variation',
    }
  }
  const primaryImage = entity.generatedImage?.trim() || entity.sourceRefs?.find((ref) => ref.trim())
  if (variantId && !variationImage) {
    console.warn('[variation_fallback]', JSON.stringify({
      entityId: entity.id,
      variantId,
      reason: primaryImage ? 'variation image missing; using primary' : 'parent reference missing; prompt-only',
    }))
  }
  if (primaryImage) {
    return {
      entityId: entity.id,
      variantId,
      level: 'reference',
      text,
      imageUrl: primaryImage,
      resolutionState: entity.resolutionState === 'generated' || entity.resolutionState === 'imported'
        ? entity.resolutionState
        : entity.generatedImage ? 'generated' : 'imported',
      carrier: 'primary',
    }
  }
  return {
    entityId: entity.id,
    variantId,
    level: (entity.sourcePrompt || '').trim() ? 'prompt' : 'generate-fresh',
    text,
    resolutionState: entity.resolutionState ?? 'unresolved',
    carrier: 'prompt',
  }
}

/** One resolution per (entity, variant) for the whole film. */
export function resolveFilm(entities: ResolvableEntity[], shots: BreakdownShot[] = []): Map<string, EntityResolution> {
  const cache = new Map<string, EntityResolution>()
  const put = (entity: ResolvableEntity, variantId?: string) => {
    const key = resolutionKey(entity.id, variantId)
    if (!cache.has(key)) cache.set(key, resolveEntity(entity, variantId))
  }
  for (const entity of entities) put(entity)
  for (const shot of shots) {
    for (const ref of shot.entityRefs) {
      const entity = entities.find((item) => item.id === ref.entityId)
      if (entity) put(entity, ref.variantId)
    }
  }
  return cache
}

export interface ReferenceDagNode {
  id: string
  kind: 'primary' | 'variation'
  entityId: string
  variantId?: string
  dependsOn: string | null
  prompt: string
}

export function orderReferenceDag(nodes: ReferenceDagNode[]): ReferenceDagNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    if (node.dependsOn && !byId.has(node.dependsOn)) {
      throw new Error(`variation ${node.variantId ?? node.id} has no parent reference`)
    }
  }
  const incoming = new Map(nodes.map((node) => [node.id, node.dependsOn ? 1 : 0]))
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (!node.dependsOn) continue
    const list = children.get(node.dependsOn) ?? []
    list.push(node.id)
    children.set(node.dependsOn, list)
  }
  const ready = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
  const ordered: ReferenceDagNode[] = []
  while (ready.length) {
    const id = ready.shift()
    if (!id) break
    const node = byId.get(id)
    if (!node) continue
    ordered.push(node)
    for (const child of children.get(id) ?? []) {
      const left = (incoming.get(child) ?? 1) - 1
      incoming.set(child, left)
      if (left === 0) ready.push(child)
    }
  }
  if (ordered.length !== nodes.length) throw new Error('variation lineage cycle')
  return ordered
}

export function referenceDagFor(entities: BreakdownEntity[]): ReferenceDagNode[] {
  const nodes: ReferenceDagNode[] = []
  for (const entity of entities) {
    nodes.push({
      id: `primary:${entity.id}`,
      kind: 'primary',
      entityId: entity.id,
      dependsOn: null,
      prompt: entity.descriptor,
    })
    for (const variation of entity.variations ?? []) {
      const fromPrimary = !variation.generatedFrom || variation.generatedFrom === entity.id
      nodes.push({
        id: `variation:${entity.id}:${variation.variantId}`,
        kind: 'variation',
        entityId: entity.id,
        variantId: variation.variantId,
        dependsOn: fromPrimary
          ? `primary:${entity.id}`
          : `variation:${entity.id}:${variation.generatedFrom}`,
        prompt: variation.modifierPrompt || variation.label,
      })
    }
  }
  return orderReferenceDag(nodes)
}

export function referenceDagCredits(nodes: ReferenceDagNode[]): number {
  if (nodes.length === 0) return 0
  const credits = nodes.length
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new Error('Cost estimate was not a finite credit number')
  }
  return credits
}

export function familyConsistency(modelId: string): { lora: boolean; videoRef: boolean } {
  return {
    lora: loraCapableBases().includes(modelId),
    videoRef: (VIDEO_REFERENCE_MODELS as readonly string[]).includes(modelId),
  }
}

export function decideConsistency(input: {
  modelId: string
  wantsLora: boolean
  wantsVideoRef: boolean
  continuous: boolean
  entityCritical: boolean
}): { useLora: boolean; useVideoRef: boolean; reason: string } {
  const caps = familyConsistency(input.modelId)
  let choice: { useLora: boolean; useVideoRef: boolean; reason: string }
  if (input.wantsLora && input.wantsVideoRef && caps.lora && caps.videoRef) {
    choice = { useLora: true, useVideoRef: true, reason: 'both' }
  } else if (input.wantsLora && input.wantsVideoRef) {
    if (input.continuous && !input.entityCritical && caps.videoRef) {
      choice = { useLora: false, useVideoRef: true, reason: 'feed-forward' }
    } else if (input.entityCritical && caps.lora) {
      choice = { useLora: true, useVideoRef: false, reason: 'lora' }
    } else if (input.entityCritical && !caps.lora) {
      choice = { useLora: false, useVideoRef: false, reason: 'lora-unavailable' }
    } else if (caps.videoRef) {
      choice = { useLora: false, useVideoRef: true, reason: 'feed-forward' }
    } else {
      choice = { useLora: false, useVideoRef: false, reason: 'text' }
    }
  } else if (input.wantsLora && !caps.lora) {
    choice = { useLora: false, useVideoRef: false, reason: 'lora-unavailable' }
  } else {
    choice = {
      useLora: input.wantsLora && caps.lora,
      useVideoRef: input.wantsVideoRef && caps.videoRef,
      reason: (input.wantsLora && caps.lora) || (input.wantsVideoRef && caps.videoRef) ? 'available' : 'text',
    }
  }
  console.log('[consistency_choice]', JSON.stringify({ modelId: input.modelId, ...choice, caps }))
  return choice
}

export function autoGenSelection(entities: BreakdownEntity[], explicitIds?: string[]): {
  selected: BreakdownEntity[]
  skipped: BreakdownEntity[]
} {
  if (explicitIds) {
    const wanted = new Set(explicitIds)
    return {
      selected: entities.filter((entity) => wanted.has(entity.id)),
      skipped: entities.filter((entity) => !wanted.has(entity.id)),
    }
  }
  const selected = entities
    .filter((entity) => entity.kind === 'character' || entity.kind === 'location')
    .sort((a, b) => b.appearsInShots.length - a.appearsInShots.length)
  const selectedIds = new Set(selected.map((entity) => entity.id))
  return {
    selected,
    skipped: entities.filter((entity) => !selectedIds.has(entity.id)),
  }
}

export function compileProductionPlan(input: {
  breakdown: ProductionBreakdown
  entities: ResolvableEntity[]
  modelId?: string
}): CompiledFilm {
  const shotsInPlan = input.breakdown.scenes.flatMap((scene) => scene.shots)
  const cache = resolveFilm(input.entities, shotsInPlan)
  const modelId = input.modelId ?? 'wan-2.7'
  const shots: CompiledShot[] = []
  for (const scene of input.breakdown.scenes) {
    scene.shots.forEach((shot, index) => {
      const resolutions = shot.entityRefs
        .map((ref) => cache.get(resolutionKey(ref.entityId, ref.variantId)))
        .filter((row): row is EntityResolution => Boolean(row))
      const image = resolutions.find((row) => row.imageUrl)
      const trained = resolutions.some((row) => row.level === 'trained')
      const descriptors = resolutions.map((row) => row.text).filter(Boolean)
      const continuity = shot.continuity ?? (index === 0 ? 'cut' : 'continuous')
      const decision = decideConsistency({
        modelId,
        wantsLora: trained,
        wantsVideoRef: continuity === 'continuous' && index > 0,
        continuous: continuity === 'continuous' && index > 0,
        entityCritical: trained,
      })
      const keepImage = Boolean(image) && decision.reason !== 'feed-forward'
      shots.push({
        id: shot.id,
        sceneId: scene.id,
        description: shot.description,
        duration: shot.duration,
        continuity,
        entityIds: shot.entityRefs.map((ref) => ref.entityId),
        mode: keepImage ? 'reference' : 'text',
        prompt: [shot.description, ...descriptors].filter(Boolean).join('. '),
        imageUrl: keepImage ? image?.imageUrl : undefined,
        useLora: decision.useLora,
        useVideoRef: decision.useVideoRef,
        consistencyReason: decision.reason,
        modelId,
      })
    })
  }
  return { shots, resolutions: [...cache.values()] }
}

export function landCompiledShots<T extends TimelineClipContract>(input: {
  existing: T[]
  incoming: T[]
  suppressedIds?: readonly string[]
}): { clips: T[]; added: number; updated: number } {
  return mergeTimelineClips({
    clips: input.existing,
    incoming: input.incoming,
    suppressedIds: input.suppressedIds,
  })
}
