/**
 * Web re-export of the single registry in @cinema/core.
 * Utility endpoints stay here because they are web lip-sync wiring, not the model pool.
 */

import { falEndpoint } from '@cinema/core/endpoints'
import { LIP_SYNC_ENGINES } from '@/lib/orchestration/lipSyncRegistry'
import {
  VIDEO_MODEL_REGISTRY,
  type RegistryEntry,
} from '@cinema/core'

export {
  VIDEO_MODEL_REGISTRY,
  MODEL_REGISTRY_ALIASES,
  entryProvider,
  type Provider,
  type RegistryEntry,
} from '@cinema/core'

export const UTILITY_FAL_ENDPOINTS: Record<string, string> = {
  latentsync: LIP_SYNC_ENGINES.latentsync.endpoint,
  'sync-lipsync': LIP_SYNC_ENGINES['sync-lipsync'].endpoint,
  'sync-lipsync-2-pro': LIP_SYNC_ENGINES['sync-lipsync-2-pro'].endpoint,
  'flux-fill': falEndpoint('flux-pro/v1/fill'),
  'rembg-video': falEndpoint('birefnet/v2/video'),
  'video-inpaint': falEndpoint('wan-vace-14b/inpainting'),
  'ffmpeg-extract': falEndpoint('ffmpeg-api/extract-frame'),
}

export function listAllFalEndpointIds(): string[] {
  const ids = new Set<string>()
  for (const entry of Object.values(VIDEO_MODEL_REGISTRY) as RegistryEntry[]) {
    if (entry.isExternal) continue
    ids.add(entry.falEndpoint)
    if (entry.i2vEndpoint) ids.add(entry.i2vEndpoint)
  }
  for (const ep of Object.values(UTILITY_FAL_ENDPOINTS)) {
    ids.add(ep)
  }
  return [...ids].sort()
}

export function buildVideoEndpointMaps(): {
  t2v: Record<string, string>
  i2v: Record<string, string>
} {
  const t2v: Record<string, string> = {}
  const i2v: Record<string, string> = {}
  for (const [key, entry] of Object.entries(VIDEO_MODEL_REGISTRY) as Array<[string, RegistryEntry]>) {
    t2v[key] = entry.falEndpoint
    if (!entry.isExternal && entry.i2vEndpoint) i2v[key] = entry.i2vEndpoint
  }
  return { t2v, i2v }
}
