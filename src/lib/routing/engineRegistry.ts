/** Per-5s credit rates — silent generation except Grok, which is audio-native. */
import { VIDEO_MODEL_REGISTRY } from '@/lib/models/registry'

export const MODEL_COSTS: Record<string, number> = {
  'gemini-omni':        25,
  'veo-3.1':            23,
  'kling-3.0':          17,
  'seedance-2.0':       20,
  'runway-gen4':        22,
  'grok-imagine-video': 20,
  'wan-2.7':             8,
  'ltx-2.3-fast':        2,
}

export const MODEL_SPECIALTIES: Record<string, {
  costTier:   'budget' | 'mid' | 'premium'
  strengths:  string[]
  weaknesses: string[]
  bestFor:    string
}> = {
  'gemini-omni': {
    costTier:   'premium',
    strengths:  ['quality', 'photorealism', 'character_consistency', 'video_edit', 'text_to_video'],
    weaknesses: ['max_10s'],
    bestFor:    'Primary quality t2v up to 10s. Native audio cannot be switched off; ElevenLabs still owns the mix.',
  },
  'veo-3.1': {
    costTier:   'premium',
    strengths:  ['4k', 'long_takes', 'fluid_dynamics', 'physics', 'photorealism', 'aerial'],
    weaknesses: ['cost', 'slow'],
    bestFor:    '4K and long takes via extend. Secondary to Omni on short quality t2v. Video is silent; ElevenLabs owns audio.',
  },
  'kling-3.0': {
    costTier:   'mid',
    strengths:  ['locomotion', 'hands', 'facial_consistency', 'human_motion', 'vehicle', 'action_choreography'],
    weaknesses: ['environments', 'abstract'],
    bestFor:    'Human movement, vehicle pans, hand close-ups',
  },
  'seedance-2.0': {
    costTier:   'mid',
    strengths:  ['character_detail', 'dialogue', 'fine_motor', 'lip_sync', 'faces'],
    weaknesses: ['environments', 'action'],
    bestFor:    'Dialogue scenes, character close-ups, emotional performance',
  },
  'runway-gen4': {
    costTier:   'mid',
    strengths:  ['multi_shot', 'character_continuity', 'commercial', 'product', 'camera_control'],
    weaknesses: ['abstract', 'physics'],
    bestFor:    'Camera intent written into the prompt. Single start frame.',
  },
  'wan-2.7': {
    costTier:   'budget',
    strengths:  ['volume', 'first_last_frame', 'character_reference'],
    weaknesses: ['hero_quality'],
    bestFor:    'Ordinary production shots, first and last frame, 720p',
  },
  'ltx-2.3-fast': {
    costTier:   'budget',
    strengths:  ['speed', 'iteration', 'draft'],
    weaknesses: ['quality', 'resolution'],
    bestFor:    'Quick drafts, storyboard previews, rapid iteration',
  },
  'grok-imagine-video': {
    costTier:   'mid',
    strengths:  ['native_audio', 'speed', 'photorealism', 'text_to_video', 'creative_style', 'short_clips'],
    weaknesses: ['max_15s'],
    bestFor:    'The one audio-native model: fast clips with synced sound',
  },
}

export const FAL_MODEL_IDS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(VIDEO_MODEL_REGISTRY).map(([k, e]) => [k, e.falEndpoint]),
  ),

  'claude-sonnet': 'openrouter/anthropic/claude-sonnet-4-6',
  'claude-haiku':  'openrouter/anthropic/claude-haiku-4-5',
  'grok-3':        'openrouter/x-ai/grok-3',
  'groq-llama':    'openrouter/groq/llama-3.3-70b-versatile',
  'kimi-k2':       'openrouter/moonshotai/kimi-k2-0905',
  'qwen-max':      'openrouter/qwen/qwen3-7b-max',
}

export const TIER_ENGINE_MAP: Record<string, string> = {
  draft:     'ltx-2.3-fast',
  standard:  'seedance-2.0',
  cinematic: 'kling-3.0',
  film:      'gemini-omni',
}

export const MODEL_COUNCIL_DISPLAY: Array<{
  id:       string
  name:     string
  role:     string
  tagline:  string
  dotColor: string
}> = [
  { id: 'gemini-omni',        name: 'Gemini Omni',   role: 'Quality Lead',    tagline: 'Primary quality t2v, up to 10s.',           dotColor: '#f59e0b' },
  { id: 'veo-3.1',            name: 'Veo 3.1',       role: '4K / Long',       tagline: '4K and long takes. Silent picture.',        dotColor: '#a855f7' },
  { id: 'kling-3.0',          name: 'Kling 3.0',     role: 'Motion Expert',   tagline: 'Camera movement, locomotion',               dotColor: '#3b82f6' },
  { id: 'seedance-2.0',       name: 'Seedance 2.0',  role: 'Performance',     tagline: 'Faces, dialogue, continuity',               dotColor: '#22c55e' },
  { id: 'runway-gen4',        name: 'Runway Gen-4.5', role: 'Camera Control', tagline: 'Camera sentence in the prompt',             dotColor: '#ec4899' },
  { id: 'grok-imagine-video', name: 'Grok Imagine',  role: 'Audio-Native',    tagline: 'The one model that bakes sound',            dotColor: '#e879f9' },
  { id: 'wan-2.7',            name: 'Wan 2.7',       role: 'Budget',          tagline: 'Volume, first and last frame, 720p',        dotColor: '#06b6d4' },
  { id: 'ltx-2.3-fast',       name: 'LTX Fast',      role: 'Draft Artist',    tagline: 'Instant pre-vis drafts',                    dotColor: '#2dd4bf' },
]
