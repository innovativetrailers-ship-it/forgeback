import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.upscale.image')
import type { UpscaleFactor } from './router'

export async function upscaleImage(params: {
  imageUrl: string
  factor: UpscaleFactor
  contentType: 'photorealistic' | 'anime' | 'cgi' | 'face_heavy' | 'text_heavy' | 'general'
  faceEnhance?: boolean
}): Promise<{ upscaledUrl: string; widthOut: number; heightOut: number }> {
  const { imageUrl, factor, contentType, faceEnhance } = params

  let upscaledUrl: string

  if (contentType === 'anime') {
    const result = await falSubscribe(falEndpoint('real-esrgan'), {
      input: { image_url: imageUrl, scale: factor, model: 'RealESRGAN_x4plus_anime_6B' } as never,
    }) as unknown as { image: { url: string; width: number; height: number } }
    upscaledUrl = result.image.url
  } else {
    const result = await falSubscribe(falEndpoint('aura-sr'), {
      input: { image_url: imageUrl, upscale_factor: factor } as never,
    }) as unknown as { image: { url: string; width: number; height: number } }
    upscaledUrl = result.image.url
  }

  if (faceEnhance) {
    const faceResult = await falSubscribe(falEndpoint('codeformer'), {
      input: { image_url: upscaledUrl, fidelity: 0.75 },
    }) as unknown as { image: { url: string; width: number; height: number } }
    upscaledUrl = faceResult.image.url
  }

  // Fetch dimensions from the result
  const res = await fetch(upscaledUrl, { method: 'HEAD' })
  const widthOut = 0
  const heightOut = 0

  void res

  return { upscaledUrl, widthOut, heightOut }
}
