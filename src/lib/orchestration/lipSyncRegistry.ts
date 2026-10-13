import { falEndpoint } from '@cinema/core/endpoints'
export type LipSyncTier = 'draft' | 'standard' | 'studio' | 'blockbuster'

export interface AlignmentWord {
  text: string
  start: number
  end: number
}

export interface LipSyncInput {
  videoUrl: string
  audioUrl: string
  syncMode?: 'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap'
  alignmentWords?: AlignmentWord[]
}

export const LIP_SYNC_ENGINES = {
  latentsync: {
    endpoint: falEndpoint('latentsync'),
    payload: (i: LipSyncInput) => ({
      video_url: i.videoUrl,
      audio_url: i.audioUrl,
    }),
  },
  'sync-lipsync': {
    endpoint: falEndpoint('sync-lipsync'),
    payload: (i: LipSyncInput) => ({
      video_url: i.videoUrl,
      audio_url: i.audioUrl,
      sync_mode: i.syncMode ?? 'cut_off',
    }),
  },
  'sync-lipsync-2-pro': {
    endpoint: falEndpoint('sync-lipsync/v2/pro'),
    payload: (i: LipSyncInput) => ({
      video_url: i.videoUrl,
      audio_url: i.audioUrl,
      sync_mode: i.syncMode ?? 'cut_off',
    }),
  },
} as const

export type LipSyncEngineKey = keyof typeof LIP_SYNC_ENGINES

export function lipSyncEngineForTier(tier: LipSyncTier): LipSyncEngineKey {
  if (tier === 'draft') return 'latentsync'
  if (tier === 'standard') return 'sync-lipsync'
  return 'sync-lipsync-2-pro'
}

export function lipSyncEngineForMode(mode: 'draft' | 'production'): LipSyncEngineKey {
  return mode === 'draft' ? 'latentsync' : 'sync-lipsync-2-pro'
}
