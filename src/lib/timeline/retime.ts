import { runArgv } from '../shell/argv'
import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.timeline.retime')
import { uploadToR2 } from '../storage/r2'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

export async function opticalFlowRetime(params: {
  videoUrl: string
  targetFps: number
  section?: { start: number; end: number }
  quality: 'draft' | 'full'
}): Promise<{ retimedUrl: string }> {
  const { videoUrl, targetFps, section, quality } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/retime-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    let inputUrl = videoUrl

    // Trim section if specified
    if (section) {
      const duration = section.end - section.start
      const trimPath = join(tmpDir, 'trimmed.mp4')
      runArgv("ffmpeg", ["-i", videoUrl, "-ss", section.start, "-t", duration, "-c", "copy", trimPath, "-y"])
      inputUrl = trimPath
    }

    let retimedUrl: string

    if (quality === 'full') {
      // Use fal.ai FILM frame interpolation for high quality
      const result = await falSubscribe(falEndpoint('film-video-frame-interpolation'), {
        input: { video_url: inputUrl, target_fps: targetFps },
      }) as unknown as { video: { url: string } }
      retimedUrl = result.video.url
    } else {
      // Draft: use FFmpeg minterpolate filter
      const outputPath = join(tmpDir, 'retimed.mp4')
      runArgv("ffmpeg", ["-i", inputUrl, "-vf", `minterpolate=fps=${targetFps}:mi_mode=mci`, "-c:v", "libx264", "-crf", "20", "-c:a", "copy", outputPath, "-y"])
      const buffer = readFileSync(outputPath)
      retimedUrl = await uploadToR2(buffer, `retimed/${jobId}.mp4`, 'video/mp4')
    }

    return { retimedUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

export async function morphCut(params: {
  clipAUrl: string
  clipBUrl: string
  overlapFrames: number
}): Promise<{ morphedUrl: string }> {
  const { clipAUrl, clipBUrl, overlapFrames } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/morphcut-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    // Extract tail of clip A and head of clip B
    const tailPath = join(tmpDir, 'tail.mp4')
    const headPath = join(tmpDir, 'head.mp4')
    const fps = 24
    const tailDuration = overlapFrames / fps

    runArgv("ffmpeg", ["-sseof", "-${tailDuration}", "-i", clipAUrl, "-c", "copy", tailPath, "-y"])
    runArgv("ffmpeg", ["-i", clipBUrl, "-t", tailDuration, "-c", "copy", headPath, "-y"])

    // Use FILM interpolation across the overlap
    const morphResult = await falSubscribe(falEndpoint('film-video-frame-interpolation'), {
      input: {
        video_url: tailPath,
        reference_video_url: headPath,
        target_fps: fps,
        blend_mode: 'morph',
      },
    }) as unknown as { video: { url: string } }

    // Reassemble: clip A (without tail) + morphed + clip B (without head)
    const trimAPath = join(tmpDir, 'clipA_trimmed.mp4')
    const trimBPath = join(tmpDir, 'clipB_trimmed.mp4')

    // Get clip A duration
    const clipADur = parseFloat(
      runArgv("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", clipAUrl]).toString().trim()
    )
    const clipBDur = parseFloat(
      runArgv("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", clipBUrl]).toString().trim()
    )

    runArgv("ffmpeg", ["-i", clipAUrl, "-t", clipADur - tailDuration, "-c", "copy", trimAPath, "-y"])
    runArgv("ffmpeg", ["-i", clipBUrl, "-ss", tailDuration, "-t", clipBDur - tailDuration, "-c", "copy", trimBPath, "-y"])

    // Download morphed clip
    const morphBuffer = Buffer.from(await (await fetch(morphResult.video.url)).arrayBuffer())
    const morphPath = join(tmpDir, 'morph.mp4')
    require('fs').writeFileSync(morphPath, morphBuffer)

    // Concat all three
    const concatList = join(tmpDir, 'concat.txt')
    require('fs').writeFileSync(concatList, `file '${trimAPath}'\nfile '${morphPath}'\nfile '${trimBPath}'\n`)
    const outputPath = join(tmpDir, 'morphed.mp4')
    runArgv("ffmpeg", ["-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", outputPath, "-y"])

    const buffer = readFileSync(outputPath)
    const morphedUrl = await uploadToR2(buffer, `morphcut/${jobId}.mp4`, 'video/mp4')
    return { morphedUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
