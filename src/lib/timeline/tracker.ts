import { runArgv } from '../shell/argv'
import { uploadToR2 } from '../storage/r2'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

interface Point {
  x: number
  y: number
}

export interface TrackFrame {
  frame: number
  corners: [Point, Point, Point, Point]
  confidence: number
}

export type TrackData = TrackFrame[]

export async function trackPlanarRegion(params: {
  videoUrl: string
  regionOfInterest: { x: number; y: number; width: number; height: number }
  trackingMethod: 'translation' | 'affine' | 'perspective'
}): Promise<{ trackData: TrackData; held: true }> {
  void params.videoUrl
  void params.trackingMethod
  const { x, y, width, height } = params.regionOfInterest
  console.warn('[planar] point tracker is not on the gateway (OpenAPI 404). Holding the selected region. Nothing submitted.')
  const corners: [Point, Point, Point, Point] = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]
  return {
    held: true,
    trackData: [
      { frame: 0, corners, confidence: 1 },
      { frame: 30 * 60, corners, confidence: 1 },
    ],
  }
}

export async function replaceTrackedSurface(params: {
  videoUrl: string
  trackData: TrackData
  replacementImageUrl: string
  blendMode: string
}): Promise<{ compositedUrl: string }> {
  const { videoUrl, trackData, replacementImageUrl, blendMode } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/surface-replace-${jobId}`
  const framesDir = join(tmpDir, 'frames')
  const outputDir = join(tmpDir, 'composited')
  mkdirSync(framesDir, { recursive: true })
  mkdirSync(outputDir, { recursive: true })

  try {
    // Extract frames
    runArgv("ffmpeg", ["-i", videoUrl, `${framesDir}/frame%06d.png`, "-y"])

    // Download replacement image
    const replBuf = Buffer.from(await (await fetch(replacementImageUrl)).arrayBuffer())
    const replPath = join(tmpDir, 'replacement.png')
    require('fs').writeFileSync(replPath, replBuf)

    // Apply perspective transform per frame using FFmpeg
    for (const track of trackData) {
      const frameFile = `frame${String(track.frame + 1).padStart(6, '0')}.png`
      const framePath = join(framesDir, frameFile)
      const outFramePath = join(outputDir, frameFile)

      if (!existsSync(framePath)) continue

      const [tl, tr, br, bl] = track.corners
      // Compute perspective transform coefficients
      const srcPoints = `0:0:100:0:100:100:0:100`
      const dstPoints = `${tl.x}:${tl.y}:${tr.x}:${tr.y}:${br.x}:${br.y}:${bl.x}:${bl.y}`

      runArgv('ffmpeg', ['-i', framePath, '-i', replPath, '-filter_complex', `[1:v]perspective=x0=${tl.x}:y0=${tl.y}:x1=${tr.x}:y1=${tr.y}:x2=${bl.x}:y2=${bl.y}:x3=${br.x}:y3=${br.y}[warped];[0:v][warped]overlay=x=0:y=0`, outFramePath, '-y'])

      void srcPoints
      void dstPoints
      void blendMode
    }

    // Copy any frames not in trackData
    for (const name of readdirSync(framesDir)) {
      if (name.endsWith('.png') && !existsSync(join(outputDir, name))) copyFileSync(join(framesDir, name), join(outputDir, name))
    }

    // Reassemble video
    const outputPath = join(tmpDir, 'composited.mp4')
    runArgv("ffmpeg", ["-framerate", "24", "-i", `${outputDir}/frame%06d.png`, "-i", videoUrl, "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "18", "-c:a", "copy", outputPath, "-y"])

    const buffer = readFileSync(outputPath)
    const compositedUrl = await uploadToR2(buffer, `surface-replace/${jobId}.mp4`, 'video/mp4')
    return { compositedUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
