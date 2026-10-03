import { falEndpoint } from '@cinema/core/endpoints'
import { ltxDuration } from '@cinema/core'

/** LTX 2.3 — replaces ltx-2-19b / ltx-video-v0-9-7 family. */

export const LTX_T2V_BY_REGISTRY: Record<string, string> = {
  'ltx-2.3':      falEndpoint('ltx-2.3/text-to-video'),
  'ltx-2.3-fast': falEndpoint('ltx-2.3/text-to-video/fast'),
}

export const LTX_I2V = falEndpoint('ltx-2.3/image-to-video')

export function resolveLtxEndpoint(registryKey: string, isI2V: boolean): string {
  if (isI2V) return LTX_I2V
  return LTX_T2V_BY_REGISTRY[registryKey] ?? LTX_T2V_BY_REGISTRY['ltx-2.3']
}

export function snapLtx23Duration(seconds: number, endpoint?: string): number {
  return ltxDuration(seconds, Boolean(endpoint?.includes('/fast')), undefined, endpoint)
}
