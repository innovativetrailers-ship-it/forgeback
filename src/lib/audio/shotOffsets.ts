import { probeDurationSec } from '@/lib/media/ffmpegExec'
import { downloadToTmp } from '@/lib/media/download'

export interface PlacedSegment {
  shotId: string
  shotIndex: number
  videoUrl: string
  placedDurationSec?: number
}

export async function measureSegmentDurationSec(videoUrl: string): Promise<number> {
  const local = await downloadToTmp(videoUrl, 'mp4')
  return probeDurationSec(local)
}

export async function computeShotOffsets(
  segments: PlacedSegment[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  let t = 0
  const ordered = [...segments].sort((a, b) => a.shotIndex - b.shotIndex)

  for (const seg of ordered) {
    map.set(seg.shotId, t)
    const dur = seg.placedDurationSec ?? await measureSegmentDurationSec(seg.videoUrl)
    t += dur
  }
  return map
}
