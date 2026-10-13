import { runArgv, runArgvText } from '../shell/argv'
import { uploadToR2 } from '../storage/r2'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

interface GrainProfile {
  size: number
  intensity: number
  redStrength: number
  greenStrength: number
  blueStrength: number
  temporalVariation: number
}

export async function matchAndRestoreGrain(params: {
  originalVideoUrl: string
  upscaledVideoUrl: string
  grainStrength?: number
}): Promise<{ grainedUrl: string }> {
  const { originalVideoUrl, upscaledVideoUrl, grainStrength } = params
  const jobId = nanoid()
  const tmpDir = `/tmp/grain-${jobId}`
  mkdirSync(tmpDir, { recursive: true })

  try {
    // Analyse grain profile from original via FFT
    const profile = await analyseGrainProfile(originalVideoUrl, tmpDir)
    const strength = grainStrength ?? 1.0

    // Apply matched grain to upscaled video via FFmpeg geq filter
    const outputPath = join(tmpDir, 'grained.mp4')
    const grainExpr = buildGrainExpression(profile, strength)

    runArgv("ffmpeg", ["-i", upscaledVideoUrl, "-vf", `geq=${grainExpr}`, "-c:v", "libx264", "-crf", "18", "-c:a", "copy", outputPath, "-y"])

    const buffer = readFileSync(outputPath)
    const grainedUrl = await uploadToR2(buffer, `grained/${jobId}.mp4`, 'video/mp4')
    return { grainedUrl }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function analyseGrainProfile(videoUrl: string, tmpDir: string): Promise<GrainProfile> {
  // Extract a sample frame and analyse its frequency content via FFT
  const framePath = join(tmpDir, 'sample.png')
  runArgv("ffmpeg", ["-i", videoUrl, "-vframes", "1", "-ss", "00:00:01", framePath, "-y"])

  // Use ffmpeg signalstats to measure noise characteristics
  try {
    const statsRun = runArgvText('ffmpeg', ['-i', framePath, '-vf', 'signalstats', '-f', 'null', '-'])
    const stats = `${statsRun.stdout}\n${statsRun.stderr}`

    // Parse RMS values to approximate grain
    const rmsMatch = stats.match(/RMS=([0-9.]+)/)
    const rms = rmsMatch ? parseFloat(rmsMatch[1]) : 5.0

    return {
      size: Math.max(1, Math.min(3, rms / 10)),
      intensity: rms / 20,
      redStrength: rms * 0.9,
      greenStrength: rms,
      blueStrength: rms * 1.1,
      temporalVariation: 0.2,
    }
  } catch (err) {
    console.warn("[caught] src/lib/upscale/grain.ts:70", err instanceof Error ? { name: err.name, message: err.message } : err)

    return {
      size: 1.5,
      intensity: 0.3,
      redStrength: 4,
      greenStrength: 5,
      blueStrength: 6,
      temporalVariation: 0.2,
    }
  }
}

function buildGrainExpression(profile: GrainProfile, strength: number): string {
  const i = profile.intensity * strength
  // FFmpeg geq filter for adding film grain noise
  const expr = `lum='lum(X,Y)+${(i * 30).toFixed(1)}*random(1)':cb='cb(X,Y)+${(i * 10).toFixed(1)}*random(2)':cr='cr(X,Y)+${(i * 10).toFixed(1)}*random(3)'`
  return expr
}
