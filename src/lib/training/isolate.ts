import { UTILITY_ENDPOINTS } from '@cinema/core'
import { submitToFal, pollFalResult } from '@/lib/fal/falQueue'
import { isGenerationPausedError } from '@/lib/generation/pause'

function isolatedUrl(data: Record<string, unknown>): string | undefined {
  const image = data.image as { url?: string } | undefined
  if (typeof image?.url === 'string') return image.url
  const images = data.images as Array<{ url?: string }> | undefined
  if (typeof images?.[0]?.url === 'string') return images[0].url
  if (typeof data.image_url === 'string') return data.image_url
  return undefined
}

/** Optional SAM-3 subject isolation. Failures leave the original file in the zip. */
export async function isolateSubjectImage(imageUrl: string, prompt?: string): Promise<Buffer | null> {
  try {
    const submission = await submitToFal(
      UTILITY_ENDPOINTS.sam3ImageRle,
      {
        image_url: imageUrl,
        apply_mask: true,
        text_prompt: prompt?.trim() || 'subject',
      },
      'training.prep',
    )
    const result = await pollFalResult(submission, { timeoutMs: 120_000 })
    const url = isolatedUrl(result.data)
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    if (isGenerationPausedError(err)) throw err
    return null
  }
}
