import { logCaught } from '@/lib/diagnostics/caught'
/**
 * Schema-sync engine — payloads self-correct from FAL OpenAPI constraints.
 */

import { createHash } from 'node:crypto'
import type { Prisma } from '@/generated/prisma/client'
import { getFalKey } from '@/lib/config/keys'
import { db } from '@/lib/db'
import { falLog } from '@/lib/fal/falQueue'
import { probeEndpointExistence } from '@/lib/fal/registryProbe'
import { AUDIO_TOGGLE_FIELDS, buildPayload as buildPayloadFromConstraints, durationEnumFromConstraint, familyDurationConstraint, logPayloadClamp, maxPromptCharsForEndpoint } from '@cinema/core'
import { VIDEO_MODEL_REGISTRY } from '@/lib/models/registry'

const CONSTRAINT_TTL_MS = 24 * 3600_000

const CANDIDATE_FORBIDDEN = [
  'duration',
  'resolution',
  'aspect_ratio',
  'image_url',
  'num_frames',
  'seconds',
  'video_length',
] as const

export class NoSchemaError extends Error {
  constructor(endpoint: string) {
    super(`No FAL schema available for ${endpoint}`)
    this.name = 'NoSchemaError'
  }
}

export class PayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayloadError'
  }
}

export interface ModelConstraints {
  endpoint: string
  required: string[]
  forbidden: string[]
  enums: Record<string, (string | number)[]>
  types: Record<string, 'string' | 'number' | 'boolean'>
  properties: string[]
  maxLengths?: Record<string, number>
  fetchedAt: number
  schemaHash: string
}

export interface SchemaShotIntent {
  prompt: string
  duration: number
  aspectRatio?: string
  resolution?: string
  anchorUrl?: string
  imageUrl?: string
  negativePrompt?: string
  quality?: string
  seed?: number
  shotIndex?: number
  characterLora?: import('@cinema/core').LoraAssetRef
  styleLora?: import('@cinema/core').LoraAssetRef
  audioLora?: import('@cinema/core').LoraAssetRef
}

type JsonSchema = {
  type?: string
  enum?: (string | number)[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  maxLength?: number
  $ref?: string
}

/** Schema maxLength wins. Kling and Wan fall back when a cached row has none. */
export function promptCharLimit(
  constraints: { maxLengths?: Record<string, number> } | null | undefined,
  endpoint: string,
): number | undefined {
  const lengths = constraints?.maxLengths
  const fromSchema = lengths?.prompt ?? lengths?.text ?? lengths?.prompt_text
  return maxPromptCharsForEndpoint(endpoint, fromSchema)
}

function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

function inputSchemaOf(openapi: Record<string, unknown>): JsonSchema {
  const components = openapi.components as { schemas?: Record<string, JsonSchema> } | undefined
  const fromComponent = components?.schemas?.Input ?? components?.schemas?.input
  if (fromComponent?.properties) return fromComponent

  const paths = openapi.paths as Record<
    string,
    Record<string, { requestBody?: { content?: Record<string, { schema?: JsonSchema }> } }>
  > | undefined

  if (paths) {
    for (const methods of Object.values(paths)) {
      for (const op of Object.values(methods)) {
        const schema = op.requestBody?.content?.['application/json']?.schema
        if (schema?.$ref && components?.schemas) {
          const name = schema.$ref.split('/').pop()!
          const resolved = components.schemas[name]
          if (resolved?.properties) return resolved
        }
        if (schema?.properties) return schema
      }
    }
  }

  return { properties: {}, required: [] }
}

export async function fetchConstraints(endpoint: string): Promise<ModelConstraints> {
  const res = await fetch(
    `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`,
    { headers: { Authorization: `Key ${getFalKey()}` } },
  )
  if (!res.ok) {
    throw new NoSchemaError(`${endpoint} (HTTP ${res.status})`)
  }

  const schema = await res.json() as Record<string, unknown>
  const input = inputSchemaOf(schema)
  const props = input.properties ?? {}
  const enums: ModelConstraints['enums'] = {}
  const types: ModelConstraints['types'] = {}
  const maxLengths: Record<string, number> = {}

  for (const [k, v] of Object.entries(props)) {
    if (v.enum?.length) enums[k] = v.enum
    if (v.type) {
      types[k] = v.type === 'integer' ? 'number' : (v.type as 'string' | 'boolean')
    }
    if (typeof v.maxLength === 'number' && v.maxLength > 0) maxLengths[k] = v.maxLength
  }

  const known = new Set(Object.keys(props))
  const forbidden = CANDIDATE_FORBIDDEN.filter((k) => !known.has(k))

  return {
    endpoint,
    required: input.required ?? [],
    forbidden,
    enums,
    types,
    properties: [...known],
    maxLengths,
    fetchedAt: Date.now(),
    schemaHash: sha1(JSON.stringify(input)),
  }
}

async function readStoredConstraints(endpoint: string): Promise<ModelConstraints | null> {
  const row = await db.modelConstraint.findUnique({ where: { endpoint } })
  if (!row) return null
  return row.json as unknown as ModelConstraints
}

export async function upsertConstraints(constraints: ModelConstraints): Promise<void> {
  const json = constraints as unknown as Prisma.InputJsonValue
  await db.modelConstraint.upsert({
    where: { endpoint: constraints.endpoint },
    create: {
      endpoint: constraints.endpoint,
      json,
      schemaHash: constraints.schemaHash,
      fetchedAt: new Date(constraints.fetchedAt),
    },
    update: {
      json,
      schemaHash: constraints.schemaHash,
      fetchedAt: new Date(constraints.fetchedAt),
    },
  })
}

function reconcileDuration(endpoint: string, constraints: ModelConstraints): ModelConstraints {
  const constraint = familyDurationConstraint(endpoint)
  if (!constraint) return constraints
  return {
    ...constraints,
    enums: { ...constraints.enums, duration: durationEnumFromConstraint(constraint) },
  }
}

export async function getConstraints(endpoint: string): Promise<ModelConstraints> {
  const row = await readStoredConstraints(endpoint)
  if (row && Date.now() - row.fetchedAt < CONSTRAINT_TTL_MS) return reconcileDuration(endpoint, row)

  const fresh = await fetchConstraints(endpoint).catch((err) => {
    console.warn("[caught] src/lib/fal/schemaSync.ts:196", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (row)
  })
  if (fresh) await upsertConstraints(fresh)
  if (!fresh) throw new NoSchemaError(endpoint)
  return reconcileDuration(endpoint, fresh)
}

/** Bypass TTL — used after 422 validation or nightly drift refresh. */
export async function forceRefreshConstraints(endpoint: string): Promise<ModelConstraints> {
  const fresh = await fetchConstraints(endpoint)
  await upsertConstraints(fresh)
  return reconcileDuration(endpoint, fresh)
}

export async function assemblePayload(
  endpoint: string,
  shot: SchemaShotIntent,
): Promise<Record<string, unknown>> {
  const stored = await getConstraints(endpoint)
  const durationConstraint = familyDurationConstraint(endpoint) ?? undefined
  const enums = { ...stored.enums }
  if (durationConstraint) delete enums.duration
  const audioField = AUDIO_TOGGLE_FIELDS.find((field) => stored.properties?.includes(field)) ?? null
  const maxPromptChars = promptCharLimit(stored, endpoint)
  return buildPayloadFromConstraints(endpoint, shot, {
    endpoint: stored.endpoint,
    required: stored.required,
    forbidden: stored.forbidden,
    enums,
    types: stored.types,
    audioField,
    schemaHash: stored.schemaHash,
    fetchedAt: stored.fetchedAt,
    properties: stored.properties,
    maxPromptChars,
  }, {
    onClamp: (field, want, picked, clampedEndpoint) => {
      if (field === 'prompt') {
        falLog('info', 'prompt_truncated', { endpoint, original: want, final: picked })
        return
      }
      if (field === 'duration') {
        logPayloadClamp(field, want, picked, clampedEndpoint || endpoint, shot.shotIndex)
        return
      }
      falLog('info', 'schema_clamp', { endpoint, field, want, picked })
    },
    onAudioDisabled: (field) => {
      falLog('info', 'audio_disabled', { endpoint, field, model: endpoint })
    },
    nativeAudio: endpoint.includes('grok-imagine-video'),
    durationConstraint,
  })
}

export interface DriftRow {
  endpoint: string
  status: 'ok' | 'DEAD' | 'SCHEMA_CHANGED'
  newRequired: string[] | null
  schemaHash?: string
}

function diffRequired(before: string[], after: string[]): string[] {
  const prev = new Set(before)
  return after.filter((k) => !prev.has(k))
}

export async function endpointDrift(falKey?: string): Promise<DriftRow[]> {
  const key = falKey ?? getFalKey()
  const rows: DriftRow[] = []

  for (const entry of Object.values(VIDEO_MODEL_REGISTRY)) {
    if (entry.isExternal) continue
    const endpoints = [entry.falEndpoint, entry.i2vEndpoint, entry.referenceEndpoint].filter(
      (e): e is string => Boolean(e),
    )
    const seen = new Set<string>()

    for (const endpoint of endpoints) {
      if (seen.has(endpoint)) continue
      seen.add(endpoint)

      const live = await probeEndpointExistence(endpoint, key)
      const stored = await readStoredConstraints(endpoint)
      let fresh: ModelConstraints | null = null

      try {
        fresh = await fetchConstraints(endpoint)
        await upsertConstraints(fresh)
      } catch (err) {
        console.warn("[caught] src/lib/fal/schemaSync.ts:284", err instanceof Error ? { name: err.name, message: err.message } : err)

        fresh = null
      }

      const status: DriftRow['status'] = !live.alive
        ? 'DEAD'
        : fresh && stored && fresh.schemaHash !== stored.schemaHash
          ? 'SCHEMA_CHANGED'
          : 'ok'

      rows.push({
        endpoint,
        status,
        newRequired:
          fresh && stored ? diffRequired(stored.required, fresh.required) : null,
        schemaHash: fresh?.schemaHash,
      })
    }
  }

  const problems = rows.filter((r) => r.status !== 'ok')
  if (problems.length) {
    falLog('error', 'endpoint_drift', { problems })
  }

  return rows
}

/** Worker boot — refresh stale constraints in background. */
export async function refreshStaleConstraints(endpoints: string[]): Promise<void> {
  const stale = await Promise.all(
    endpoints.map(async (endpoint) => {
      const row = await readStoredConstraints(endpoint)
      if (!row || Date.now() - row.fetchedAt >= CONSTRAINT_TTL_MS) return endpoint
      return null
    }),
  )

  for (const endpoint of stale.filter((e): e is string => Boolean(e))) {
    fetchConstraints(endpoint)
      .then((c) => upsertConstraints(c))
      .catch((err) => logCaught('lib/fal/schemaSync', err))
  }
}
