import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from './client'

async function upscaleRaw(
  imageUrl: string,
  scale: 2 | 4 = 4,
  model: 'aura' | 'esrgan' | 'clarity' | 'codeformer' = 'aura'
): Promise<string> {
  interface UpscaleResult {
    image?: { url: string }
    images?: Array<{ url: string }>
  }

  const modelMap: Record<string, string> = {
    aura: falEndpoint('aura-sr'),
    esrgan: falEndpoint('real-esrgan'),
    clarity: falEndpoint('clarity-upscaler'),
    codeformer: falEndpoint('codeformer'),
  }

  const result = await runFal<UpscaleResult>(modelMap[model] ?? modelMap.aura, {
    image_url: imageUrl,
    ...(model === 'aura' && { upscaling_factor: scale }),
    ...(model === 'esrgan' && { scale }),
    ...(model === 'clarity' && { scale }),
  })

  return result.image?.url ?? result.images?.[0]?.url ?? imageUrl
}

async function removeBackgroundRaw(imageUrl: string): Promise<string> {
  interface RembgResult {
    image?: { url: string }
  }

  const result = await runFal<RembgResult>(falEndpoint('birefnet'), {
    image_url: imageUrl,
  })

  return result.image?.url ?? imageUrl
}

export async function restoreFace(imageUrl: string): Promise<string> {
  interface CodeformerResult {
    image?: { url: string }
  }

  const result = await runFal<CodeformerResult>(falEndpoint('codeformer'), {
    image_url: imageUrl,
    fidelity: 0.7,
  })

  return result.image?.url ?? imageUrl
}

export async function generateProxyFrame(prompt: string): Promise<string> {
  interface FluxResult {
    images?: Array<{ url: string }>
  }

  const result = await runFal<FluxResult>(falEndpoint('flux/schnell'), {
    prompt,
    image_size: 'landscape_16_9' as const,
    num_inference_steps: 4,
  })

  return result.images?.[0]?.url ?? ''
}

export async function upscaleImage(
  imageUrl: string,
  model: 'aura-sr' | 'esrgan' | 'clarity' | 'codeformer' = 'aura-sr'
): Promise<{ upscaledUrl: string }> {
  const modelKey = (model === 'aura-sr' ? 'aura' : model) as 'aura' | 'esrgan' | 'clarity' | 'codeformer'
  const upscaledUrl = await upscaleRaw(imageUrl, 4, modelKey)
  return { upscaledUrl }
}

export async function removeBackground(imageUrl: string): Promise<{ maskedUrl: string }> {
  const maskedUrl = await removeBackgroundRaw(imageUrl)
  return { maskedUrl }
}

export async function extractDepthMap(imageUrl: string): Promise<{ depthUrl: string }> {
  interface DepthResult {
    image?: { url: string }
  }

  const result = await runFal<DepthResult>(falEndpoint('imageutils/depth'), {
    image_url: imageUrl,
  })

  return { depthUrl: result.image?.url ?? imageUrl }
}

export async function upscale4x(imageUrl: string): Promise<{ upscaledUrl: string }> {
  return upscaleImage(imageUrl, 'aura-sr')
}

export async function checkNSFWImage(imageUrl: string): Promise<{ safe: boolean; score: number }> {
  interface NSFWResult {
    has_nsfw_concept?: boolean[]
    safety_checker_result?: Array<{ is_nsfw: boolean; score: number }>
  }

  try {
    const result = await runFal<NSFWResult>(falEndpoint('nsfw-detector'), {
      image_url: imageUrl,
    })

    const isNsfw = result.has_nsfw_concept?.[0] ?? false
    const score = result.safety_checker_result?.[0]?.score ?? (isNsfw ? 0.9 : 0.05)
    return { safe: !isNsfw, score }
  } catch (err) {
    console.warn("[caught] src/lib/fal/enhancement.ts:113", err instanceof Error ? { name: err.name, message: err.message } : err)

    return { safe: true, score: 0 }
  }
}
