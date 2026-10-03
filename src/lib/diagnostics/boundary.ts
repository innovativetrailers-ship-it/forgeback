import { asArray, asRecord, parseJsonObject, BoundaryError } from '@cinema/core'
import { z } from 'zod'

export { BoundaryError }

export function parseBoundary<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const detail = result.error.issues.map((issue) => issue.message).join('; ')
  throw new BoundaryError(`${label}: ${detail}`)
}

export function parseBoundaryJson<T>(schema: z.ZodType<T>, raw: string, label: string): T {
  return parseBoundary(schema, parseJsonObject(raw, label), label)
}

export const qualityChecksSchema = z.object({
  onIntent: z.boolean(),
  artifacts: z.boolean(),
  characterMatch: z.number().min(0).max(1).nullable().optional(),
  cameraMatch: z.boolean().nullable().optional(),
  locationMatch: z.number().min(0).max(1).nullable().optional(),
  reason: z.string().optional(),
})

export const interpretedErrorSchema = z.object({
  userMessage: z.string().min(1),
  suggestedAction: z.enum([
    'retry',
    'alter_prompt',
    'reduce_refs',
    'change_model',
    'wait_retry',
    'reduce_duration',
  ]),
  category: z.enum([
    'content_flag',
    'payload_over_limit',
    'field_mismatch',
    'namespace_bad',
    'provider_transient',
    'auth_config',
    'unsupported_mode',
    'code_error',
    'unknown',
  ]),
  correctable: z.boolean(),
  correction: z.string().nullable().optional(),
})

export function arrayOrEmpty<T>(value: unknown): T[] {
  return asArray<T>(value)
}

export function recordOrEmpty(value: unknown): Record<string, unknown> {
  return asRecord(value)
}
