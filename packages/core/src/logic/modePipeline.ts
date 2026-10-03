import type { AnchorSource } from '../types/entities'
import type { FamilyFieldMap, Mode } from '../types/provider'
import { PayloadError, snapEnum } from './payload'
import { ModelIntegrityError } from './integrity'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import { genreStyleFragment } from './genrePresets'

/**
 * Mode-pipeline model. The live registry ModelDef stays as it is.
 * A family prompt copies one entry into this shape. MP-01 wires none.
 */
export interface ModeModel {
  id: string
  provider: 'fal'
  endpoints: Partial<Record<Mode, string>>
  fields: FamilyFieldMap
  limits: { maxPromptChars: number }
  nativeAudio: boolean
}

export interface ModeShot {
  prompt: string
  durationSec?: number | null
  anchorFrameUrl?: string | null
  endFrameUrl?: string | null
  /** Anchor-chain continuation. Also true when anchorSource is 'auto'. */
  continueExactFrame?: boolean
  anchorSource?: AnchorSource
  characterIds?: string[]
  locationId?: string | null
  sourceVideoUrl?: string | null
  audioWanted?: boolean
  resolution?: string
  aspectRatio?: string
  camera?: PromptCamera | null
  genrePresetId?: string | null
  referenceUrls?: string[]
  characters?: { name?: string; referenceImageUrl?: string | null }[]
  location?: { plateUrl?: string | null } | null
  playbookFragment?: string
}

export interface OpenApiSchema {
  endpoint: string
  required: string[]
  properties: string[]
  enums: Record<string, (string | number)[]>
  videoField?: string
}

export interface ResolvedMode {
  model: ModeModel
  mode: Mode
  endpoint: string
}

const schemaCache = new Map<string, OpenApiSchema>()

type JsonSchema = {
  type?: string
  enum?: (string | number)[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  $ref?: string
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }))
}

function continuesExactFrame(shot: ModeShot): boolean {
  return shot.continueExactFrame === true || shot.anchorSource === 'auto'
}

export function shotMode(shot: ModeShot): Mode {
  if (shot.sourceVideoUrl?.trim()) return 'video_edit'
  if (shot.anchorFrameUrl?.trim() && shot.endFrameUrl?.trim()) return 'first_last'
  if (shot.anchorFrameUrl?.trim() && continuesExactFrame(shot)) return 'first_frame'
  if ((shot.characterIds?.length ?? 0) > 0 || shot.locationId) return 'reference'
  if (shot.anchorFrameUrl?.trim()) return 'first_frame'
  return 'text'
}

function supportsShot(model: ModeModel, shot: ModeShot): boolean {
  const mode = shotMode(shot)
  if (!model.endpoints[mode]) return false
  if (mode === 'reference' && model.fields.references.max < 1) return false
  return true
}

function downgradeMode(model: ModeModel, shot: ModeShot, from: Mode): ResolvedMode {
  const hasStill = Boolean(shot.anchorFrameUrl?.trim())
  const order: Mode[] = []
  if (hasStill || from === 'first_last' || from === 'reference') {
    if (model.endpoints.first_frame) order.push('first_frame')
  }
  if (!hasStill && model.endpoints.text) order.push('text')
  for (const mode of order) {
    const endpoint = model.endpoints[mode]
    if (!endpoint || mode === from) continue
    log('mode_downgraded', { model: model.id, from, to: mode })
    return { model, mode, endpoint }
  }
  throw new PayloadError(
    hasStill
      ? `Model '${model.id}' has a still but no reference or first-frame endpoint`
      : `Model '${model.id}' has no endpoint for mode '${from}' and no downgrade`,
  )
}

export function resolveEndpoint(model: ModeModel, shot: ModeShot, pool: ModeModel[]): ResolvedMode {
  const requested = shotMode(shot)
  const hasStill = Boolean(shot.anchorFrameUrl?.trim())
  const reference = model.endpoints.reference
  const firstFrame = model.endpoints.first_frame
  const mode = hasStill && requested === 'reference' && reference && firstFrame && reference === firstFrame
    ? 'first_frame'
    : requested
  const direct = model.endpoints[mode]
  if (direct) return { model, mode, endpoint: direct }

  const alt = pool.find((candidate) => candidate.id !== model.id && supportsShot(candidate, shot))
  const altEndpoint = alt?.endpoints[mode]
  if (alt && altEndpoint) {
    log('rerouted', { from: model.id, to: alt.id, mode })
    return { model: alt, mode, endpoint: altEndpoint }
  }
  return downgradeMode(model, shot, mode)
}

export function assertResolvedEndpoint(
  model: ModeModel,
  shot: ModeShot,
  pool: ModeModel[],
  endpoint: string,
): ResolvedMode {
  const resolved = resolveEndpoint(model, shot, pool)
  if (endpoint !== resolved.endpoint) {
    throw new ModelIntegrityError(
      `Endpoint mismatch: ${model.id} mode ${resolved.mode} resolved ${resolved.endpoint} but about to submit ${endpoint}`,
    )
  }
  return resolved
}

function inputSchemaOf(openapi: Record<string, unknown>): JsonSchema {
  const components = openapi.components as { schemas?: Record<string, JsonSchema> } | undefined
  const fromComponent = components?.schemas?.Input ?? components?.schemas?.input
  if (fromComponent?.properties) return fromComponent

  const paths = openapi.paths as Record<
    string,
    Record<string, { requestBody?: { content?: Record<string, { schema?: JsonSchema }> } }>
  > | undefined
  if (!paths) return { properties: {}, required: [] }

  for (const methods of Object.values(paths)) {
    for (const op of Object.values(methods)) {
      const schema = op.requestBody?.content?.['application/json']?.schema
      if (schema?.$ref && components?.schemas) {
        const name = schema.$ref.split('/').pop()
        const resolved = name ? components.schemas[name] : undefined
        if (resolved?.properties) return resolved
      }
      if (schema?.properties) return schema
    }
  }
  return { properties: {}, required: [] }
}

export async function getOpenApiSchema(endpoint: string, fetchImpl: typeof fetch = fetch): Promise<OpenApiSchema> {
  const cached = schemaCache.get(endpoint)
  if (cached) return cached

  const res = await fetchImpl(
    `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`,
  )
  if (!res.ok) {
    throw new PayloadError(`OpenAPI fetch for '${endpoint}' returned ${res.status}`)
  }
  const doc = await res.json() as Record<string, unknown>
  const input = inputSchemaOf(doc)
  const props = input.properties ?? {}
  const enums: OpenApiSchema['enums'] = {}
  for (const [key, value] of Object.entries(props)) {
    if (value.enum?.length) enums[key] = value.enum
  }
  const properties = Object.keys(props)
  const videoField = ['video_url', 'source_video', 'video', 'input_video_url'].find((key) => properties.includes(key))
  const schema: OpenApiSchema = {
    endpoint,
    required: input.required ?? [],
    properties,
    enums,
    videoField,
  }
  schemaCache.set(endpoint, schema)
  return schema
}

export function setDuration(
  payload: Record<string, unknown>,
  spec: FamilyFieldMap['duration'],
  durationSec: number,
): void {
  if (spec.kind === 'string_s') {
    payload[spec.field] = `${durationSec}s`
    return
  }
  if (spec.kind === 'number') {
    let value = durationSec
    if (spec.min != null) value = Math.max(spec.min, value)
    if (spec.max != null) value = Math.min(spec.max, value)
    payload[spec.field] = value
    return
  }
  if (spec.kind === 'frames') {
    const fps = 24
    payload[spec.field] = Math.round(durationSec * fps)
    payload.frames_per_second = fps
    return
  }
  if (spec.kind === 'range' && spec.min != null && spec.max != null) {
    const rounded = Math.round(durationSec)
    const bounded = Math.min(spec.max, Math.max(spec.min, rounded))
    const asString = typeof spec.values?.[0] === 'string'
    payload[spec.field] = asString ? String(bounded) : bounded
    return
  }
  const values = spec.values ?? []
  if (!values.length) return
  const picked = values.reduce((best, next) =>
    Math.abs(Number(next) - durationSec) < Math.abs(Number(best) - durationSec) ? next : best,
  )
  payload[spec.field] = picked
}

export function setAudio(payload: Record<string, unknown>, audio: FamilyFieldMap['audio']): void {
  if (audio.kind === 'native_always') return
  payload[audio.field] = true
}

export function setResAspect(
  payload: Record<string, unknown>,
  fields: FamilyFieldMap,
  shot: ModeShot,
): void {
  if (fields.resolution) {
    const allowed = fields.resolution.values
    const want = shot.resolution
    payload[fields.resolution.field] = want && allowed.includes(want) ? want : allowed[0]
  }
  if (fields.aspect) {
    const allowed = fields.aspect.values
    const want = shot.aspectRatio
    payload[fields.aspect.field] = want && allowed.includes(want) ? want : allowed[0]
  }
}

export function applySchema(payload: Record<string, unknown>, schema: OpenApiSchema): void {
  const allowed = new Set(schema.properties)
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) delete payload[key]
  }
  for (const [field, values] of Object.entries(schema.enums)) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue
    payload[field] = snapEnum(field, payload[field], values, schema.endpoint)
  }
  const missing = schema.required.filter((field) => {
    const value = payload[field]
    return value == null || value === ''
  })
  if (missing.length) {
    throw new PayloadError(
      `Payload for '${schema.endpoint}' is missing required field ${missing.map((field) => `'${field}'`).join(', ')}`,
    )
  }
}

export function resolveShotRefs(shot: ModeShot): string[] {
  const explicit = (shot.referenceUrls ?? []).map((url) => url.trim()).filter(Boolean)
  if (explicit.length) return explicit
  const urls: string[] = []
  for (const character of shot.characters ?? []) {
    const url = character.referenceImageUrl?.trim()
    if (url) urls.push(url)
  }
  const plate = shot.location?.plateUrl?.trim()
  if (plate) urls.push(plate)
  return urls
}

export function applyReferences(
  payload: Record<string, unknown>,
  model: ModeModel,
  shot: ModeShot,
): void {
  const refs = resolveShotRefs(shot)
  const spec = model.fields.references
  const capped = refs.slice(0, spec.max)
  if (spec.mode === 'field' && spec.field) payload[spec.field] = capped
  if (spec.mode === 'array') payload[spec.field ?? 'reference_images'] = capped
  if (spec.mode === 'prompt_tag') payload._refFiles = capped
}

function injectRefTags(core: string, shot: ModeShot, tag: '@' | '#' | undefined): string {
  const refs = resolveShotRefs(shot)
  if (!refs.length) return core
  const tags = refs.map((_, index) => (tag === '#' ? `#${index + 1}` : `@Image${index + 1}`))
  return `${tags.join(' ')} ${core}`.trim()
}

/** Instant genre preset: prompt look + grade + grain + pacing. Empty when unset. */
export function styleFragment(shot: ModeShot, _model: ModeModel): string {
  return genreStyleFragment(shot.genrePresetId)
}

function capToLength(core: string, camera: string | undefined, style: string | undefined, max: number): string {
  let result = core.trim()
  if (result.length > max) return capPromptText(result, max)
  for (const extra of [camera, style]) {
    const piece = extra?.trim()
    if (!piece) continue
    const candidate = result ? `${result} ${piece}` : piece
    if (candidate.length <= max) {
      result = candidate
      continue
    }
    const room = max - result.length - 1
    if (room >= 24) {
      const trimmed = capPromptText(piece, room)
      if (trimmed) result = `${result} ${trimmed}`
    }
    break
  }
  return result.trim()
}

export function composePrompt(model: ModeModel, shot: ModeShot, mode: Mode): string {
  const raw = shot.prompt?.trim() ?? ''
  if (!raw) throw new PayloadError('shot has no prompt')
  const core = mode === 'reference' && model.fields.references.mode === 'prompt_tag'
    ? injectRefTags(raw, shot, model.fields.references.tag)
    : raw
  const camera = cameraSentence(shot.camera)
  const style = [styleFragment(shot, model), shot.playbookFragment].filter(Boolean).join(' ')
  return capToLength(core, camera, style || undefined, model.limits.maxPromptChars)
}

export async function buildModePayload(
  model: ModeModel,
  shot: ModeShot,
  pool: ModeModel[],
): Promise<{ endpoint: string; payload: Record<string, unknown> }> {
  const resolved = resolveEndpoint(model, shot, pool)
  const active = resolved.model
  const fields = active.fields
  const schema = await getOpenApiSchema(resolved.endpoint)
  const payload: Record<string, unknown> = {
    prompt: composePrompt(active, shot, resolved.mode),
  }
  if (resolved.mode === 'reference') applyReferences(payload, active, shot)
  if ((resolved.mode === 'first_frame' || resolved.mode === 'first_last') && shot.anchorFrameUrl) {
    const key = fields.firstFrameForLast && resolved.mode === 'first_last'
      ? fields.firstFrameForLast
      : fields.firstFrame
    payload[key] = shot.anchorFrameUrl
  }
  if (resolved.mode === 'first_last' && fields.lastFrame && shot.endFrameUrl) {
    payload[fields.lastFrame] = shot.endFrameUrl
  }
  if (resolved.mode === 'video_edit') {
    payload[schema.videoField ?? 'source_video'] = shot.sourceVideoUrl
  }
  if (shot.durationSec != null) setDuration(payload, fields.duration, shot.durationSec)
  if (shot.audioWanted !== false) setAudio(payload, fields.audio)
  setResAspect(payload, fields, shot)
  applySchema(payload, schema)
  return { endpoint: resolved.endpoint, payload }
}
