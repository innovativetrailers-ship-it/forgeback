import { falEndpoint } from '@cinema/core/endpoints'
import { pixverseDuration } from '@cinema/core'

/** Live FAL PixVerse paths — always include task suffix (/text-to-video, /image-to-video). */

export const PIXVERSE_T2V_BY_REGISTRY: Record<string, string> = {
  'pixverse-c1': falEndpoint('pixverse/v5.5/text-to-video'),
  'pixverse-v6': falEndpoint('pixverse/v4.5/text-to-video'),
}

export const PIXVERSE_I2V_BY_REGISTRY: Record<string, string> = {
  'pixverse-c1': falEndpoint('pixverse/v5.5/image-to-video'),
  'pixverse-v6': falEndpoint('pixverse/v4/image-to-video'),
}

export function resolvePixverseEndpoint(registryKey: string, isI2V: boolean): string {
  const map = isI2V ? PIXVERSE_I2V_BY_REGISTRY : PIXVERSE_T2V_BY_REGISTRY
  return map[registryKey] ?? PIXVERSE_T2V_BY_REGISTRY['pixverse-c1']
}

export function snapPixverseDuration(falModelId: string, seconds: number): number {
  const n = Math.round(seconds)
  if (falModelId.includes('v5.5')) {
    if ([5, 8, 10].includes(n)) return n
    if (n <= 6) return 5
    if (n <= 9) return 8
    return 10
  }
  return [5, 8].includes(n) ? n : (n <= 6 ? 5 : 8)
}
