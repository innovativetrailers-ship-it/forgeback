export const MODEL_COSTS: Record<string, number> = {
  'veo-3.1':              35,
  'kling-3.0':            25,
  'seedance-2.0':         20,
  'runway-gen4':          22,
  'hunyuan-video-1.5':    12,
  'luma-ray3':             8,
  'minimax-2.3':          10,
  'cogvideox':             6,
  'wan-2.2':               2,
  'pika-2.5':              8,
  'skyreels-v3':          18,
  'ltx-2.3':               6,
  'ltx-2.3-fast':          2,
  'pixverse-c1':          28,
  'pixverse-v6':          14,
  'hunyuan-hy-motion':    20,
  'hunyuan-world-mirror': 22,
  'hunyuan-r-dmesh':      25,
  'nano-banana-2':         2,
  'nano-banana-pro':       5,
}

export const MODEL_SPECIALTIES: Record<string, {
  costTier:   'budget' | 'mid' | 'premium'
  strengths:  string[]
  weaknesses: string[]
  bestFor:    string
}> = {
  'veo-3.1': {
    costTier:   'premium',
    strengths:  ['fluid_dynamics', 'physics', 'photorealism', 'native_audio', 'realism'],
    weaknesses: ['cost', 'slow'],
    bestFor:    'Photorealistic hero shots, water/fire physics, native audio',
  },
  'kling-3.0': {
    costTier:   'mid',
    strengths:  ['locomotion', 'hands', 'facial_consistency', 'human_motion', 'vehicle'],
    weaknesses: ['environments', 'abstract'],
    bestFor:    'Human movement, vehicle pans, hand close-ups',
  },
  'seedance-2.0': {
    costTier:   'mid',
    strengths:  ['character_detail', 'dialogue', 'fine_motor', 'lip_sync', 'faces'],
    weaknesses: ['environments', 'action'],
    bestFor:    'Dialogue scenes, character close-ups, emotional performance',
  },
  'skyreels-v3': {
    costTier:   'mid',
    strengths:  ['infinite_length', 'emotional_acting', 'portrait', 'facial_expression', 'long_sequence'],
    weaknesses: ['cost_vs_budget'],
    bestFor:    'Infinite-length sequences, long-form portrait, emotional acting',
  },
  'runway-gen4': {
    costTier:   'mid',
    strengths:  ['multi_shot', 'character_continuity', 'commercial', 'product'],
    weaknesses: ['abstract', 'physics'],
    bestFor:    'Multi-shot sequences, product advertising, brand consistency',
  },
  'pixverse-c1': {
    costTier:   'premium',
    strengths:  ['cgi_vfx', 'fluid_dynamics', 'action_choreography', 'atmospheric', 'stylised', 'spatial_consistency', 'particles', 'lighting_effects'],
    weaknesses: ['cost', 'generation_time'],
    bestFor:    'CGI VFX: particles, fire, explosions, atmospheric effects, combat',
  },
  'pixverse-v6': {
    costTier:   'mid',
    strengths:  ['camera_control', 'character_emotion', 'multi_shot', 'native_audio', 'commercial'],
    weaknesses: ['extreme_vfx'],
    bestFor:    'Cinematic multi-shot with precise camera language, 15s stories',
  },
  'hunyuan-video-1.5': {
    costTier:   'mid',
    strengths:  ['crowd', 'cyberpunk', 'multi_person', 'density', 'urban'],
    weaknesses: ['portrait', 'dialogue'],
    bestFor:    'Crowd scenes, dense urban environments, cyberpunk aesthetics',
  },
  'hunyuan-hy-motion': {
    costTier:   'mid',
    strengths:  ['3d_character_animation', 'motion_capture_style', 'skeletal_animation', 'dance', 'sports'],
    weaknesses: ['environments', 'non_humanoid'],
    bestFor:    'CGI character animation: walk cycles, dance, combat, sports',
  },
  'hunyuan-world-mirror': {
    costTier:   'mid',
    strengths:  ['3d_reconstruction', 'scene_geometry', 'environment_cgi', 'depth_accurate'],
    weaknesses: ['character_detail', 'speed'],
    bestFor:    'CGI environment reconstruction, 3D world building from reference',
  },
  'hunyuan-r-dmesh': {
    costTier:   'premium',
    strengths:  ['mesh_animation', '3d_vfx', 'surface_tracking', 'procedural_cgi'],
    weaknesses: ['cost', 'complexity'],
    bestFor:    'Advanced CGI: mesh deformation, 3D surface animation',
  },
  'luma-ray3': {
    costTier:   'budget',
    strengths:  ['aerial', 'camera_movement', 'environments', 'landscape', 'establishing'],
    weaknesses: ['faces', 'dialogue'],
    bestFor:    'Aerial shots, landscape reveals, smooth camera movements',
  },
  'minimax-2.3': {
    costTier:   'budget',
    strengths:  ['long_form', 'consistent_quality', 'narrative', 'physics'],
    weaknesses: ['extreme_detail'],
    bestFor:    'Long sequences up to 6min, narrative consistency',
  },
  'cogvideox': {
    costTier:   'budget',
    strengths:  ['text_rendering', 'prompt_adherence', 'static_scenes', 'precise'],
    weaknesses: ['motion', 'realism'],
    bestFor:    'Text overlays, exact prompt matching, static scenes',
  },
  'wan-2.2': {
    costTier:   'budget',
    strengths:  ['wildlife', 'texture', 'nature', 'fur', 'organic'],
    weaknesses: ['urban', 'human', 'dialogue'],
    bestFor:    'Wildlife, nature texture, organic materials, budget backgrounds',
  },
  'ltx-2.3': {
    costTier:   'mid',
    strengths:  ['4k_native', '50fps', 'portrait_vertical', 'fast', 'audio_stereo'],
    weaknesses: ['complex_physics'],
    bestFor:    '4K portrait/vertical, high-resolution fast generation',
  },
  'ltx-2.3-fast': {
    costTier:   'budget',
    strengths:  ['speed', 'iteration', 'draft'],
    weaknesses: ['quality', 'resolution'],
    bestFor:    'Quick drafts, storyboard previews, rapid iteration',
  },
  'pika-2.5': {
    costTier:   'budget',
    strengths:  ['object_editing', 'close_up', 'product', 'swap', 'targeted_edit'],
    weaknesses: ['full_scene', 'long_form'],
    bestFor:    'Object replacement, product shots, targeted frame edits',
  },
}

export const FAL_MODEL_IDS: Record<string, string> = {
  'kling-3.0':            'fal-ai/kling-video/v1.6/pro/text-to-video',
  'seedance-2.0':         'fal-ai/seedance-video-lite',
  'skyreels-v3':          'fal-ai/skyreels-v2-t2v',
  'luma-ray3':            'fal-ai/luma-dream-machine',
  'minimax-2.3':          'fal-ai/minimax-video',
  'cogvideox':            'fal-ai/cogvideox-5b',
  'wan-2.2':              'fal-ai/wan-t2v',
  'ltx-2.3':              'fal-ai/ltx-video-v0-9-7',
  'ltx-2.3-fast':         'fal-ai/ltx-video-v0-9-7',
  'pika-2.5':             'fal-ai/pika-v2-turbo',
  'pixverse-c1':          'fal-ai/pixverse/v4.5',
  'pixverse-v6':          'fal-ai/pixverse/v4',
  'hunyuan-video-1.5':    'fal-ai/hunyuan-video',
  'hunyuan-hy-motion':    'fal-ai/hunyuan-video',
  'hunyuan-world-mirror': 'fal-ai/hunyuan-video',
  'nano-banana-2':        'fal-ai/gemini-flash-image',
}

export const TIER_ENGINE_MAP: Record<string, string> = {
  'draft':     'ltx-2.3-fast',
  'standard':  'wan-2.2',
  'cinematic': 'luma-ray3',
  'film':      'kling-3.0',
}
