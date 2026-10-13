import { runFal, extractImageUrl, IMAGE_FAL_TIMEOUT_MS } from '@/lib/fal/client'
import { buildImagePayload, IMAGE_MODELS, imageModelForUse, type ImageUse } from '@cinema/core'

export { IMAGE_FAL_TIMEOUT_MS } from '@/lib/fal/client'

export type ImageQuality = 'reference' | 'production'

export function imageModelForQuality(quality: ImageQuality, hasRefs = false): string {
  const use: ImageUse = quality === 'production' ? 'location' : 'keyframe'
  return IMAGE_MODELS[imageModelForUse(use, hasRefs)].endpoint
}

export async function generateImage(
  prompt: string,
  options?: {
    quality?:      ImageQuality
    aspectRatio?:  string
    resolution?:   string
    numImages?:    number
    refImageUrl?:  string
    referenceImageUrl?: string
    imageUrls?:    string[]
    seed?:         number
    onPoll?:       () => void | Promise<void>
    timeoutMs?:    number
  },
): Promise<string[]> {
  const quality = options?.quality ?? 'reference'
  const use: ImageUse = quality === 'production' ? 'location' : 'keyframe'
  const refs = [
    ...(options?.imageUrls ?? []),
    options?.refImageUrl,
    options?.referenceImageUrl,
  ].filter((url): url is string => Boolean(url?.trim()))
  const { endpoint, input } = buildImagePayload({
    model: imageModelForUse(use, refs.length > 0),
    prompt,
    aspectRatio: options?.aspectRatio ?? '16:9',
    resolution: options?.resolution,
    imageUrls: refs,
    numImages: options?.numImages,
    seed: options?.seed,
  })

  const result = await runFal(
    endpoint,
    input,
    undefined,
    options?.timeoutMs ?? IMAGE_FAL_TIMEOUT_MS,
    options?.onPoll,
  )
  const d = result as { images?: Array<{ url?: string }> }
  if (d.images?.length) {
    return d.images.map(i => i.url).filter((u): u is string => Boolean(u))
  }
  const single = extractImageUrl(result)
  return single ? [single] : []
}
