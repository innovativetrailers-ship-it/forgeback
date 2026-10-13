import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.upscale.clip')
import { uploadToR2 } from '../storage/r2'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
import { runArgv } from '../shell/argv'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { routeUpscaleEngine } from './router'
import type { UpscaleJob, Resolution } from './router'
import { enhanceFacesInVideo } from './face-enhance'
import { matchAndRestoreGrain } from './grain'

export async function upscaleClip(params: {
  videoUrl: string
  job: UpscaleJob
  onProgress?: (pct: number) => void
}): Promise<{ upscaledUrl: string; resolutionOut: Resolution }> {
  const { videoUrl, job, onProgress } = params
  const engine = routeUpscaleEngine(job)
  const jobId = nanoid()
  const tmpDir = `/tmp/upscale-${jobId}`
  const framesDir = join(tmpDir, 'frames')
  const upscaledDir = join(tmpDir, 'upscaled')
  mkdirSync(framesDir, { recursive: true })
  mkdirSync(upscaledDir, { recursive: true })

  try {
    onProgress?.(5)

    // 1. Extract frames as PNG sequence
    const tileFilter = job.tileSize ? `,tile=${job.tileSize}x${job.tileSize}` : ''
    void tileFilter
    runArgv('ffmpeg', ['-i', videoUrl, join(framesDir, 'frame%06d.png'), '-y'])

    const frameFiles = readdirSync(framesDir).filter(Boolean)

    onProgress?.(15)

    // 2. Upscale frames in batches of 20
    const batchSize = 20
    for (let i = 0; i < frameFiles.length; i += batchSize) {
      const batch = frameFiles.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (f, idx) => {
          const frameNum = i + idx
          const framePath = join(framesDir, f)
          const frameData = readFileSync(framePath).toString('base64')
          const dataUrl = `data:image/png;base64,${frameData}`

          let upscaledFrameUrl: string

          if (engine === 'real_esrgan') {
            const res = await falSubscribe(falEndpoint('real-esrgan'), {
              input: { image_url: dataUrl, scale: job.targetFactor } as never,
            }) as unknown as { image: { url: string } }
            upscaledFrameUrl = res.image.url
          } else if (engine === 'clarity_upscaler') {
            const res = await falSubscribe(falEndpoint('clarity-upscaler'), {
              input: { image_url: dataUrl, scale: job.targetFactor } as never,
            }) as unknown as { image: { url: string } }
            upscaledFrameUrl = res.image.url
          } else if (engine === 'esrgan_plus') {
            const res = await falSubscribe(falEndpoint('esrgan'), {
              input: { image_url: dataUrl },
            }) as unknown as { image: { url: string } }
            upscaledFrameUrl = res.image.url
          } else {
            // Default: aura_sr
            const res = await falSubscribe(falEndpoint('aura-sr'), {
              input: { image_url: dataUrl, upscale_factor: job.targetFactor } as never,
            }) as unknown as { image: { url: string } }
            upscaledFrameUrl = res.image.url
          }

          // Download upscaled frame
          const imgResp = await fetch(upscaledFrameUrl)
          const imgBuf = Buffer.from(await imgResp.arrayBuffer())
          const outPath = join(upscaledDir, `frame${String(frameNum).padStart(6, '0')}.png`)
          require('fs').writeFileSync(outPath, imgBuf)
        })
      )

      const pct = 15 + Math.round((i / frameFiles.length) * 60)
      onProgress?.(pct)
    }

    onProgress?.(75)

    // 3. Reassemble frames → video, preserving audio
    const reassembledPath = join(tmpDir, 'reassembled.mp4')
    runArgv('ffmpeg', ['-framerate', '24', '-i', join(upscaledDir, 'frame%06d.png'), '-i', videoUrl, '-map', '0:v', '-map', '1:a?', '-c:v', 'libx264', '-crf', '18', '-c:a', 'copy', reassembledPath, '-y'])

    let finalPath = reassembledPath

    // 4. Face enhancement pass
    if (job.faceEnhance) {
      onProgress?.(80)
      const { enhancedUrl } = await enhanceFacesInVideo({
        videoUrl: reassembledPath,
        fidelity: 0.7,
        detectionThreshold: 0.6,
      })
      finalPath = enhancedUrl
    }

    // 5. Film grain restoration
    if (job.preserveFilmGrain) {
      onProgress?.(90)
      const { grainedUrl } = await matchAndRestoreGrain({
        originalVideoUrl: videoUrl,
        upscaledVideoUrl: finalPath,
      })
      finalPath = grainedUrl
    }

    onProgress?.(95)

    // 6. Upload final result
    let buffer: Buffer
    if (finalPath.startsWith('http')) {
      const resp = await fetch(finalPath)
      buffer = Buffer.from(await resp.arrayBuffer())
    } else {
      buffer = readFileSync(finalPath)
    }

    const upscaledUrl = await uploadToR2(buffer, `upscaled/${jobId}.mp4`, 'video/mp4')

    // Detect output resolution
    let resolutionOut: Resolution = { width: 0, height: 0 }
    try {
      const probeOut = runArgv('ffprobe', ['-v', 'quiet', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', reassembledPath]).toString().trim()
      const [w, h] = probeOut.split(',').map(Number)
      resolutionOut = { width: w, height: h }
    } catch (err) {
      console.warn("[caught] src/lib/upscale/clip.ts:143", err instanceof Error ? { name: err.name, message: err.message } : err)

      // ignore probe failure
    }

    onProgress?.(100)
    return { upscaledUrl, resolutionOut }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
