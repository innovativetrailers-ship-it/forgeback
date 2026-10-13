// Build correct FAL payloads by inspecting each model's input schema, so a model
// that expects `aspect_ratio` vs `ratio` vs `resolution` never silently fails when
// FAL changes a param name.

import { getFalKey } from '@/lib/config/keys'

interface ModelSchema {
  input?: { properties?: Record<string, unknown> }
}

interface CachedSchema {
  schema: ModelSchema | null
  fetchedAt: number
}

const schemaCache = new Map<string, CachedSchema>()
const SCHEMA_TTL = 3_600_000 // 1 hour

async function getModelSchema(falModelId: string): Promise<ModelSchema | null> {
  const cached = schemaCache.get(falModelId)
  if (cached && Date.now() - cached.fetchedAt < SCHEMA_TTL) return cached.schema

  try {
    const res = await fetch(`https://fal.run/${falModelId}/schema`, {
      headers: { Authorization: `Key ${getFalKey()}` },
      signal:  AbortSignal.timeout(4_000), // never let a schema lookup stall a render
    })
    const schema = res.ok ? ((await res.json()) as ModelSchema) : null
    schemaCache.set(falModelId, { schema, fetchedAt: Date.now() })
    return schema
  } catch (err) {
    console.warn("[caught] src/lib/cognition/routing/schemaPayload.ts:31", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null // fall back to default payload if schema unavailable
  }
}

export interface PayloadIntent {
  prompt: string
  duration: number
  imageUrl?: string
  referenceUrl?: string
}

export async function buildCognitionPayload(
  falModelId: string,
  intent: PayloadIntent,
): Promise<Record<string, unknown>> {
  if (!intent?.prompt?.trim()) {
    throw new Error('Prompt is required for video generation')
  }

  const schema = await getModelSchema(falModelId)

  const base: Record<string, unknown> = {
    prompt: intent.prompt.trim(),
    duration: intent.duration,
    aspect_ratio: '16:9',
    resolution: '1080p',
  }
  if (intent.imageUrl) base.image_url = intent.imageUrl
  if (intent.referenceUrl) base.reference_image_url = intent.referenceUrl

  const props = schema?.input?.properties
  if (!props) return base

  const has = (k: string): boolean => k in props
  const payload: Record<string, unknown> = {}

  const promptKey = ['prompt', 'text', 'prompt_text'].find(has) ?? 'prompt'
  payload[promptKey] = intent.prompt

  if (has('duration')) payload.duration = intent.duration
  else if (has('seconds')) payload.seconds = intent.duration
  else if (has('video_length')) payload.video_length = intent.duration

  if (has('aspect_ratio')) payload.aspect_ratio = '16:9'
  else if (has('ratio')) payload.ratio = '16:9'

  if (has('resolution')) payload.resolution = '1080p'

  if (intent.imageUrl) {
    const imgKey = ['image_url', 'image', 'init_image', 'start_image'].find(has)
    if (imgKey) payload[imgKey] = intent.imageUrl
  }

  if (intent.referenceUrl) {
    const refKey = ['reference_image_url', 'ref_image', 'subject_reference'].find(has)
    if (refKey) payload[refKey] = intent.referenceUrl
  }

  return Object.keys(payload).length ? payload : base
}
