/**
 * MoGRTGenerator — AI-generated Motion Graphics Template on demand (E06).
 * Uses Claude to generate a Remotion component config from a natural language description.
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface RemotionComponentConfig {
  name:        string
  duration:    number   // frames at 30fps
  width:       number
  height:      number
  props:       Record<string, unknown>
  layers:      RemotionLayer[]
}

export interface RemotionLayer {
  type:        'text' | 'rect' | 'shape' | 'image' | 'animation'
  from:        number
  durationIn:  number
  props:       Record<string, unknown>
  animation?:  { property: string; from: unknown; to: unknown; easing: string }[]
}

const REMOTION_SCHEMA_PROMPT = `
You are a Remotion animation expert. Generate a Remotion component config as JSON.
The config defines layers with keyframe animations.

Rules:
- duration: total frames (30fps, so 90 = 3 seconds)
- each layer has from/durationIn in frames
- text layers: { type:"text", props: { text, fontSize, color, fontFamily, x, y } }
- rect layers: { type:"rect", props: { x, y, width, height, color, opacity } }
- animation: array of { property, from, to, easing: "linear"|"ease-in"|"ease-out"|"spring" }
- keep it under 8 layers total
`.trim()

export async function generateMoGRT(description: string): Promise<RemotionComponentConfig> {
  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [{
      role:    'user',
      content: `${REMOTION_SCHEMA_PROMPT}\n\nGenerate a motion graphics template for: "${description}"\n\nReturn only valid JSON matching the RemotionComponentConfig schema.`,
    }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const jsonMatch = content.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')

  return JSON.parse(jsonMatch[0]) as RemotionComponentConfig
}

// 200 pre-defined Remotion template stubs (E05)
export const MOGRT_TEMPLATES = [
  // Lower thirds (50)
  ...Array.from({ length: 50 }, (_, i) => ({
    id:       `lower-third-${i + 1}`,
    category: 'lower-thirds',
    name:     `Lower Third ${i + 1}`,
    thumb:    `/mogrt/thumbs/lower-third-${i + 1}.jpg`,
    duration: 90,   // 3s
    editableProps: ['name', 'title', 'color', 'font'],
  })),
  // Title cards (40)
  ...Array.from({ length: 40 }, (_, i) => ({
    id:       `title-card-${i + 1}`,
    category: 'title-cards',
    name:     `Title Card ${i + 1}`,
    thumb:    `/mogrt/thumbs/title-card-${i + 1}.jpg`,
    duration: 120,  // 4s
    editableProps: ['title', 'subtitle', 'color', 'background'],
  })),
  // Transitions (40)
  ...Array.from({ length: 40 }, (_, i) => ({
    id:       `transition-${i + 1}`,
    category: 'transitions',
    name:     `Transition ${i + 1}`,
    thumb:    `/mogrt/thumbs/transition-${i + 1}.jpg`,
    duration: 30,   // 1s
    editableProps: ['color', 'direction'],
  })),
  // Social overlays (30)
  ...Array.from({ length: 30 }, (_, i) => ({
    id:       `social-${i + 1}`,
    category: 'social-overlays',
    name:     `Social Overlay ${i + 1}`,
    thumb:    `/mogrt/thumbs/social-${i + 1}.jpg`,
    duration: 60,
    editableProps: ['username', 'handle', 'platform', 'color'],
  })),
  // End screens (20)
  ...Array.from({ length: 20 }, (_, i) => ({
    id:       `end-screen-${i + 1}`,
    category: 'end-screens',
    name:     `End Screen ${i + 1}`,
    thumb:    `/mogrt/thumbs/end-screen-${i + 1}.jpg`,
    duration: 240,  // 8s
    editableProps: ['headline', 'cta', 'socialLinks', 'color'],
  })),
  // Other (20)
  ...Array.from({ length: 20 }, (_, i) => ({
    id:       `other-${i + 1}`,
    category: 'other',
    name:     `Template ${i + 1}`,
    thumb:    `/mogrt/thumbs/other-${i + 1}.jpg`,
    duration: 90,
    editableProps: ['text', 'color'],
  })),
]

export type MoGRTTemplate = typeof MOGRT_TEMPLATES[number]
