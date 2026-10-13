import { storeForUser } from '@/lib/storage/objects'
// Phase 6: concatenate discrete shots. Cuts are edits, not interpolated morphs.

import { falEndpoint } from '@cinema/core/endpoints'
import { runFal, extractVideoUrl } from '@/lib/fal/client'
import { stripGeneratedClipAudio } from '@/lib/fal/stripVideoAudio'
import type { GeneratedSegment } from './types'

export async function stitchSegments(
  segments: GeneratedSegment[],
  userId:   string
): Promise<string> {
  const ordered = segments
    .filter((segment) => Boolean(segment.videoUrl?.trim()))
    .sort((a, b) => a.shotIndex - b.shotIndex)
  if (ordered.length === 0) {
    throw new Error('No completed shots to assemble')
  }
  if (ordered.length === 1) return ordered[0].videoUrl
  const videoUrls = ordered.map(s => s.videoUrl)
  console.log('[assembly]', JSON.stringify({
    shots: ordered.length,
    boundaries: 'cut',
    note: 'discrete clips concatenated; dissolves and fades are editor transitions, not a morph',
  }))
  const concatList = videoUrls

  const silentClips: string[] = []
  for (const url of concatList) {
    silentClips.push(await stripGeneratedClipAudio(url))
  }

  const result = await runFal<{ video?: { url: string }; output_url?: string }>(falEndpoint('ffmpeg'), {
    command:       'concat',
    video_urls:    silentClips,
    output_format: 'mp4',
    resolution:    '1080p',
    fps:           24,
    include_audio: false,
  })

  const stitchedUrl = extractVideoUrl(result) ?? result.output_url
  if (!stitchedUrl) {
    console.error('[stitching] FFmpeg concat failed, returning first segment')
    return videoUrls[0]
  }

  const buf      = await fetch(stitchedUrl).then(r => r.arrayBuffer())
  const finalUrl = await storeForUser(userId, Buffer.from(buf), 'mp4', 'video/mp4')

  return finalUrl
}
