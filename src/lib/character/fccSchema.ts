// Forge Character Container — V2 web types (mirrors V3 desktop).

export type WardrobeRegion =
  | 'full_body'
  | 'torso'
  | 'legs'
  | 'feet'
  | 'head'
  | 'hands'
  | 'accessories'

export interface CharacterAppearance {
  skinTone: number
  melanin: number
  acneDensity: number
  redness: number
  poreScale: number
  sweatShimmer: number
  structuralAge: number
  scarDepth: number
  wrinkleFreq: number
  blemishOpacity: number
  muscularityPct: number
  bodyFatIndex: number
  vascularity: number
  skeletalScale: number
  follicleD: number
  strandThickness: number
  hairLength: number
}

export interface WardrobeItem {
  id: string
  region: WardrobeRegion
  prompt: string
  refImageUrl: string
  lockedHash: string
  appliedAt: string
}

export interface FCCCharacter {
  id: string
  name: string
  projectId: string
  createdAt: string
  faceEmbedding: number[]
  bodyEmbedding: number[]
  loraWeightsRef?: string
  refFront: string
  refProfile?: string
  ref3Quarter?: string
  refBack?: string
  appearance: CharacterAppearance
  wardrobe: WardrobeItem[]
  behavioralPrompt: string
}

export interface FCCCharacterView extends FCCCharacter {
  refFrontUrl: string | null
  refProfileUrl: string | null
  ref3QuarterUrl: string | null
  refBackUrl: string | null
  hasFcc: boolean
}

export const WARDROBE_REGIONS: readonly WardrobeRegion[] = [
  'full_body',
  'torso',
  'legs',
  'feet',
  'head',
  'hands',
  'accessories',
] as const

export const APPEARANCE_SLIDERS: Array<{ key: keyof CharacterAppearance; label: string; min: number; max: number }> = [
  { key: 'structuralAge', label: 'Age', min: 18, max: 90 },
  { key: 'muscularityPct', label: 'Muscle', min: 0, max: 100 },
  { key: 'bodyFatIndex', label: 'Body fat', min: 5, max: 40 },
  { key: 'skinTone', label: 'Skin tone', min: 0, max: 100 },
  { key: 'melanin', label: 'Melanin', min: 0, max: 1 },
  { key: 'hairLength', label: 'Hair length', min: 0, max: 500 },
  { key: 'scarDepth', label: 'Scars', min: 0, max: 1 },
  { key: 'wrinkleFreq', label: 'Wrinkles', min: 0, max: 1 },
]

export function defaultAppearance(): CharacterAppearance {
  return {
    skinTone: 50,
    melanin: 0.4,
    acneDensity: 0,
    redness: 0.2,
    poreScale: 0.3,
    sweatShimmer: 0,
    structuralAge: 30,
    scarDepth: 0,
    wrinkleFreq: 0.1,
    blemishOpacity: 0,
    muscularityPct: 40,
    bodyFatIndex: 18,
    vascularity: 0.2,
    skeletalScale: 1.0,
    follicleD: 0.7,
    strandThickness: 0.3,
    hairLength: 150,
  }
}

export function mergeAppearance(
  base: CharacterAppearance,
  patch: Partial<CharacterAppearance>,
): CharacterAppearance {
  return { ...base, ...patch }
}

export function validateAppearancePatch(patch: Partial<CharacterAppearance>): string | null {
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return `Invalid appearance value for ${key}`
    }
  }
  return null
}

export function parseAppearanceJson(raw: unknown): CharacterAppearance {
  if (!raw || typeof raw !== 'object') return defaultAppearance()
  return mergeAppearance(defaultAppearance(), raw as Partial<CharacterAppearance>)
}

interface StoredFCC {
  v: 1
  data: FCCCharacter
}

export function serializeFCC(char: FCCCharacter): string {
  return JSON.stringify({ v: 1, data: char } satisfies StoredFCC)
}

export function deserializeFCC(raw: string): FCCCharacter | null {
  try {
    const parsed = JSON.parse(raw) as StoredFCC
    if (parsed?.v === 1 && parsed.data?.id) return parsed.data
    return null
  } catch (err) {
    console.warn("[caught] src/lib/character/fccSchema.ts:144", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

export function parseEmbeddingJson(raw: unknown): number[] {
  if (!raw || typeof raw !== 'object') return []
  const d = raw as { embedding?: unknown }
  if (!Array.isArray(d.embedding)) return []
  return d.embedding.filter((n): n is number => typeof n === 'number')
}
