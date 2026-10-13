import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from './client'

export interface RelightInput {
  imageUrl: string
  hdriUrl?: string
  prompt?: string
  environmentPreset?: 'studio' | 'outdoor_day' | 'outdoor_night' | 'sunset' | 'overcast' | 'custom'
  colorTemperature?: number // 2700-7500K
}

export interface RelightOutput {
  imageUrl: string
  normalMapUrl?: string
}

export const ICLIGHT_ENDPOINT = falEndpoint('iclight-v2')

const PRESET_PROMPTS: Record<string, string> = {
  studio: 'studio lighting, soft boxes, professional photography',
  outdoor_day: 'bright outdoor daylight, sun overhead, natural shadows',
  outdoor_night: 'night scene, moonlight, ambient city glow',
  sunset: 'golden hour, warm directional light, long shadows',
  overcast: 'overcast sky, soft diffused light, no harsh shadows',
}

export async function relightImage(input: RelightInput): Promise<RelightOutput> {
  interface ICLightResult {
    images?: Array<{ url: string }>
  }

  const result = await runFal<ICLightResult>(ICLIGHT_ENDPOINT, {
    image_url: input.imageUrl,
    prompt:
      input.prompt ??
      PRESET_PROMPTS[input.environmentPreset ?? 'studio'] ??
      'natural lighting',
    num_inference_steps: 28,
    ...(input.hdriUrl && { background_image_url: input.hdriUrl }),
  })

  return { imageUrl: result.images?.[0]?.url ?? input.imageUrl }
}

export async function generateDepthMap(imageUrl: string): Promise<string> {
  interface DepthResult {
    image?: { url: string }
  }

  const result = await runFal<DepthResult>(falEndpoint('imageutils/depth'), {
    image_url: imageUrl,
  })

  return result.image?.url ?? imageUrl
}

export async function generateNormalMap(imageUrl: string): Promise<string> {
  interface NormalResult {
    image?: { url: string }
  }

  const result = await runFal<NormalResult>(falEndpoint('normal-bae'), {
    image_url: imageUrl,
  })

  return result.image?.url ?? imageUrl
}

// Aliases used in the CGI pipeline and tests
export async function relightScene(params: {
  imageUrl: string
  prompt: string
  hdriUrl?: string
  backgroundPrompt?: string
}): Promise<{ outputUrl: string }> {
  const result = await relightImage({ imageUrl: params.imageUrl, prompt: params.prompt, hdriUrl: params.hdriUrl })
  return { outputUrl: result.imageUrl }
}

export async function generateDepthMapFromUrl(imageUrl: string): Promise<{ depthUrl: string }> {
  const depthUrl = await generateDepthMap(imageUrl)
  return { depthUrl }
}

export async function extractNormalMap(imageUrl: string): Promise<{ normalMapUrl: string }> {
  const normalMapUrl = await generateNormalMap(imageUrl)
  return { normalMapUrl }
}

export async function matchLocationLighting(
  locationPlateUrl: string,
  targetImageUrl: string
): Promise<{ relitUrl: string }> {
  const result = await relightImage({
    imageUrl: targetImageUrl,
    prompt: 'match the lighting from the location plate exactly, same colour temperature and direction',
  })
  return { relitUrl: result.imageUrl }
}
