import { falEndpoint } from '@cinema/core/endpoints'
import { runFal, extractImageUrl } from './client'

const FRAME_EXTRACT = falEndpoint('ffmpeg-api/extract-frame')

/** Extract a single frame from a video URL (timestamp in seconds, or frame_type). */
export async function extractVideoFrame(
  videoUrl: string,
  options: { timestamp?: number; frameType?: 'first' | 'middle' | 'last' } = {},
): Promise<string> {
  if (options.frameType === 'last') {
    const result = await runFal<{ image?: { url: string }; output_url?: string }>(falEndpoint('ffmpeg'), {
      video_url: videoUrl,
      command: 'extract_last_frame',
      output_format: 'jpg',
    })
    const url = extractImageUrl(result) ?? result.output_url
    if (!url) throw new Error('Last-frame extraction returned no URL')
    return url
  }

  const input: Record<string, unknown> = { video_url: videoUrl }
  if (options.timestamp !== undefined) input.timestamp = options.timestamp
  else input.frame_type = options.frameType ?? 'middle'

  const result = await runFal(FRAME_EXTRACT, input)
  const url = extractImageUrl(result)
  if (!url) throw new Error('Frame extraction returned no URL')
  return url
}

/** Sample frames across a clip (for moderation / analysis). */
export async function extractVideoFrameSamples(
  videoUrl: string,
  count: number,
): Promise<string[]> {
  const n = Math.min(Math.max(count, 1), 10)
  const timestamps = Array.from({ length: n }, (_, i) => (i + 1) / (n + 1))
  const urls: string[] = []
  for (const ts of timestamps) {
    try {
      urls.push(await extractVideoFrame(videoUrl, { timestamp: ts }))
    } catch (err) {
      console.warn("[caught] src/lib/fal/frameExtract.ts:42", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* skip failed samples */ }
  }
  return urls.length > 0 ? urls : [videoUrl]
}
