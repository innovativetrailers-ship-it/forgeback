import { normaliseModelId } from '@cinema/core'
import type { VideoModel } from './types'

export { normaliseModelId }

/** Map any model ID variant to legacy VideoModel for credits and worker billing. */
export function normalizeWorkerModelId(modelId: string): VideoModel {
  const kebab = normaliseModelId(modelId)
  const legacyMap: Record<string, VideoModel> = {
    'wan-2.6':           'wan',
    'kling-3.0':         'kling_pro',
    'kling-o3':          'kling_pro',
    'veo-3.1':           'veo3',
    'luma-ray3':         'luma',
    'seedance-2.0':      'seedance',
    'ltx-2.3':           'ltx',
    'ltx-2.3-fast':      'ltx',
    'pika-2.5':          'pika',
    'minimax-2.3':       'minimax',
    'pixverse-c1':       'pixverse',
    'skyreels-v3':       'skyreels',
    'hunyuan-video-1.5': 'hunyuan',
    'happyhorse-1.0':    'happyhorse',
    'sora-2':            'sora',
    'runway-gen4':       'runway',
    'grok-imagine-video': 'grok_video',
    'hailuo-2.3':        'hailuo',
    'nano-banana-2':     'wan',
    'nano-banana-pro':   'wan',
  }
  return legacyMap[kebab] ?? (kebab as VideoModel)
}
