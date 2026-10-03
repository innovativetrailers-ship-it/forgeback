/**
 * Deep FAL registry probes — existence via stored execution result + payload contract.
 */

import { buildPayload } from '@/lib/fal/videoPayloadAdapters'
import {
  listAllFalEndpointIds,
  VIDEO_MODEL_REGISTRY,
} from '@/lib/models/registry'
import { normaliseModelId } from '@/lib/models/normaliseId'

export interface RegistryVideoEntry {
  registryKey: string
  endpoint: string
  mode: 't2v' | 'i2v'
}

export const SAMPLE_SHOT = {
  prompt: 'A cinematic probe shot of a city skyline at dusk',
  duration: 5,
  aspectRatio: '16:9' as const,
  imageUrl: 'https://storage.googleapis.com/falserverless/model_tests/video_models/wan_i2v_input.jpg',
}

function preferRegistryKey(candidate: string, incumbent: string, endpoint: string): string {
  if (endpoint.startsWith('wan/v2.6')) {
    if (candidate === 'wan-2.6') return candidate
    if (incumbent === 'wan-2.6') return incumbent
  }
  if (endpoint.includes('luma-dream-machine') || endpoint.includes('luma/ray')) {
    if (candidate === 'luma-ray3') return candidate
    if (incumbent === 'luma-ray3') return incumbent
  }
  return incumbent
}

function registryKeyForEndpoint(endpoint: string, mode: 't2v' | 'i2v'): string | undefined {
  for (const [key, entry] of Object.entries(VIDEO_MODEL_REGISTRY)) {
    if (entry.isExternal) continue
    if (mode === 'i2v' && entry.i2vEndpoint === endpoint) return key
    if (mode === 't2v' && entry.falEndpoint === endpoint) return key
  }
  return undefined
}

/** Video endpoints from registry — one row per unique endpoint. */
export function listRegistryVideoEndpoints(): RegistryVideoEntry[] {
  const byEndpoint = new Map<string, RegistryVideoEntry>()

  for (const [registryKey, entry] of Object.entries(VIDEO_MODEL_REGISTRY)) {
    if (entry.isExternal) continue
    for (const mode of ['t2v', 'i2v'] as const) {
      const endpoint = mode === 'i2v' ? entry.i2vEndpoint : entry.falEndpoint
      if (!endpoint) continue

      const existing = byEndpoint.get(endpoint)
      if (!existing) {
        byEndpoint.set(endpoint, { registryKey, endpoint, mode })
        continue
      }
      const preferred = preferRegistryKey(registryKey, existing.registryKey, endpoint)
      if (preferred !== existing.registryKey) {
        byEndpoint.set(endpoint, { registryKey: preferred, endpoint, mode })
      }
    }
  }

  return [...byEndpoint.values()].sort((a, b) => a.endpoint.localeCompare(b.endpoint))
}

export interface ExistenceProbeResult {
  id: string
  alive: boolean
  http?: number
  status: 'EXISTS' | 'DEAD' | 'DEPRECATED' | 'AUTH_ERROR' | 'NETWORK_ERROR' | 'UNKNOWN'
  detail?: unknown
  code?: number
}

export interface PayloadProbeResult {
  id: string
  registryKey?: string
  status: 'OK' | 'MISSING_FIELDS' | 'BUILD_ERROR' | 'SKIP'
  missing?: string[]
  detail?: string
}

export interface RegistryCorrections {
  probedAt: string
  existence: ExistenceProbeResult[]
  schemas: PayloadProbeResult[]
  summary: { alive: number; dead: number; payloadIssues: number }
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }
}

function isNotFoundBody(body: unknown): boolean {
  const text = JSON.stringify(body ?? '').toLowerCase()
  return text.includes('not found') || (text.includes('path /') && text.includes('not found'))
}

async function pollStatusUrl(statusUrl: string, key: string, maxMs = 45_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const res = await fetch(statusUrl, { headers: authHeaders(key) })
    if (!res.ok) continue
    const body = await res.json() as Record<string, unknown>
    const status = String(body.status ?? '')
    if (status === 'COMPLETED' || status === 'FAILED') return body
  }
  return { status: 'TIMEOUT' }
}

function billableFalProbeAllowed(): boolean {
  return process.env.ALLOW_BILLABLE_FAL_PROBE === 'true' && process.env.NODE_ENV !== 'production'
}

async function probeExistenceViaOpenApi(endpoint: string): Promise<ExistenceProbeResult> {
  const url = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`
  const res = await fetch(url)
  if (res.status === 200) return { id: endpoint, alive: true, http: 200, status: 'EXISTS' }
  if (res.status === 404) return { id: endpoint, alive: false, http: 404, status: 'DEAD', code: 404 }
  return { id: endpoint, alive: false, http: res.status, status: 'UNKNOWN', code: res.status }
}

/** Free OpenAPI existence check. Queue POST only behind ALLOW_BILLABLE_FAL_PROBE. */
export async function probeEndpointExistence(
  endpoint: string,
  falKey: string,
): Promise<ExistenceProbeResult> {
  if (!billableFalProbeAllowed()) return probeExistenceViaOpenApi(endpoint)

  const id = endpoint
  try {
    const { billableFalQueueProbe } = await import('@/lib/fal/falQueue')
    const sub = await billableFalQueueProbe(endpoint, falKey)
    const subBody = await sub.json().catch((err) => {
      console.warn("[caught] src/lib/fal/registryProbe.ts:140", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({}))
    }) as Record<string, unknown>
    let http = sub.status

    if (sub.status === 404) {
      return { id, alive: false, http, status: 'DEAD', code: 404, detail: subBody.detail }
    }
    if (sub.status === 401 || sub.status === 403) {
      return { id, alive: false, http, status: 'AUTH_ERROR', code: sub.status, detail: subBody.detail }
    }
    if (sub.status === 422 || sub.status === 400) {
      return { id, alive: true, http, status: 'EXISTS', code: sub.status, detail: 'validation rejected (expected)' }
    }

    const statusUrl = subBody.status_url as string | undefined
    if (statusUrl) {
      const polled = await pollStatusUrl(statusUrl, falKey)
      const responseUrl = subBody.response_url as string | undefined
      if (responseUrl && polled.status === 'COMPLETED') {
        const resultRes = await fetch(responseUrl, { headers: authHeaders(falKey) })
        const resultBody = await resultRes.json().catch((err) => {
          console.warn("[caught] src/lib/fal/registryProbe.ts:159", err instanceof Error ? { name: err.name, message: err.message } : err)
          return (({}))
        })
        http = resultRes.status
        if (resultRes.status === 404 || isNotFoundBody(resultBody)) {
          return { id, alive: false, http, status: 'DEAD', code: resultRes.status, detail: resultBody }
        }
        return { id, alive: true, http, status: 'EXISTS', detail: 'completed with result' }
      }
      if (polled.status === 'FAILED') {
        const err = polled.error ?? polled
        if (isNotFoundBody(err)) {
          return { id, alive: false, status: 'DEAD', detail: err }
        }
        return { id, alive: true, status: 'EXISTS', detail: 'failed validation (expected)' }
      }
      return { id, alive: true, status: 'EXISTS', detail: polled.status }
    }

    if (isNotFoundBody(subBody.detail)) {
      return { id, alive: false, http, status: 'DEAD', detail: subBody.detail }
    }
    return { id, alive: true, http, status: 'EXISTS', detail: subBody }
  } catch (err) {
    console.warn("[caught] src/lib/fal/registryProbe.ts:180", err instanceof Error ? { name: err.name, message: err.message } : err)

    return {
      id,
      alive: false,
      status: 'NETWORK_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

function inputSchemaRequired(openapi: Record<string, unknown>): string[] {
  const paths = openapi.paths as Record<string, Record<string, { requestBody?: { content?: Record<string, { schema?: { required?: string[] } }> } }>> | undefined
  if (!paths) return []
  for (const methods of Object.values(paths)) {
    for (const op of Object.values(methods)) {
      const schema = op.requestBody?.content?.['application/json']?.schema
      if (schema?.required?.length) return schema.required
    }
  }
  const components = openapi.components as { schemas?: Record<string, { required?: string[] }> } | undefined
  const input = components?.schemas?.Input ?? components?.schemas?.input
  return input?.required ?? []
}

function isVideoEndpoint(endpoint: string): boolean {
  return endpoint.includes('text-to-video')
    || endpoint.includes('image-to-video')
    || endpoint.includes('dream-machine')
}

/** OpenAPI required fields vs buildPayload — video endpoints only. */
export async function probePayloadContract(
  endpoint: string,
  registryKey?: string,
): Promise<PayloadProbeResult> {
  if (!isVideoEndpoint(endpoint)) {
    return { id: endpoint, status: 'SKIP' }
  }

  const mode = endpoint.includes('image-to-video') ? 'i2v' as const : 't2v' as const
  const key = registryKey
    ?? registryKeyForEndpoint(endpoint, mode)
    ?? normaliseModelId(endpoint.split('/').pop() ?? 'unknown')

  try {
    const intent = {
      prompt: SAMPLE_SHOT.prompt,
      duration: SAMPLE_SHOT.duration,
      aspectRatio: SAMPLE_SHOT.aspectRatio,
      imageUrl: mode === 'i2v' ? SAMPLE_SHOT.imageUrl : undefined,
      audioPolicy: 'elevenlabs' as const,
    }
    const sample = await buildPayload(endpoint, key, intent)

    let required: string[] = []
    try {
      const schemaRes = await fetch(
        `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`,
      )
      if (schemaRes.ok) {
        const openapi = await schemaRes.json() as Record<string, unknown>
        required = inputSchemaRequired(openapi)
      }
    } catch (err) {
      console.warn("[caught] src/lib/fal/registryProbe.ts:243", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ }

    const missing = required.filter((k) => !(k in sample))
    if (missing.length) {
      return { id: endpoint, registryKey: key, status: 'MISSING_FIELDS', missing }
    }
    return { id: endpoint, registryKey: key, status: 'OK' }
  } catch (err) {
    console.warn("[caught] src/lib/fal/registryProbe.ts:250", err instanceof Error ? { name: err.name, message: err.message } : err)

    return {
      id: endpoint,
      registryKey: key,
      status: 'BUILD_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Probe every endpoint in the canonical registry. */
export async function probeAllFalEndpoints(
  falKey: string,
  options?: { endpointFilter?: string[]; skipSchema?: boolean },
): Promise<RegistryCorrections> {
  const ids = (options?.endpointFilter?.length
    ? listAllFalEndpointIds().filter((id) => options.endpointFilter!.includes(id))
    : listAllFalEndpointIds()
  )

  const existence: ExistenceProbeResult[] = []
  for (const id of ids) {
    existence.push(await probeEndpointExistence(id, falKey))
    await new Promise((r) => setTimeout(r, 250))
  }

  const schemas: PayloadProbeResult[] = []
  if (!options?.skipSchema) {
    for (const e of existence.filter((x) => x.alive)) {
      schemas.push(await probePayloadContract(e.id))
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  const dead = existence.filter((e) => !e.alive)
  const payloadIssues = schemas.filter((s) => s.status === 'MISSING_FIELDS' || s.status === 'BUILD_ERROR')

  return {
    probedAt: new Date().toISOString(),
    existence,
    schemas,
    summary: {
      alive: existence.filter((e) => e.alive).length,
      dead: dead.length,
      payloadIssues: payloadIssues.length,
    },
  }
}

/** @deprecated Use probeAllFalEndpoints */
export async function probeRegistry(
  falKey: string,
  options?: { existenceOnly?: boolean; endpoints?: string[] },
): Promise<{ existence: Array<{ endpoint: string; status: string; detail?: unknown }>; payloads: PayloadProbeResult[] }> {
  const result = await probeAllFalEndpoints(falKey, {
    endpointFilter: options?.endpoints,
    skipSchema: options?.existenceOnly,
  })
  return {
    existence: result.existence.map((e) => ({
      endpoint: e.id,
      status: e.alive ? 'EXISTS' : 'DEAD',
      detail: e.detail,
    })),
    payloads: result.schemas,
  }
}
