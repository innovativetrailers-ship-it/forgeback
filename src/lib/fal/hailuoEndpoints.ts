import { falEndpoint } from '@cinema/core/endpoints'
import { hailuoDuration } from '@cinema/core'

/** Hailuo 2.3 — replaces shared stale minimax-video path. */

export const HAILUO_T2V_BY_REGISTRY: Record<string, string> = {
  'hailuo-2.3':  falEndpoint('minimax/hailuo-2.3/standard/text-to-video'),
  'minimax-2.3': falEndpoint('minimax/hailuo-2.3/pro/text-to-video'),
}

export const HAILUO_I2V_BY_REGISTRY: Record<string, string> = {
  'hailuo-2.3':  falEndpoint('minimax/hailuo-2.3/standard/image-to-video'),
  'minimax-2.3': falEndpoint('minimax/hailuo-2.3/pro/image-to-video'),
}

export function resolveHailuoEndpoint(registryKey: string, isI2V: boolean): string {
  if (registryKey === 'skyreels-v3' || registryKey === 'skyreels') {
    throw new Error('SkyReels is not in the council. It was not substituted for another model.')
  }
  const map = isI2V ? HAILUO_I2V_BY_REGISTRY : HAILUO_T2V_BY_REGISTRY
  const endpoint = map[registryKey]
  if (!endpoint) throw new Error(`Unknown Hailuo model ${registryKey}. Nothing was substituted.`)
  return endpoint
}

export function snapHailuoDuration(seconds: number): 6 | 10 {
  return Math.round(seconds) > 6 ? 10 : 6
}
