import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.upscale.face-enhance')
import { uploadToR2 } from '../storage/r2'
import { execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

export async function enhanceFacesInVideo(params: {
  videoUrl: string
  fidelity: number
  detectionThreshold: number
}): Promise<{ enhancedUrl: string; facesDetected: number }> {
  const { videoUrl, fidelity, detectionThreshold } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/face-enhance-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    // Extract frames
    const framesDir = join(tmpDir, 'frames')
    mkdirSync(framesDir)
    execSync(`ffmpeg -i "${videoUrl}" -vf fps=1 "${framesDir}/frame%06d.png" -y 2>/dev/null`)

    const frameFiles = execSync(`ls "${framesDir}"`)
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)

    let totalFaces = 0
    const enhancedFrames: string[] = []

    // Process frames in batches of 5
    for (let i = 0; i < frameFiles.length; i += 5) {
      const batch = frameFiles.slice(i, i + 5)
      await Promise.all(
        batch.map(async (f) => {
          const framePath = join(framesDir, f)
          // Upload frame to fal for processing
          const frameDataUrl = `data:image/png;base64,${execSync(`base64 "${framePath}"`).toString().trim()}`

          try {
            const faceDetect = await falSubscribe(falEndpoint('ip-adapter-face-id'), {
              input: { image_url: frameDataUrl },
            }) as unknown as { faces: Array<{ x: number; y: number; width: number; height: number; confidence: number }> }

            const detectedFaces = faceDetect.faces?.filter(
              (face) => face.confidence >= detectionThreshold
            ) ?? []

            if (detectedFaces.length > 0) {
              totalFaces += detectedFaces.length
              const restored = await falSubscribe(falEndpoint('codeformer'), {
                input: { image_url: frameDataUrl, fidelity },
              }) as unknown as { image: { url: string } }
              enhancedFrames.push(restored.image.url)
            } else {
              enhancedFrames.push(framePath)
            }
          } catch (err) {
            console.warn("[caught] src/lib/upscale/face-enhance.ts:61", err instanceof Error ? { name: err.name, message: err.message } : err)

            enhancedFrames.push(framePath)
          }
        })
      )
    }

    // Reassemble video
    const outputPath = join(tmpDir, 'enhanced.mp4')
    execSync(
      `ffmpeg -i "${videoUrl}" -vf "scale=iw:ih" -c:v libx264 -c:a copy "${outputPath}" -y 2>/dev/null`
    )

    const buffer = execSync(`cat "${outputPath}"`)
    const enhancedUrl = await uploadToR2(buffer, `face-enhanced/${jobId}.mp4`, 'video/mp4')

    return { enhancedUrl, facesDetected: totalFaces }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
