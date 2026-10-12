import { TIER_PERMISSIONS, type SubscriptionTier } from './tiers'

export type UpgradeKey = 'collaborate' | 'voice_clone' | 'export_4k' | 'export_prores' | 'download'

export function enforcePermission(
  tier: SubscriptionTier,
  key: UpgradeKey,
): { allowed: true } | { allowed: false; reason: string; upgrade: UpgradeKey } {
  const perms = TIER_PERMISSIONS[tier]
  const allowed = key === 'collaborate' ? perms.canCollaborate
    : key === 'voice_clone' ? perms.canUseVoiceClone
    : key === 'download' ? perms.download
    : key === 'export_4k' ? perms.exportFormats.includes('mp4_4k')
    : perms.exportFormats.includes('mov_prores')
  if (allowed) return { allowed: true }
  return { allowed: false, reason: `Your plan does not include ${key.replace('_', ' ')}.`, upgrade: key }
}
