import { runArgv } from '../shell/argv'
import { uploadToR2 } from '../storage/r2'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

export async function stabiliseVideo(params: {
  videoUrl: string
  strength: 'smooth' | 'locked' | 'cinematic'
  cropRatio?: number
}): Promise<{ stabilisedUrl: string }> {
  const { videoUrl, strength, cropRatio = 0.1 } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/stabilise-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    const transforms = join(tmpDir, 'transforms.trf')
    const stabilised = join(tmpDir, 'stabilised.mp4')

    // Step 1: Detect motion vectors
    const smoothingValue = {
      smooth: 10,
      locked: 100,
      cinematic: 5,
    }[strength]

    const optzoom = strength === 'cinematic' ? '0' : '1'
    const crop = Math.round(cropRatio * 100)

    runArgv("ffmpeg", ["-i", videoUrl, "-vf", `vidstabdetect=stepsize=6:shakiness=8:accuracy=9:result=${transforms}`, "-f", "null", "-"])

    // Step 2: Apply stabilisation
    runArgv("ffmpeg", ["-i", videoUrl, "-vf", `vidstabtransform=input=${transforms}:zoom=${crop}:smoothing=${smoothingValue}:optzoom=${optzoom},unsharp=5:5:0.8:3:3:0.4`, "-c:v", "libx264", "-crf", "18", "-c:a", "copy", stabilised, "-y"])

    const buffer = readFileSync(stabilised)
    const stabilisedUrl = await uploadToR2(buffer, `stabilised/${jobId}.mp4`, 'video/mp4')
    return { stabilisedUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
