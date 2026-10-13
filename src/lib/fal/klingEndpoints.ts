import { falEndpoint } from '@cinema/core/endpoints'
import { klingDuration } from '@cinema/core'

/** Live FAL Kling paths — never derive I2V from T2V by suffix substitution. */

export const KLING_T2V_BY_REGISTRY: Record<string, string> = {
  'kling-3.0':      falEndpoint('kling-video/v3/pro/text-to-video'),
  'kling-o3':       falEndpoint('kling-video/o3/pro/text-to-video'),
  'kling-standard': falEndpoint('kling-video/v1.6/standard/text-to-video'),
}

export const KLING_I2V_BY_REGISTRY: Record<string, string> = {
  'kling-3.0':      falEndpoint('kling-video/v3/pro/image-to-video'),
  'kling-o3':       falEndpoint('kling-video/o3/pro/image-to-video'),
  'kling-standard': falEndpoint('kling-video/v1.6/standard/image-to-video'),
}

/** Image-conditioning param name per I2V endpoint (v3 uses start_image_url). */
export const KLING_I2V_IMAGE_PARAM: Record<string, string> = {
  [falEndpoint('kling-video/v3/pro/image-to-video')]:        'start_image_url',
  [falEndpoint('kling-video/o3/pro/image-to-video')]:        'image_url',
  [falEndpoint('kling-video/v2.1/pro/image-to-video')]:    'image_url',
  [falEndpoint('kling-video/v1.6/pro/image-to-video')]:    'image_url',
  [falEndpoint('kling-video/v1.6/standard/image-to-video')]: 'image_url',
}

export const KLING_O3_I2V = falEndpoint('kling-video/o3/pro/image-to-video')

const KLING_TIER = new Set(['pro', 'standard', 'master', 'turbo'])

/**
 * Kling paths without a tier segment 404.
 * kling-video/v2.6/text-to-video → kling-video/v2.6/pro/text-to-video.
 * OpenAPI 2026-09-26: the bare v2.6 id is 404; /pro/ is 200.
 */
export function ensureKlingTier(endpoint: string): string {
  if (!endpoint.includes('kling-video/')) return endpoint
  const parts = endpoint.split('/')
  const family = parts.indexOf('kling-video')
  if (family < 0 || family + 2 >= parts.length) return endpoint
  const version = parts[family + 1] ?? ''
  const next = parts[family + 2] ?? ''
  if (next === 'turbo') {
    const after = parts[family + 3] ?? ''
    if (after === 'pro' || after === 'standard' || after === 'master') return endpoint
    parts.splice(family + 3, 0, 'pro')
    return parts.join('/')
  }
  if (KLING_TIER.has(next)) return endpoint
  if (!version.startsWith('v') && !version.startsWith('o')) return endpoint
  parts.splice(family + 2, 0, 'pro')
  return parts.join('/')
}

export function resolveKlingEndpoint(registryKey: string, isI2V: boolean): string | undefined {
  const id = (isI2V ? KLING_I2V_BY_REGISTRY : KLING_T2V_BY_REGISTRY)[registryKey]
  return id ? ensureKlingTier(id) : undefined
}

/** Lookup into the Kling registry. v3/o3 use KLING_DURATION. v2.x/v1 use KLING_V2_DURATION. */
export function klingDurationForEndpoint(endpoint: string, seconds: number | string | undefined): string {
  const raw = typeof seconds === 'number'
    ? seconds
    : typeof seconds === 'string'
      ? Number(seconds.replace(/s$/i, ''))
      : 5
  const target = Number.isFinite(raw) && raw > 0 ? raw : 5
  return klingDuration(target, endpoint)
}

/** v3 uses end_image_url. v2/v1 use tail_image_url. Turbo is first frame only. */
export function klingEndFrameField(endpoint: string): 'end_image_url' | 'tail_image_url' | null {
  if (endpoint.includes('/turbo/')) return null
  if (endpoint.includes('/v3/') || endpoint.includes('/o3/')) return 'end_image_url'
  if (/\/v2[\d.]*\/|\/v1/.test(endpoint)) return 'tail_image_url'
  return null
}

export function klingImageParamForEndpoint(falModelId: string): string {
  const mapped = KLING_I2V_IMAGE_PARAM[falModelId]
  if (mapped) return mapped
  if (falModelId.includes('/turbo/')) return 'image_url'
  if (falModelId.includes('/v3/') && falModelId.includes('image-to-video')) return 'start_image_url'
  return 'image_url'
}

export function supportsKlingEndFrame(falModelId: string): boolean {
  return klingEndFrameField(falModelId) != null
}
