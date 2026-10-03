import { IMAGE_REF_CAP, capPromptText, maxPromptCharsForEndpoint } from '@cinema/core'
import { db } from '@/lib/db'

const REF_KEYS = [
  'image_urls',
  'image_url',
  'elements',
  'reference_image_urls',
  'reference_images',
  'input_images',
  'images',
]

function trimRefs(input: Record<string, unknown>, max = 12): Record<string, unknown> {
  const cap = Math.min(max, IMAGE_REF_CAP)
  const next = { ...input }
  for (const key of REF_KEYS) {
    const value = next[key]
    if (Array.isArray(value) && value.length > cap) next[key] = value.slice(0, cap)
  }
  return next
}

function clampDuration(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input }
  const raw = next.duration
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return next
  next.duration = Math.max(2, Math.min(10, Math.round(n)))
  return next
}

function capPrompt(input: Record<string, unknown>, endpoint: string): Record<string, unknown> {
  const prompt = input.prompt
  if (typeof prompt !== 'string') return input
  const max = maxPromptCharsForEndpoint(endpoint) ?? 2000
  return { ...input, prompt: capPromptText(prompt, max) }
}

/** Apply stored correctable lessons for this endpoint before the next submit. */
export async function applyErrorCorrections(
  endpoint: string,
  input: Record<string, unknown>,
  model?: string,
): Promise<Record<string, unknown>> {
  const where = model
    ? { OR: [{ endpoint }, { model }], category: 'payload_over_limit', correctable: true }
    : { endpoint, category: 'payload_over_limit', correctable: true }
  const recent = await db.shotError.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
    select: { correction: true },
  }).catch((err) => {
    console.warn("[caught] src/lib/diagnostics/correct.ts:53", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  if (!recent) return input
  return clampDuration(capPrompt(trimRefs(input), endpoint))
}

export async function applyCorrectionToClip(shotId: string, correction?: string | null): Promise<void> {
  const clip = await db.studioClip.findUnique({ where: { id: shotId } })
  if (!clip) return
  const data: { prompt?: string; duration?: number } = {}
  const text = (correction ?? '').toLowerCase()
  if (text.includes('duration')) {
    data.duration = Math.max(2, Math.min(10, clip.duration))
  }
  if (text.includes('prompt') || text.includes('cap')) {
    data.prompt = clip.prompt.slice(0, 1800)
  }
  if (Object.keys(data).length) {
    await db.studioClip.update({ where: { id: shotId }, data })
  }
}
