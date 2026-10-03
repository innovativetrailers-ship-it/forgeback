import { falEndpoint } from '@cinema/core/endpoints'
/** Pika 2.2 — replaces legacy pika/v2/turbo paths. */

export const PIKA_T2V = falEndpoint('pika/v2.2/text-to-video')
export const PIKA_I2V = falEndpoint('pika/v2.2/image-to-video')

export function resolvePikaEndpoint(isI2V: boolean): string {
  return isI2V ? PIKA_I2V : PIKA_T2V
}
