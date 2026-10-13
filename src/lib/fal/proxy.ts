import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from './client'

export async function generateProxyDraft(
  prompt: string,
  aspectRatio: string = '16:9'
): Promise<string> {
  interface FluxResult {
    images?: Array<{ url: string }>
  }

  const sizeMap: Record<string, string> = {
    '16:9': 'landscape_16_9',
    '9:16': 'portrait_16_9',
    '1:1': 'square',
    '4:3': 'landscape_4_3',
    '21:9': 'landscape_16_9',
  }

  const result = await runFal<FluxResult>(falEndpoint('flux/schnell'), {
    prompt,
    image_size: (sizeMap[aspectRatio] ?? 'landscape_16_9') as 'landscape_16_9' | 'portrait_16_9' | 'square' | 'landscape_4_3',
    num_inference_steps: 4,
    num_images: 1,
  })

  return result.images?.[0]?.url ?? ''
}
