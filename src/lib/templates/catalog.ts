import type { ProductionBreakdown } from '@cinema/core'
import type { StructuredShot } from '@/lib/orchestration/types'

export const TEMPLATE_CATEGORIES = [
  'Ad',
  'Trailer',
  'Explainer',
  'Vlog',
  'Product',
  'Montage',
  'Talking-head',
  'Social hook',
  'Music-video',
  'Cinematic',
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export interface TemplateFormat {
  aspect: '16:9' | '9:16' | '2.39:1'
  platform: string
  durationTarget: number
}

export interface TemplateStyle {
  look: string
  grade: string
  pacing: string
  lut?: string
}

export interface FilmTemplateRecord {
  id: string
  name: string
  category: TemplateCategory
  format: TemplateFormat
  breakdown: ProductionBreakdown
  style: TemplateStyle
  captionStyle?: string
  isPublic: boolean
  createdBy: string | null
}

function shot(id: string, duration: number, description: string, type: string, movement: string): ProductionBreakdown['scenes'][0]['shots'][0] {
  return {
    id,
    duration,
    description,
    type,
    angle: 'eye',
    movement,
    entityRefs: [{ entityId: 'hero' }],
    continuity: 'cut',
  }
}

function film(id: string, name: string, category: TemplateCategory, aspect: TemplateFormat['aspect'], platform: string, duration: number, look: string, grade: string, shots: ProductionBreakdown['scenes'][0]['shots']): FilmTemplateRecord {
  return {
    id,
    name,
    category,
    format: { aspect, platform, durationTarget: duration },
    style: { look, grade, pacing: 'measured', lut: grade },
    captionStyle: 'lower-third',
    isPublic: true,
    createdBy: null,
    breakdown: {
      scenes: [{ id: 'scene-1', location: '{{PLACE}}', description: name, shots }],
      entities: [{ id: 'hero', kind: 'character', name: '{{HERO}}', descriptor: 'The subject of this film', appearsInShots: shots.map((row) => row.id) }],
    },
  }
}

export const BUILT_IN_TEMPLATES: FilmTemplateRecord[] = [
  film('builtin-ad', 'Product promise', 'Ad', '16:9', 'web', 15, 'clean commercial', 'kodak_2383', [
    shot('s1', 4, '{{PRODUCT}} on a clean surface, one clear action', 'CU', 'static'),
    shot('s2', 5, '{{HERO}} uses {{PRODUCT}}', 'MS', 'dolly_in'),
    shot('s3', 6, 'Logo card for {{LOGO}}', 'WS', 'static'),
  ]),
  film('builtin-trailer', 'Trailer rise', 'Trailer', '2.39:1', 'cinema', 20, 'widescreen tension', 'kodak_5219', [
    shot('s1', 5, 'Wide view of {{PLACE}}', 'WS', 'crane'),
    shot('s2', 4, '{{HERO}} turns toward camera', 'CU', 'static'),
    shot('s3', 6, 'The stakes land in one action', 'MS', 'handheld'),
  ]),
  film('builtin-explainer', 'Three-step explain', 'Explainer', '16:9', 'web', 18, 'clear daylight', 'fuji_3510', [
    shot('s1', 6, '{{HERO}} states the problem', 'MS', 'static'),
    shot('s2', 6, 'Show {{PRODUCT}} solving it', 'CU', 'pan_left'),
    shot('s3', 6, 'The result, one action', 'WS', 'static'),
  ]),
  film('builtin-vlog', 'Day open', 'Vlog', '16:9', 'youtube', 15, 'natural', 'fuji_3510', [
    shot('s1', 5, '{{HERO}} walks into {{PLACE}}', 'MS', 'handheld'),
    shot('s2', 5, 'A detail they notice', 'CU', 'static'),
    shot('s3', 5, 'They address the camera', 'MCU', 'static'),
  ]),
  film('builtin-product', 'Hero product', 'Product', '16:9', 'web', 12, 'studio', 'kodak_2383', [
    shot('s1', 4, '{{PRODUCT}} rotates once', 'CU', 'orbit'),
    shot('s2', 4, 'A hand uses {{PRODUCT}}', 'MS', 'static'),
    shot('s3', 4, '{{LOGO}} on a quiet end card', 'WS', 'static'),
  ]),
  film('builtin-montage', 'Three beats', 'Montage', '16:9', 'social', 12, 'rhythmic', 'kodak_5219', [
    shot('s1', 3, '{{HERO}} in {{PLACE}}, beat one', 'WS', 'static'),
    shot('s2', 3, 'Beat two, a closer action', 'CU', 'handheld'),
    shot('s3', 3, 'Beat three, the turn', 'MS', 'dolly_in'),
  ]),
  film('builtin-talk', 'To camera', 'Talking-head', '16:9', 'youtube', 15, 'soft key', 'fuji_3510', [
    shot('s1', 8, '{{HERO}} speaks one idea to camera', 'MCU', 'static'),
    shot('s2', 7, 'Cutaway of {{PRODUCT}}', 'CU', 'static'),
  ]),
  film('builtin-hook', 'Social hook', 'Social hook', '9:16', 'tiktok', 9, 'punchy', 'kodak_2383', [
    shot('s1', 3, '{{HERO}} starts mid-action', 'CU', 'handheld'),
    shot('s2', 3, 'The reveal of {{PRODUCT}}', 'MS', 'static'),
    shot('s3', 3, 'End on {{LOGO}}', 'WS', 'static'),
  ]),
  film('builtin-music', 'Music piece', 'Music-video', '16:9', 'social', 15, 'stylised', 'kodak_5219', [
    shot('s1', 5, '{{HERO}} moves through {{PLACE}}', 'WS', 'track'),
    shot('s2', 5, 'A gesture on the beat', 'CU', 'orbit'),
    shot('s3', 5, 'Wide release', 'WS', 'crane'),
  ]),
  film('builtin-cinematic', 'Quiet scene', 'Cinematic', '2.39:1', 'cinema', 18, 'dramatic', 'kodak_5219', [
    shot('s1', 6, '{{PLACE}} at rest', 'WS', 'static'),
    shot('s2', 6, '{{HERO}} crosses the frame', 'MS', 'dolly_in'),
    shot('s3', 6, 'They stop and look', 'CU', 'static'),
  ]),
]

export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1] ?? ''))].filter(Boolean)
}

export function applyPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (token, name: string) => values[name]?.trim() || token)
}

export function stripMediaText(value: string): string {
  return value.replace(/https?:\/\/\S+/g, '{{CLIP}}')
}

export function templateToShots(template: FilmTemplateRecord, fills: Record<string, string> = {}): StructuredShot[] {
  let index = 0
  return template.breakdown.scenes.flatMap((scene) => scene.shots.map((shot) => {
    const prompt = applyPlaceholders(shot.description, fills)
    const row: StructuredShot = {
      shotIndex: index,
      startSeconds: 0,
      endSeconds: shot.duration,
      duration: shot.duration,
      contentType: 'physical_action',
      visualPrompt: prompt,
      cameraMove: shot.movement ?? 'static',
      cameraAngle: shot.angle,
      shotSize: shot.type,
      motionLevel: 'medium',
      hasDialogue: template.category === 'Talking-head',
      hasFaces: true,
      hasAudio: false,
      hasCGI: false,
      charactersPresent: template.breakdown.entities.filter((entity) => entity.kind === 'character').map((entity) => applyPlaceholders(entity.name, fills)),
      locationsPresent: scene.location ? [applyPlaceholders(scene.location, fills)] : [],
      lighting: 'natural_day',
      mood: template.style.look,
      bridgeRequired: index > 0,
      continuityGroup: 0,
      isChainStart: index === 0,
      transition: { kind: 'cut' },
    }
    index += 1
    return row
  }))
}
