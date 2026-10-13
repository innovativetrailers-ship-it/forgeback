import { clampDuration, logPayloadClamp, type DurationConstraint, type PayloadBuildOptions } from './payload'

/**
 * Pika 2.2 duration from OpenAPI on 2026-09-26.
 * fal-ai/pika/v2.2/text-to-video — integer enum [5, 10], default 5.
 */

export const PIKA_TEXT = 'fal-ai/pika/v2.2/text-to-video'
export const PIKA_IMAGE = 'fal-ai/pika/v2.2/image-to-video'
export const PIKA_DURATION = [5, 10] as const

export function pikaDurationConstraint(): DurationConstraint {
  return { shape: 'set', values: PIKA_DURATION, fallback: 5 }
}

export function pikaDuration(
  seconds: number | undefined,
  endpoint = PIKA_TEXT,
  onClamp: PayloadBuildOptions['onClamp'] = logPayloadClamp,
): number {
  return Number(clampDuration(seconds, pikaDurationConstraint(), endpoint, onClamp))
}
