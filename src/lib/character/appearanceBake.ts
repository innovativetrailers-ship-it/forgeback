import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '@/lib/fal/client'
const falSubscribe = falSubscribeBound('lib.character.appearanceBake')
import type { FCCCharacter } from './fccSchema'
import { buildModificationPrompt } from './identityLock'

function extractImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const images = d.images as Array<{ url?: string }> | undefined
  if (images?.[0]?.url) return images[0].url
  const image = d.image as { url?: string } | undefined
  if (image?.url) return image.url
  return null
}

function buildWardrobePrompt(wardrobe: FCCCharacter['wardrobe']): string {
  return wardrobe
    .filter((w) => Boolean(w) && typeof w.prompt === 'string')
    .map((w) => `${w.region}: ${w.prompt}`)
    .join(', ')
}

export function buildAppearanceBakePrompt(char: FCCCharacter): string {
  const mod = buildModificationPrompt(char.appearance)
  const ward = buildWardrobePrompt(char.wardrobe)
  return [
    'photorealistic character portrait, same person, same pose',
    mod,
    ward,
    'high detail skin texture, studio lighting',
  ]
    .filter(Boolean)
    .join(', ')
}

export async function bakeAppearancePreview(char: FCCCharacter): Promise<string> {
  if (!char.refFront) throw new Error('Character needs a reference image to bake.')
  const sourceUrl = char.refFront
  const prompt = buildAppearanceBakePrompt(char)

  let outUrl: string | null = null
  try {
    const result = await falSubscribe(falEndpoint('flux/dev/image-to-image'), {
      input: { image_url: sourceUrl, prompt, strength: 0.55, num_images: 1 },
    })
    outUrl = extractImageUrl(result.data)
  } catch (err) {
    console.warn("[caught] src/lib/character/appearanceBake.ts:47", err instanceof Error ? { name: err.name, message: err.message } : err)

    const fallback = await falSubscribe(falEndpoint('flux/dev'), { input: { prompt } })
    outUrl = extractImageUrl(fallback.data)
  }
  if (!outUrl) throw new Error('Appearance bake returned no image.')
  return outUrl
}
