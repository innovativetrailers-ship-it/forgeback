import { falEndpoint } from '@cinema/core/endpoints'
/** Hunyuan Video — bare T2V path only (no I2V on FAL). */

export const HUNYUAN_T2V = falEndpoint('hunyuan-video')

export function resolveHunyuanEndpoint(_isI2V: boolean): string {
  return HUNYUAN_T2V
}
