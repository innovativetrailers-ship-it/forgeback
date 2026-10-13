import { falEndpoint } from '@cinema/core/endpoints'
import { runFal, extractVideoUrl } from '@/lib/fal/client'
import { CHAIN_CLIP_SECONDS } from '@cinema/core'

const TRIM_VIDEO = falEndpoint('workflow-utilities/trim-video')

/**
 * Opening 3 seconds of a finished shot. The trim endpoint is
 * workflow-utilities/trim-video (OpenAPI 200): start_time, end_time, video_url.
 */
export async function extractChainClip(videoUrl: string): Promise<string> {
  const result = await runFal<{ video?: { url?: string } }>(TRIM_VIDEO, {
    video_url: videoUrl,
    start_time: 0,
    end_time: CHAIN_CLIP_SECONDS,
  })
  const url = result.video?.url ?? extractVideoUrl(result)
  if (!url) throw new Error('Chain clip trim returned no video')
  return url
}
