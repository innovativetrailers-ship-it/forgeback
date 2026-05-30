// Knowledge Firewall — Vocabulary sanitiser
// Strips or replaces internal model names, processing engine IDs,
// and technical terminology before content reaches the user-facing layer.

export const ENGINE_ID_TO_DISPLAY: Record<string, string> = {
  veo3:           'Smart processing engine',
  veo_3_1:        'Smart processing engine',
  kling_pro:      'Cinematic processing engine',
  kling_3_0:      'Cinematic processing engine',
  kling_standard: 'Standard processing engine',
  seedance:       'Detail processing engine',
  seedance_2_0:   'Detail processing engine',
  runway:         'Motion processing engine',
  runway_gen4_5:  'Motion processing engine',
  skyreels:       'Portrait processing engine',
  skyreels_v1:    'Portrait processing engine',
  minimax:        'Creative processing engine',
  minimax_hailuo: 'Creative processing engine',
  luma:           'Landscape processing engine',
  wan:            'Balanced processing engine',
  wan_2_2:        'Balanced processing engine',
  cogvideox:      'Text-aware processing engine',
  ltx:            'Fast processing engine',
  ltx_2_3:        'Fast processing engine',
  pika:           'Style processing engine',
  pika_2_2:       'Style processing engine',
  mochi_1:        'Smooth motion engine',
}

export const TIER_ID_TO_DISPLAY: Record<string, string> = {
  Draft:       'Quick Draft',
  Studio:      'Standard',
  Blockbuster: 'Cinematic',
  Film:        'Film Grade',
  draft:       'Quick Draft',
  standard:    'Standard',
  cinematic:   'Cinematic',
  film:        'Film Grade',
}

// Remove all VLM/model names from user-visible text
const MODEL_NAME_PATTERN =
  /\b(Kling|Veo|Seedance|Runway|Luma|Pika|Minimax|Hailuo|HunyuanVideo|Hunyuan|SkyReels|Skyreels|AnimateDiff|Mochi|CogVideoX|LTX|Wan|fal\.ai|FAL|Anthropic|Claude|GPT|Gemini|ByteDance|Google|OpenAI|RunwayML)\b/gi

/** @alias sanitiseForUser — for marketing output pipelines */
export const sanitiseForMarketing = (text: string) => sanitiseForUser(text)

export function sanitiseForUser(text: string): string {
  return text
    .replace(MODEL_NAME_PATTERN, 'smart processing engine')
    .replace(/\bagent\b/gi, 'engine')
    .replace(/\bAI agent\b/gi, 'smart processing engine')
    .replace(/\bmulti-agent\b/gi, 'multi-engine')
    .replace(/\bswarm\b/gi, 'processing pipeline')
    .replace(/\bAgenticLoop\b/gi, 'ReasoningLoop')
    .replace(/\bSwarmRouter\b/gi, 'MediaRouter')
}

export function engineIdToDisplay(engineId: string): string {
  return ENGINE_ID_TO_DISPLAY[engineId] ?? 'Processing engine'
}

export function tierToDisplay(tierId: string): string {
  return TIER_ID_TO_DISPLAY[tierId] ?? tierId
}

// Validate that no internal terminology leaks into user-facing strings
export function auditUserText(text: string): { passed: boolean; violations: string[] } {
  const violations: string[] = []

  const modelMatches = text.match(MODEL_NAME_PATTERN)
  if (modelMatches) violations.push(...modelMatches.map((m) => `Model name leaked: "${m}"`))

  if (/\bagent\b/i.test(text)) violations.push('Term "agent" found in user text')
  if (/\bswarm\b/i.test(text)) violations.push('Term "swarm" found in user text')

  return { passed: violations.length === 0, violations }
}
