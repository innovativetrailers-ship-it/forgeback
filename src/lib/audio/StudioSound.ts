import { runArgv } from '../shell/argv'
import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.audio.StudioSound')
import { uploadToR2 } from '../storage/r2'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

type EnhancementMode = 'voice_isolation' | 'noise_reduction' | 'studio_quality' | 'all'

export async function enhanceDialogue(params: {
  audioUrl: string
  mode: EnhancementMode
  strength?: number
}): Promise<{ enhancedUrl: string }> {
  const { audioUrl, mode, strength = 0.8 } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/studio-sound-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    let processedUrl = audioUrl

    if (mode === 'noise_reduction' || mode === 'all') {
      // Use fal.ai audio enhancement
      try {
        const result = await falSubscribe(falEndpoint('audio-enhancement'), {
          input: { audio_url: processedUrl, noise_reduction_strength: strength },
        }) as unknown as { audio: { url: string } }
        processedUrl = result.audio.url
      } catch (err) {
        console.warn("[caught] src/lib/audio/StudioSound.ts:31", err instanceof Error ? { name: err.name, message: err.message } : err)

        // Fallback: FFmpeg noise gate + high-pass filter
        const outputPath = join(tmpDir, 'denoised.wav')
        runArgv("ffmpeg", ["-i", processedUrl, "-af", "highpass=f=80,lowpass=f=12000,anlmdn=s=7:p=0.002:r=0.002:m=15", outputPath, "-y"])
        const buffer = readFileSync(outputPath)
        processedUrl = await uploadToR2(buffer, `studio-sound/${jobId}_denoised.wav`, 'audio/wav')
      }
    }

    if (mode === 'voice_isolation' || mode === 'all') {
      // FFmpeg: high-pass + noise gate for voice isolation
      const outputPath = join(tmpDir, 'isolated.wav')
      runArgv("ffmpeg", ["-i", processedUrl, "-af", "highpass=f=200,agate=threshold=0.02:ratio=4:attack=10:release=200", outputPath, "-y"])
      const buffer = readFileSync(outputPath)
      processedUrl = await uploadToR2(buffer, `studio-sound/${jobId}_isolated.wav`, 'audio/wav')
    }

    if (mode === 'studio_quality' || mode === 'all') {
      // EQ boost at 2-5kHz (voice presence), de-reverb, compression
      const outputPath = join(tmpDir, 'studio.wav')
      runArgv("ffmpeg", ["-i", processedUrl, "-af", "equalizer=f=3000:width_type=o:width=2:g=3,acompressor=threshold=-20dB:ratio=3:attack=5:release=100,alimiter=limit=-1dB", outputPath, "-y"])
      const buffer = readFileSync(outputPath)
      processedUrl = await uploadToR2(buffer, `studio-sound/${jobId}_studio.wav`, 'audio/wav')
    }

    return { enhancedUrl: processedUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}
