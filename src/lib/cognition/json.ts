import type { z } from 'zod'

// Parse JSON returned by an LLM, tolerating ```json fences and surrounding prose.
// Falls back to a caller-supplied default so cognition degrades gracefully
// instead of throwing when a model returns malformed output.
export function parseLLMJson<T>(content: string | null | undefined, fallback: T): T {
  if (typeof content !== 'string' || !content.trim()) return fallback
  const cleaned = content.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch (err) {
    console.warn("[caught] src/lib/cognition/json.ts:11", err instanceof Error ? { name: err.name, message: err.message } : err)

    const start = cleaned.search(/[[{]/)
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T
      } catch (err) {
        console.warn("[caught] src/lib/cognition/json.ts:19", err instanceof Error ? { name: err.name, message: err.message } : err)

        return fallback
      }
    }
    return fallback
  }
}

/** Parse then schema-check. Null means the shape was missing or invalid — caller may retry once. */
export function validateLLMJson<T>(content: string | null | undefined, schema: z.ZodType<T>): T | null {
  if (typeof content !== 'string' || !content.trim()) return null
  const cleaned = content.replace(/```json|```/g, '').trim()
  const raw = parseUnknown(cleaned)
  if (raw === undefined) return null
  const result = schema.safeParse(raw)
  return result.success ? result.data : null
}

function parseUnknown(cleaned: string): unknown | undefined {
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    console.warn("[caught] src/lib/cognition/json.ts:38", err instanceof Error ? { name: err.name, message: err.message } : err)

    const start = cleaned.search(/[[{]/)
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (start === -1 || end <= start) return undefined
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch (err) {
      console.warn("[caught] src/lib/cognition/json.ts:48", err instanceof Error ? { name: err.name, message: err.message } : err)

      return undefined
    }
  }
}
