// Single source of truth for subscription tier permissions and upgrade paths.
//
// UI labels:  Simple (pro) · Advanced (studio) · Ultimate · Dev Account (admin)
// Billing:     subscriptionTier + subscriptionStatus (active | past_due | canceled | trial)

export type SubscriptionTier = 'free' | 'pro' | 'studio' | 'ultimate' | 'admin'
export type QualityTier      = 'draft' | 'standard' | 'cinematic' | 'film'
export type UIMode           = 'simple' | 'advanced' | 'director' | 'film_series'

export interface TierPermissions {
  qualityTiers:       QualityTier[]
  uiModes:            UIMode[]
  maxDirectorModels:  number
  maxClipDuration:    number
  maxProjectClips:    number
  exportFormats:      string[]
  canCollaborate:     boolean
  canPublishSocial:   boolean
  canUseVoiceClone:   boolean
  label:              string
  colour:             string
  displayName:        string
  requiresSubscription: boolean
  studioFeatures:     boolean
  ultimateFeatures:   boolean
  download:           boolean
  creditTopUp:        boolean
}

export const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  free:     'Free',
  pro:      'Simple',
  studio:   'Advanced',
  ultimate: 'Ultimate',
  admin:    'Dev Account',
}

export const TIER_PERMISSIONS: Record<SubscriptionTier, TierPermissions> = {
  free: {
    qualityTiers:         ['draft'],
    uiModes:              ['simple'],
    maxDirectorModels:    0,
    maxClipDuration:      10,
    maxProjectClips:      5,
    exportFormats:        ['mp4_720p'],
    canCollaborate:       false,
    canPublishSocial:     false,
    canUseVoiceClone:     false,
    label:                'Free Trial',
    colour:               '#6b7280',
    displayName:          'Free',
    requiresSubscription: false,
    studioFeatures:       false,
    ultimateFeatures:     false,
    download:             false,
    creditTopUp:          false,
  },
  pro: {
    qualityTiers:         ['draft', 'standard', 'cinematic'],
    uiModes:              ['simple', 'advanced'],
    maxDirectorModels:    2,
    maxClipDuration:      30,
    maxProjectClips:      20,
    exportFormats:        ['mp4_720p', 'mp4_1080p'],
    canCollaborate:       false,
    canPublishSocial:     true,
    canUseVoiceClone:     false,
    label:                'Simple',
    colour:               '#10b981',
    displayName:          'Simple',
    requiresSubscription: false,
    studioFeatures:       false,
    ultimateFeatures:     false,
    download:             false,
    creditTopUp:          true,
  },
  studio: {
    qualityTiers:         ['draft', 'standard', 'cinematic', 'film'],
    uiModes:              ['simple', 'advanced', 'director'],
    maxDirectorModels:    7,
    maxClipDuration:      120,
    maxProjectClips:      100,
    exportFormats:        ['mp4_720p', 'mp4_1080p', 'mp4_4k', 'mov_prores'],
    canCollaborate:       true,
    canPublishSocial:     true,
    canUseVoiceClone:     true,
    label:                'Advanced',
    colour:               '#8b5cf6',
    displayName:          'Advanced',
    requiresSubscription: true,
    studioFeatures:       true,
    ultimateFeatures:     false,
    download:             false,
    creditTopUp:          true,
  },
  ultimate: {
    qualityTiers:         ['draft', 'standard', 'cinematic', 'film'],
    uiModes:              ['simple', 'advanced', 'director', 'film_series'],
    maxDirectorModels:    21,
    maxClipDuration:      600,
    maxProjectClips:      999,
    exportFormats:        ['mp4_720p', 'mp4_1080p', 'mp4_4k', 'mov_prores', 'dcp', 'imf'],
    canCollaborate:       true,
    canPublishSocial:     true,
    canUseVoiceClone:     true,
    label:                'Ultimate',
    colour:               '#00e5c8',
    displayName:          'Ultimate',
    requiresSubscription: true,
    studioFeatures:       true,
    ultimateFeatures:     true,
    download:             true,
    creditTopUp:          true,
  },
  admin: {
    qualityTiers:         ['draft', 'standard', 'cinematic', 'film'],
    uiModes:              ['simple', 'advanced', 'director', 'film_series'],
    maxDirectorModels:    21,
    maxClipDuration:      999,
    maxProjectClips:      999,
    exportFormats:        ['mp4_720p', 'mp4_1080p', 'mp4_4k', 'mov_prores', 'dcp', 'imf'],
    canCollaborate:       true,
    canPublishSocial:     true,
    canUseVoiceClone:     true,
    label:                'Dev',
    colour:               '#00e5c8',
    displayName:          'Dev Account',
    requiresSubscription: false,
    studioFeatures:       true,
    ultimateFeatures:     true,
    download:             true,
    creditTopUp:          false,
  },
}

export const UPGRADE_REQUIRED: Record<string, SubscriptionTier> = {
  quality_standard:   'pro',
  quality_cinematic:  'pro',
  quality_film:       'studio',
  mode_advanced:      'pro',
  mode_director:      'studio',
  mode_film_series:   'ultimate',
  director_5_models:  'studio',
  director_unlimited: 'ultimate',
  export_4k:          'studio',
  export_prores:      'studio',
  export_dcp:         'ultimate',
  voice_clone:        'studio',
  collaborate:        'studio',
  download:           'ultimate',
}

const TIER_ORDER: SubscriptionTier[] = ['free', 'pro', 'studio', 'ultimate', 'admin']

const LEGACY_TIER_STATUS = new Set(['pro', 'studio', 'ultimate'])

/** Billing is active (includes past_due grace period). */
export function hasActiveBilling(subscriptionStatus: string | null | undefined): boolean {
  const s = subscriptionStatus?.toLowerCase()
  return s === 'active' || s === 'past_due'
}

/** Resolve stored DB fields → subscription tier (ignores billing state). */
export function resolveSubscriptionTier(
  subscriptionTier: string | null | undefined,
  subscriptionStatus: string | null | undefined,
  role: string,
): SubscriptionTier {
  if (role === 'ADMIN') return 'admin'

  const tierField = subscriptionTier?.toLowerCase()
  if (tierField === 'pro' || tierField === 'studio' || tierField === 'ultimate') return tierField
  if (tierField === 'free') return 'free'

  const status = subscriptionStatus?.toLowerCase() ?? ''
  if (LEGACY_TIER_STATUS.has(status)) return status as SubscriptionTier
  if (status === 'active') return 'pro'

  return 'free'
}

/** Effective tier for feature gating — studio/ultimate need active billing. */
export function getEffectiveTier(
  tier: SubscriptionTier,
  subscriptionStatus: string | null | undefined,
  isAdmin: boolean,
): SubscriptionTier {
  if (isAdmin) return 'admin'
  const perms = TIER_PERMISSIONS[tier]
  if (perms.requiresSubscription && !hasActiveBilling(subscriptionStatus)) return 'free'
  return tier
}

/** @deprecated Use resolveSubscriptionTier */
export function getUserTier(subscriptionStatus: string | null, role: string): SubscriptionTier {
  return resolveSubscriptionTier(null, subscriptionStatus, role)
}

export function canAccess(tier: SubscriptionTier, permission: keyof TierPermissions): boolean {
  return !!TIER_PERMISSIONS[tier]?.[permission]
}

export function getRequiredUpgrade(
  currentTier: SubscriptionTier,
  featureKey:  string,
): SubscriptionTier | null {
  const required = UPGRADE_REQUIRED[featureKey] as SubscriptionTier | undefined
  if (!required) return null

  const current = TIER_ORDER.indexOf(currentTier)
  const need    = TIER_ORDER.indexOf(required)

  return current < need ? required : null
}
