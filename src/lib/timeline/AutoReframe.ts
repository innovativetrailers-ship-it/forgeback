import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.timeline.AutoReframe')
import { uploadToR2 } from '../storage/r2'
import { execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9' | '4:3' | '21:9'

interface CropParams {
  x: number
  y: number
  width: number
  height: number
}

function aspectRatioToDecimal(ar: AspectRatio): number {
  const [w, h] = ar.split(':').map(Number)
  return w / h
}

export async function reframeClip(params: {
  clipUrl: string
  targetAspectRatio: AspectRatio
  subjectTracking: boolean
}): Promise<{ reframedUrl: string }> {
  const { clipUrl, targetAspectRatio, subjectTracking } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/reframe-${jobId}`
  const framesDir = join(tmpDir, 'frames')
  mkdirSync(framesDir, { recursive: true })

  try {
    // Get source video dimensions
    const probeOut = execSync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${clipUrl}"`
    ).toString().trim()
    const [srcW, srcH] = probeOut.split(',').map(Number)

    const targetRatio = aspectRatioToDecimal(targetAspectRatio)
    const targetW = targetRatio >= 1 ? srcW : Math.round(srcH * targetRatio)
    const targetH = targetRatio >= 1 ? Math.round(srcW / targetRatio) : srcH

    let cropFilter: string

    if (subjectTracking) {
      // Extract 1fps thumbnails for subject detection
      execSync(`ffmpeg -i "${clipUrl}" -vf fps=1 "${framesDir}/thumb%04d.jpg" -y 2>/dev/null`)

      const thumbFiles = execSync(`ls "${framesDir}"`)
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean)

      const cropCoords: CropParams[] = []

      // Detect subjects in each thumbnail
      for (const thumb of thumbFiles) {
        const thumbData = execSync(`base64 "${join(framesDir, thumb)}"`).toString().trim()
        try {
          const detection = await falSubscribe(falEndpoint('detr'), {
            input: { image_url: `data:image/jpeg;base64,${thumbData}` },
          }) as unknown as {
            objects: Array<{ box: { xmin: number; ymin: number; xmax: number; ymax: number } }>
          }

          if (detection.objects?.length > 0) {
            const box = detection.objects[0].box
            const subjectCX = (box.xmin + box.xmax) / 2
            const subjectCY = (box.ymin + box.ymax) / 2

            const x = Math.max(0, Math.min(srcW - targetW, Math.round(subjectCX - targetW / 2)))
            const y = Math.max(0, Math.min(srcH - targetH, Math.round(subjectCY - targetH / 2)))
            cropCoords.push({ x, y, width: targetW, height: targetH })
          } else {
            const x = Math.round((srcW - targetW) / 2)
            const y = Math.round((srcH - targetH) / 2)
            cropCoords.push({ x, y, width: targetW, height: targetH })
          }
        } catch (err) {
          console.warn("[caught] src/lib/timeline/AutoReframe.ts:82", err instanceof Error ? { name: err.name, message: err.message } : err)

          const x = Math.round((srcW - targetW) / 2)
          const y = Math.round((srcH - targetH) / 2)
          cropCoords.push({ x, y, width: targetW, height: targetH })
        }
      }

      // Smooth the crop trajectory (simple moving average)
      const smoothed = cropCoords.map((c, i) => {
        const window = cropCoords.slice(Math.max(0, i - 2), i + 3)
        return {
          x: Math.round(window.reduce((s, w) => s + w.x, 0) / window.length),
          y: Math.round(window.reduce((s, w) => s + w.y, 0) / window.length),
          width: targetW,
          height: targetH,
        }
      })

      // Write crop expr file for FFmpeg
      const dur = parseFloat(
        execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${clipUrl}"`).toString().trim()
      )
      const segDur = dur / smoothed.length

      // Build crop expression using FFmpeg eval_mode=each
      const xExpr = smoothed
        .map((c, i) => `if(between(t,${(i * segDur).toFixed(3)},${((i + 1) * segDur).toFixed(3)}),${c.x})`)
        .join('+')
      cropFilter = `crop=${targetW}:${targetH}:'${xExpr}':${smoothed[0]?.y ?? 0}`
    } else {
      const x = Math.round((srcW - targetW) / 2)
      const y = Math.round((srcH - targetH) / 2)
      cropFilter = `crop=${targetW}:${targetH}:${x}:${y}`
    }

    const outputPath = join(tmpDir, 'reframed.mp4')
    execSync(
      `ffmpeg -i "${clipUrl}" -vf "${cropFilter},scale=${targetW}:${targetH}" -c:v libx264 -crf 18 -c:a copy "${outputPath}" -y 2>/dev/null`
    )

    const buffer = execSync(`cat "${outputPath}"`)
    const reframedUrl = await uploadToR2(buffer, `reframed/${jobId}.mp4`, 'video/mp4')
    return { reframedUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
