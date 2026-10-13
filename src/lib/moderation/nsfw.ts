import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from '../fal/client'

export interface ModerationResult {
  safe: boolean
  score: number
  categories: string[]
}

interface NSFWFalResult {
  nsfw_probability?: number
  is_safe?: boolean
  categories?: string[]
}

async function checkImage(imageUrl: string): Promise<ModerationResult> {
  const result = await runFal(falEndpoint('nsfw-detector'), { image_url: imageUrl }) as NSFWFalResult

  const score = result.nsfw_probability ?? 0
  return {
    safe: score < 0.7,
    score,
    categories: result.categories ?? [],
  }
}

export async function checkNSFW(
  mediaUrl: string,
  type: 'image' | 'video' = 'image'
): Promise<ModerationResult> {
  if (!process.env.NSFW_CHECK_ENABLED || process.env.NSFW_CHECK_ENABLED === 'false') {
    return { safe: true, score: 0, categories: [] }
  }

  if (type === 'image') {
    return checkImage(mediaUrl)
  }

  try {
    const { extractVideoFrameSamples } = await import('@/lib/fal/frameExtract')
    const frameUrls = await extractVideoFrameSamples(mediaUrl, 5)

    const results = await Promise.all(frameUrls.slice(0, 10).map(checkImage))

    const maxScore = Math.max(...results.map((r) => r.score))
    const allCategories = [...new Set(results.flatMap((r) => r.categories))]

    return {
      safe: maxScore < 0.7,
      score: maxScore,
      categories: allCategories,
    }
  } catch (err) {
    console.warn("[caught] src/lib/moderation/nsfw.ts:52", err instanceof Error ? { name: err.name, message: err.message } : err)

    // If frame extraction fails, check the first frame as image
    return checkImage(mediaUrl)
  }
}
