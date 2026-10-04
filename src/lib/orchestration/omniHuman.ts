/** Live fal model page, 2026-10-04: $0.16 per second. Credits use the app rate of 20 per dollar. */
export const OMNI_USD_PER_SEC = 0.16
export const OMNI_CREDITS_PER_DOLLAR = 20

export type OmniResolution = '720p' | '1080p'

export function omniMaxSeconds(resolution: OmniResolution): number {
  return resolution === '720p' ? 60 : 30
}

export function omniCredits(seconds: number): number {
  const secs = Math.max(1, Math.ceil(seconds))
  return Math.ceil(secs * OMNI_USD_PER_SEC * OMNI_CREDITS_PER_DOLLAR)
}

/** Split a long performance into shots that fit the verified audio limit. */
export function splitPerformance(duration: number, resolution: OmniResolution): number[] {
  const max = omniMaxSeconds(resolution)
  let left = Math.max(1, Math.ceil(duration))
  const parts: number[] = []
  while (left > 0) {
    const chunk = Math.min(max, left)
    parts.push(chunk)
    left -= chunk
  }
  return parts
}
