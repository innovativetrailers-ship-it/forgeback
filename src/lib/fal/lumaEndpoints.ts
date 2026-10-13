import { falEndpoint } from '@cinema/core/endpoints'
/** Luma Ray 2 — replaces deprecated bare luma-dream-machine paths. */

export const LUMA_T2V = falEndpoint('luma-dream-machine/ray-2')
export const LUMA_I2V = falEndpoint('luma-dream-machine/ray-2/image-to-video')
export const LUMA_T2V_FAST = falEndpoint('luma-dream-machine/ray-2-flash')

export function resolveLumaEndpoint(isI2V: boolean): string {
  return isI2V ? LUMA_I2V : LUMA_T2V
}
