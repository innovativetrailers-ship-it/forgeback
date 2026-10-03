import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from '../fal/client'

interface HarmoniseResult {
  originalUrl: string
  normalisedUrl: string
  modelFamily: string
}

const MODEL_FAMILY_GRAIN: Record<string, number> = {
  kling: 0.3,
  veo3: 0.1,
  luma: 0.15,
  runway: 0.2,
  seedance: 0.25,
  wan: 0.3,
  minimax: 0.35,
  default: 0.2,
}

export async function harmoniseClips(
  clips: Array<{ url: string; modelFamily: string }>
): Promise<HarmoniseResult[]> {
  if (clips.length === 0) return []

  // Determine target style from the highest-quality clip (least grain)
  const targetGrain = Math.min(...clips.map((c) => MODEL_FAMILY_GRAIN[c.modelFamily] ?? 0.2))

  const results = await Promise.allSettled(
    clips.map(async (clip) => {
      const sourceGrain = MODEL_FAMILY_GRAIN[clip.modelFamily] ?? 0.2

      // Only normalise if there's a meaningful difference
      if (Math.abs(sourceGrain - targetGrain) < 0.05) {
        return { originalUrl: clip.url, normalisedUrl: clip.url, modelFamily: clip.modelFamily }
      }

      try {
        interface Img2ImgResult {
          images?: Array<{ url: string }>
          image?: { url: string }
        }

        const result = await runFal(falEndpoint('flux/dev/image-to-image'), {
            image_url: clip.url,
            prompt: 'cinematic, film grade, consistent colour grading, professional cinematography',
            strength: 0.15,
            num_inference_steps: 20,
          }) as Img2ImgResult

        const normalisedUrl = result.images?.[0]?.url ?? result.image?.url ?? clip.url
        return { originalUrl: clip.url, normalisedUrl, modelFamily: clip.modelFamily }
      } catch (err) {
        console.warn("[caught] src/lib/timeline/harmonise.ts:52", err instanceof Error ? { name: err.name, message: err.message } : err)

        return { originalUrl: clip.url, normalisedUrl: clip.url, modelFamily: clip.modelFamily }
      }
    })
  )

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { originalUrl: clips[i].url, normalisedUrl: clips[i].url, modelFamily: clips[i].modelFamily }
  )
}

export async function matchGrainLevel(
  imageUrl: string,
  targetGrain: number
): Promise<string> {
  // Grain levels 0-1 where 0 = clean, 1 = heavy grain
  if (targetGrain < 0.1) return imageUrl

  try {
    interface GrainResult {
      image?: { url: string }
    }

    const result = await runFal(falEndpoint('flux/dev/image-to-image'), {
        image_url: imageUrl,
        prompt: `${targetGrain > 0.5 ? 'heavy' : 'subtle'} film grain, cinematic texture`,
        strength: targetGrain * 0.2,
        num_inference_steps: 10,
      }) as GrainResult

    return result.image?.url ?? imageUrl
  } catch (err) {
    console.warn("[caught] src/lib/timeline/harmonise.ts:85", err instanceof Error ? { name: err.name, message: err.message } : err)

    return imageUrl
  }
}
