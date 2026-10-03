/**
 * Visible quality control. Draft / Studio / Blockbuster each name a model band
 * and a resolution. Manual model override skips this band. HappyHorse stays
 * out of every band until one clean generation exists.
 */

export type QualityTierName = 'Draft' | 'Studio' | 'Blockbuster'

export type RouteQualityTier = 'draft' | 'studio' | 'blockbuster'

export interface TierPolicy {
  models: readonly string[]
  resolution: '480p' | '720p' | '1080p'
  label: string
  routeQuality: RouteQualityTier
}

export const TIER_POLICY: Record<QualityTierName, TierPolicy> = {
  Draft: {
    models: ['ltx-2.3-fast'],
    resolution: '480p',
    label: 'Draft — LTX-2.3-Fast at 480p',
    routeQuality: 'draft',
  },
  Studio: {
    models: ['kling-3.0', 'seedance-2.0', 'wan-2.7'],
    resolution: '720p',
    label: 'Studio — Kling, Seedance, or Wan at 720p',
    routeQuality: 'studio',
  },
  Blockbuster: {
    models: ['veo-3.1', 'kling-3.0'],
    resolution: '1080p',
    label: 'Blockbuster — Veo 3.1 or Kling 3.0 at 1080p',
    routeQuality: 'blockbuster',
  },
}

export function parseQualityTier(value: unknown): QualityTierName {
  if (value === 'Draft' || value === 'Studio' || value === 'Blockbuster') return value
  return 'Studio'
}

export function toRagConstraint(tier: QualityTierName | RouteQualityTier | string | undefined): 'draft' | 'standard' | 'blockbuster' {
  if (tier === 'Draft' || tier === 'draft') return 'draft'
  if (tier === 'Blockbuster' || tier === 'blockbuster') return 'blockbuster'
  return 'standard'
}

/** Intersection with the band. An empty intersection uses the band itself. */
export function constrainModelsToTier(requested: string[], tier: QualityTierName): string[] {
  const band = TIER_POLICY[tier].models
  const hit = requested.filter((id) => band.includes(id))
  if (hit.length > 0) return hit
  console.log('[tierPolicy] selection outside band; using the tier band', { tier, requested, band })
  return [...band]
}
