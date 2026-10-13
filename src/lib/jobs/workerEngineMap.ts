/** Map legacy worker / Simple UI model ids → the truthful v1 pool. */
export const WORKER_TO_ENGINE: Record<string, string> = {
  animatediff:        'ltx-2.3-fast',
  ltx:                'ltx-2.3-fast',
  'ltx-2.3':          'ltx-2.3-fast',
  'ltx-fast':         'ltx-2.3-fast',
  'ltx-2.3-fast':     'ltx-2.3-fast',
  kling_pro:          'kling-3.0',
  kling_standard:     'kling-3.0',
  kling:              'kling-3.0',
  'kling-standard':   'kling-3.0',
  'kling-3.0':        'kling-3.0',
  veo3:               'veo-3.1',
  'veo-3':            'veo-3.1',
  'veo-3.1':          'veo-3.1',
  seedance:           'seedance-2.0',
  'seedance-2.0':     'seedance-2.0',
  runway:             'runway-gen4',
  'runway-gen4':      'runway-gen4',
  'runway-gen4.5':    'runway-gen4',
  grok:               'grok-imagine-video',
  grok_video:         'grok-imagine-video',
  'grok-imagine':     'grok-imagine-video',
  'grok-imagine-video': 'grok-imagine-video',
}

export function resolveEngineModel(modelId: string): string {
  return WORKER_TO_ENGINE[modelId] ?? modelId
}

/** Models that return a provider job id and need async polling (not blocking FAL subscribe). */
export const ASYNC_POLL_ENGINES = new Set([
  'runway',
  'runway-gen4',
])
