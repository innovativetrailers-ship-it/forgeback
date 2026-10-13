#!/usr/bin/env npx tsx
/**
 * Pre/post deploy health — OpenAPI schema fetch + buildPayload validation only.
 * NO generation submits. NO billable FAL/Runway/xAI calls.
 */
import { buildPayload } from '../src/lib/fal/videoPayloadAdapters'
import {
  listRegistryVideoEndpoints,
  SAMPLE_SHOT,
  type PayloadProbeResult,
} from '../src/lib/fal/registryProbe'

function keyPresence(): Record<string, boolean> {
  return {
    FAL_KEY: Boolean(process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim()),
    RUNWAYML_API_SECRET: Boolean(
      process.env.RUNWAYML_API_SECRET?.trim() || process.env.RUNWAY_API_KEY?.trim(),
    ),
    XAI_API_KEY: Boolean(process.env.XAI_API_KEY?.trim()),
    ELEVENLABS_API_KEY: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    REPLICATE_API_TOKEN: Boolean(process.env.REPLICATE_API_TOKEN?.trim()),
  }
}

function inputSchemaRequired(openapi: Record<string, unknown>): string[] {
  const components = openapi.components as { schemas?: Record<string, { required?: string[] }> } | undefined
  const input = components?.schemas?.Input ?? components?.schemas?.input
  return input?.required ?? []
}

async function schemaAlive(endpoint: string): Promise<boolean> {
  const res = await fetch(
    `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`,
    { signal: AbortSignal.timeout(15_000) },
  )
  return res.ok
}

async function validatePayload(
  endpoint: string,
  registryKey: string,
  mode: 't2v' | 'i2v',
): Promise<PayloadProbeResult> {
  try {
    const sample = await buildPayload(endpoint, registryKey, {
      prompt: SAMPLE_SHOT.prompt,
      duration: SAMPLE_SHOT.duration,
      aspectRatio: SAMPLE_SHOT.aspectRatio,
      imageUrl: mode === 'i2v' ? SAMPLE_SHOT.imageUrl : undefined,
      audioPolicy: 'elevenlabs',
    })

    const schemaRes = await fetch(
      `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`,
      { signal: AbortSignal.timeout(15_000) },
    )
    const required = schemaRes.ok
      ? inputSchemaRequired((await schemaRes.json()) as Record<string, unknown>)
      : []
    const missing = required.filter((k) => !(k in sample))
    if (missing.length) {
      return { id: endpoint, registryKey, status: 'MISSING_FIELDS', missing }
    }
    return { id: endpoint, registryKey, status: 'OK' }
  } catch (err) {
    return {
      id: endpoint,
      registryKey,
      status: 'BUILD_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main(): Promise<void> {
  const keys = keyPresence()
  console.log('key_presence', keys)

  const endpoints = listRegistryVideoEndpoints()
  const health: Array<{ endpoint: string; schema: 'OK' | 'FAILED' }> = []
  const payloadIssues: PayloadProbeResult[] = []

  for (const entry of endpoints) {
    const ok = await schemaAlive(entry.endpoint)
    health.push({ endpoint: entry.endpoint, schema: ok ? 'OK' : 'FAILED' })
    if (ok) {
      const payload = await validatePayload(entry.endpoint, entry.registryKey, entry.mode)
      if (payload.status !== 'OK' && payload.status !== 'SKIP') {
        payloadIssues.push(payload)
      }
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  const alive = health.filter((h) => h.schema === 'OK').length
  const dead = health.filter((h) => h.schema === 'FAILED')

  console.log('endpoint_health', {
    total: health.length,
    alive,
    dead: dead.map((d) => d.endpoint),
  })

  if (payloadIssues.length) {
    console.log('payload_validation_issues', payloadIssues)
  } else {
    console.log('payload_validation', 'all OK')
  }

  console.log('billed_generation_submits', 0)
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
