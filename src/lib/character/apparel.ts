import { falEndpoint } from '@cinema/core/endpoints'
import { createHash, randomUUID } from 'node:crypto'
import { fal, falSubscribeBound} from '@/lib/fal/client'
const falSubscribe = falSubscribeBound('lib.character.apparel')
import type { FCCCharacter, WardrobeItem, WardrobeRegion } from './fccSchema'

function extractImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const image = d.image as { url?: string } | undefined
  if (image?.url) return image.url
  const images = d.images as Array<{ url?: string }> | undefined
  if (images?.[0]?.url) return images[0].url
  if (typeof d.url === 'string') return d.url
  return null
}

async function hashGarment(url: string): Promise<string> {
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  return createHash('sha256').update(buf).digest('hex')
}

export async function applyGarment(
  character: FCCCharacter,
  region: WardrobeRegion,
  prompt: string,
  garmentImageUrl?: string,
): Promise<{ character: FCCCharacter; tryOnImageUrl: string }> {
  if (!character.refFront) throw new Error('Character needs a front reference before applying wardrobe.')

  let garmentUrl = garmentImageUrl
  if (!garmentUrl) {
    const gen = await falSubscribe(falEndpoint('flux/dev'), {
      input: {
        prompt: `isolated ${region} garment on white background: ${prompt}`,
        image_size: 'square',
        num_images: 1,
      },
    })
    garmentUrl = extractImageUrl(gen.data) ?? undefined
    if (!garmentUrl) throw new Error('Could not generate garment reference.')
  }

  const tryOn = await falSubscribe(falEndpoint('catvton'), {
    input: {
      human_image_url: character.refFront,
      garment_image_url: garmentUrl,
      garment_description: prompt,
    },
  })
  const tryOnImageUrl = extractImageUrl(tryOn.data)
  if (!tryOnImageUrl) throw new Error('CatVTON returned no image.')

  const lockedHash = await hashGarment(garmentUrl)
  const item: WardrobeItem = {
    id: randomUUID(),
    region,
    prompt,
    refImageUrl: garmentUrl,
    lockedHash,
    appliedAt: new Date().toISOString(),
  }

  const wardrobe = [...character.wardrobe.filter((w) => w.region !== region), item]
  return {
    character: {
      ...character,
      refFront: tryOnImageUrl,
      wardrobe,
    },
    tryOnImageUrl,
  }
}
