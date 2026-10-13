import type { ModelRouterInput, VideoModel, QualityTier, SceneType } from './types'
import { normalizeWorkerModelId } from './normaliseId'

export { normaliseModelId, normalizeWorkerModelId } from './normaliseId'

export type { QualityTier, SceneType }

const TIER_MODEL_MAP: Record<QualityTier, VideoModel> = {
  draft:      'ltx',
  standard:   'wan',
  premium:    'kling_standard',
  cinematic:  'kling_pro',
  film:       'veo3',
  film_grade: 'veo3',
}

const SCENE_OVERRIDES: Partial<Record<SceneType, Partial<Record<QualityTier, VideoModel>>>> = {
  action: {
    premium: 'seedance',
    cinematic: 'runway',
    film: 'veo3',
    film_grade: 'veo3',
  },
  aerial: {
    standard: 'luma',
    premium: 'luma',
    cinematic: 'runway',
    film: 'veo3',
    film_grade: 'veo3',
  },
  dialogue: {
    premium: 'kling_pro',
    cinematic: 'kling_pro',
    film: 'veo3',
    film_grade: 'veo3',
  },
  environment: {
    standard: 'minimax',
    premium: 'luma',
    cinematic: 'seedance',
    film: 'veo3',
    film_grade: 'veo3',
  },
}

export function routeToModel(input: ModelRouterInput): VideoModel {
  const { quality, sceneType, hasCharacterRef, hasLoRA, userRole, budget } = input

  if (quality === 'draft') return 'ltx'

  if (hasLoRA) {
    if (quality === 'film' || quality === 'film_grade' || quality === 'cinematic') return 'kling_pro'
    return 'kling_standard'
  }

  if (hasCharacterRef && !hasLoRA) {
    if (quality === 'film' || quality === 'film_grade') return 'veo3'
    if (quality === 'cinematic') return 'kling_pro'
    return 'kling_standard'
  }

  if (userRole === 'FREE' && (quality === 'film' || quality === 'film_grade')) return 'kling_standard'

  if (budget === 'low') {
    if (quality === 'film' || quality === 'film_grade' || quality === 'cinematic') return 'kling_standard'
    return TIER_MODEL_MAP[quality]
  }

  if (sceneType && SCENE_OVERRIDES[sceneType]?.[quality]) {
    return SCENE_OVERRIDES[sceneType][quality]!
  }

  return TIER_MODEL_MAP[quality]
}

export function getDurationMultiplier(seconds: number): number {
  return Math.ceil(seconds / 5)
}

export function getOperationCostKey(model: VideoModel | string): string {
  const normalized = typeof model === 'string' ? normalizeWorkerModelId(model) : model
  const map: Record<string, string> = {
    wan:              'generate_wan',
    animatediff:      'generate_ltx',
    luma:             'generate_luma',
    pika:             'generate_pika',
    minimax:          'generate_minimax',
    kling_standard:   'generate_kling_standard',
    kling_pro:        'generate_kling_pro',
    seedance:         'generate_seedance',
    runway:           'generate_runway',
    veo3:             'generate_veo3',
    svd:              'generate_wan',
    skyreels:         'generate_skyreels',
    ltx:              'generate_ltx',
    pixverse:         'generate_pixverse',
    hunyuan:          'generate_hunyuan',
    happyhorse:       'generate_happyhorse',
    hailuo:           'generate_hailuo',
    grok_video:       'generate_grok_video',
    sora:             'generate_sora',
  }
  return map[normalized] ?? 'generate_wan'
}
