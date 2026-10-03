import { falEndpoint } from '@cinema/core/endpoints'
import { hailuoDuration } from '@cinema/core'

/** Hailuo 2.3 — replaces shared stale minimax-video path. */

export const HAILUO_T2V_BY_REGISTRY: Record<string, string> = {
  'hailuo-2.3':  falEndpoint('minimax/hailuo-2.3/standard/text-to-video'),
  'minimax-2.3': falEndpoint('minimax/hailuo-2.3/pro/text-to-video'),
  /** SkyReels has no live FAL T2V — emotional/longform rerouted to Hailuo standard. */
  'skyreels-v3': falEndpoint('minimax/hailuo-2.3/standard/text-to-video'),
}

export const HAILUO_I2V_BY_REGISTRY: Record<string, string> = {
  'hailuo-2.3':  falEndpoint('minimax/hailuo-2.3/standard/image-to-video'),
  'minimax-2.3': falEndpoint('minimax/hailuo-2.3/pro/image-to-video'),
  'skyreels-v3': falEndpoint('minimax/hailuo-2.3/standard/image-to-video'),
}

export function resolveHailuoEndpoint(registryKey: string, isI2V: boolean): string {
  const map = isI2V ? HAILUO_I2V_BY_REGISTRY : HAILUO_T2V_BY_REGISTRY
  return map[registryKey] ?? HAILUO_T2V_BY_REGISTRY['hailuo-2.3']
}

export function snapHailuoDuration(seconds: number): 6 | 10 {
  return Math.round(seconds) > 6 ? 10 : 6
}
