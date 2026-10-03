import { clampDuration, logPayloadClamp, type DurationConstraint, type PayloadBuildOptions } from './payload'

/**
 * Runway duration from the Dev API reference on 2026-09-27.
 * POST /v1/image_to_video model gen4.5 — integer 2–10, required.
 * POST /v1/image_to_video model gen4_turbo — integer 2–10.
 * POST /v1/text_to_video model gen4.5 — integer 2–10, required.
 * https://docs.dev.runwayml.com/api.md
 * The wire value is a number, not a string. Example requests use 5.
 */

export const RUNWAY_GEN45 = 'gen4.5'
export const RUNWAY_GEN4_TURBO = 'gen4_turbo'
export const RUNWAY_REGISTRY = 'runway-gen4'

export function runwayDurationConstraint(): DurationConstraint {
  return { shape: 'range', min: 2, max: 10, wire: 'number', fallback: 5 }
}

export function runwayDuration(
  seconds: number | undefined,
  endpoint = RUNWAY_GEN45,
  onClamp: PayloadBuildOptions['onClamp'] = logPayloadClamp,
): number {
  return Number(clampDuration(seconds, runwayDurationConstraint(), endpoint, onClamp))
}
