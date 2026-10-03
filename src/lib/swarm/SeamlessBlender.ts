import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from '../fal/client'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { uploadToR2 } from '../storage/r2'
import type { SwarmResult, Shot, ModelId } from './types'
import { modelTierRank } from '../routing/modelTierRank'

// ── Per-model grain and colour profiles ──────────────────────
const MODEL_PROFILES: Record<ModelId, {
  grainLevel: number
  colourTemp: number
  contrastBias: number
  saturationBias: number
  compressionSharpness: number
}> = {
  seedance_2_0:   { grainLevel: 0.15, colourTemp: 200,   contrastBias:  0.05, saturationBias:  0.10, compressionSharpness: 0.85 },
  veo_3_1:        { grainLevel: 0.08, colourTemp: 0,     contrastBias:  0.00, saturationBias:  0.05, compressionSharpness: 0.92 },
  kling_3_0:      { grainLevel: 0.12, colourTemp: 100,   contrastBias:  0.08, saturationBias:  0.08, compressionSharpness: 0.88 },
  runway_gen4_5:  { grainLevel: 0.10, colourTemp: -50,   contrastBias:  0.03, saturationBias:  0.03, compressionSharpness: 0.90 },
  skyreels_v1:    { grainLevel: 0.18, colourTemp: 150,   contrastBias:  0.10, saturationBias:  0.12, compressionSharpness: 0.82 },
  wan_2_2:        { grainLevel: 0.25, colourTemp: -200,  contrastBias: -0.08, saturationBias: -0.05, compressionSharpness: 0.72 },
  ltx_2_3:        { grainLevel: 0.30, colourTemp: 0,     contrastBias:  0.00, saturationBias:  0.00, compressionSharpness: 0.65 },
  pika_2_2:       { grainLevel: 0.14, colourTemp: 300,   contrastBias:  0.12, saturationBias:  0.15, compressionSharpness: 0.80 },
  minimax_hailuo: { grainLevel: 0.16, colourTemp: -150,  contrastBias: -0.03, saturationBias:  0.02, compressionSharpness: 0.83 },
  mochi_1:        { grainLevel: 0.28, colourTemp: 0,     contrastBias:  0.00, saturationBias:  0.00, compressionSharpness: 0.70 },
  pixverse:       { grainLevel: 0.14, colourTemp: 80,    contrastBias:  0.06, saturationBias:  0.09, compressionSharpness: 0.84 },
  hunyuan_1_5:    { grainLevel: 0.20, colourTemp: 120,   contrastBias:  0.07, saturationBias:  0.11, compressionSharpness: 0.78 },
}

// ── CINÉMA house look target ─────────────────────────────────
const TARGET_LOOK = {
  grainLevel: 0.12,
  colourTemp: 50,
  contrastBias: 0.03,
  saturationBias: 0.04,
  compressionSharpness: 0.88,
}

export interface BlendJob {
  results: SwarmResult[]
  shots: Shot[]
  applyHouseLook: boolean
  outputPath?: string
}

export class SeamlessBlender {

  async blend(job: BlendJob): Promise<string> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cinema-blend-'))

    try {
      const normalised = await Promise.all(
        job.results.map(r => this.normaliseClip(r, job.shots, tmp))
      )

      await this.normaliseBoundaries(normalised, job.shots, tmp)
      const assembled = await this.assembleTimeline(normalised, job.shots, tmp)

      const fileBuffer = await fs.readFile(assembled)
      return await uploadToR2(fileBuffer, `renders/${Date.now()}_final.mp4`, 'video/mp4')
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  }

  private async normaliseClip(
    result: SwarmResult,
    shots: Shot[],
    tmpDir: string
  ): Promise<{ shot_id: string; localPath: string; model: ModelId }> {
    const srcModel = result.model_used
    const srcProfile = MODEL_PROFILES[srcModel]

    const grainDelta = TARGET_LOOK.grainLevel - srcProfile.grainLevel
    const tempDelta = TARGET_LOOK.colourTemp - srcProfile.colourTemp
    const contrastDelta = TARGET_LOOK.contrastBias - srcProfile.contrastBias
    const satDelta = TARGET_LOOK.saturationBias - srcProfile.saturationBias

    const inputPath = path.join(tmpDir, `${result.shot_id}_src.mp4`)
    const outputPath = path.join(tmpDir, `${result.shot_id}_norm.mp4`)

    await this.downloadFile(result.output_url, inputPath)

    const tempRgb = this.kelvinToRGB(tempDelta)
    const contrastVal = 1.0 + contrastDelta
    const satVal = 1.0 + satDelta

    await new Promise<void>((res, rej) => {
      ffmpeg(inputPath)
        .videoFilter([
          `curves=r='0/0 0.5/${(0.5 + tempRgb.r * 0.1).toFixed(3)} 1/1':g='0/0 0.5/0.5 1/1':b='0/0 0.5/${(0.5 - tempRgb.b * 0.05).toFixed(3)} 1/1'`,
          `eq=contrast=${contrastVal.toFixed(3)}:saturation=${satVal.toFixed(3)}:brightness=${(contrastDelta * 0.02).toFixed(4)}`,
          `unsharp=5:5:${((TARGET_LOOK.compressionSharpness - srcProfile.compressionSharpness) * 0.5).toFixed(3)}:5:5:0`,
          grainDelta > 0
            ? `noise=alls=${Math.round(grainDelta * 20)}:allf=t+u`
            : `hqdn3d=${Math.round(Math.abs(grainDelta) * 8)}:${Math.round(Math.abs(grainDelta) * 6)}:3:3`,
        ])
        .outputOptions(['-c:v', 'libx264', '-crf', '17', '-c:a', 'copy', '-preset', 'fast'])
        .output(outputPath)
        .on('end', () => res())
        .on('error', rej)
        .run()
    })

    return { shot_id: result.shot_id, localPath: outputPath, model: srcModel }
  }

  private async normaliseBoundaries(
    normalised: Array<{ shot_id: string; localPath: string; model: ModelId }>,
    shots: Shot[],
    tmpDir: string
  ): Promise<void> {
    for (let i = 0; i < normalised.length - 1; i++) {
      const modelA = normalised[i].model
      const modelB = normalised[i + 1].model
      if (modelA === modelB) continue

      const profA = MODEL_PROFILES[modelA]
      const profB = MODEL_PROFILES[modelB]
      const colourDistance = Math.abs(profA.colourTemp - profB.colourTemp)
      const grainDistance = Math.abs(profA.grainLevel - profB.grainLevel)

      if (colourDistance > 200 || grainDistance > 0.1) {
        try {
          const rankA = modelTierRank(modelA)
          const rankB = modelTierRank(modelB)
          const anchorIdx = rankA >= rankB ? i : i + 1
          const targetIdx = rankA >= rankB ? i + 1 : i

          const anchorFrame = await this.extractFrameFromLocal(
            normalised[anchorIdx].localPath,
            anchorIdx < targetIdx ? 'last' : 'first',
          )
          const targetFrame = await this.extractFrameFromLocal(
            normalised[targetIdx].localPath,
            targetIdx > anchorIdx ? 'first' : 'last',
          )

          const adjusted = await runFal(falEndpoint('iclight-v2'), {
              image_url: targetFrame,
              prompt: 'match lighting temperature and colour tone of reference',
            }) as unknown as { images?: Array<{ url?: string }> }

          await this.applyProgressiveBoundaryGrade(
            normalised[targetIdx].localPath,
            adjusted.images?.[0]?.url ?? targetFrame,
            8,
            tmpDir,
            normalised[targetIdx].shot_id
          )
        } catch (err) {
          console.warn("[caught] src/lib/swarm/SeamlessBlender.ts:153", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal — boundary normalisation degrades gracefully */ }
      }
    }
  }

  private async assembleTimeline(
    normalised: Array<{ shot_id: string; localPath: string; model: ModelId }>,
    shots: Shot[],
    tmpDir: string
  ): Promise<string> {
    const orderedShots = shots.slice().sort((a, b) => a.sequence_index - b.sequence_index)
    const outputPath = path.join(tmpDir, 'assembled.mp4')

    const clipPaths = orderedShots.map(shot =>
      normalised.find(n => n.shot_id === shot.shot_id)!.localPath
    )

    if (clipPaths.length === 1) {
      await fs.copyFile(clipPaths[0], outputPath)
      return outputPath
    }

    const cmd = ffmpeg()
    clipPaths.forEach(p => cmd.input(p))

    const filterParts: string[] = []
    const transitionDuration = 0.15

    let prevOutput = '[0:v]'
    let prevAudio = '[0:a]'

    for (let i = 1; i < clipPaths.length; i++) {
      const shot = orderedShots[i - 1]
      const transition = shot.stitch_config?.transition ?? 'cut'
      const xfadeType = transition === 'dissolve' ? 'dissolve'
        : transition === 'fade' ? 'fade'
        : transition === 'wipe' ? 'wipeleft'
        : 'fade'

      const offset = orderedShots.slice(0, i).reduce((sum, s) => sum + s.duration_seconds, 0) - transitionDuration * i
      const currentOutput = i < clipPaths.length - 1 ? `[v${i}]` : '[vout]'
      const currentAudio = i < clipPaths.length - 1 ? `[a${i}]` : '[aout]'

      if (transition !== 'cut') {
        filterParts.push(`${prevOutput}[${i}:v]xfade=transition=${xfadeType}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${currentOutput}`)
        filterParts.push(`${prevAudio}[${i}:a]acrossfade=d=${transitionDuration}${currentAudio}`)
      } else {
        filterParts.push(`${prevOutput}[${i}:v]concat=n=2:v=1:a=0${currentOutput}`)
        filterParts.push(`${prevAudio}[${i}:a]concat=n=2:v=0:a=1${currentAudio}`)
      }

      prevOutput = currentOutput
      prevAudio = currentAudio
    }

    await new Promise<void>((res, rej) => {
      cmd
        .complexFilter(filterParts)
        .outputOptions(['-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-crf', '16', '-c:a', 'aac', '-ar', '48000'])
        .output(outputPath)
        .on('end', () => res())
        .on('error', rej)
        .run()
    })

    return outputPath
  }

  private async applyProgressiveBoundaryGrade(
    clipPath: string,
    _referenceFrameUrl: string,
    blendFrames: number,
    tmpDir: string,
    shotId: string
  ): Promise<void> {
    const outputPath = path.join(tmpDir, `${shotId}_bounded.mp4`)
    await new Promise<void>((res, rej) => {
      ffmpeg(clipPath)
        .videoFilter([
          `curves=enable='between(t,0,${(blendFrames / 24).toFixed(3)})':r='0/0 1/1':g='0/0 1/1':b='0/0 1/1'`,
        ])
        .outputOptions(['-c:v', 'libx264', '-crf', '17', '-c:a', 'copy'])
        .output(outputPath)
        .on('end', () => res())
        .on('error', rej)
        .run()
    })
    await fs.copyFile(outputPath, clipPath)
  }

  private kelvinToRGB(kelvin: number): { r: number; g: number; b: number } {
    const k = kelvin / 100
    return {
      r: k > 0 ? Math.min(1, k / 30) : 0,
      g: 0,
      b: k < 0 ? Math.min(1, Math.abs(k) / 30) : 0,
    }
  }

  private async extractFrameFromLocal(clipPath: string, position: 'first' | 'last'): Promise<string> {
    const fileBuffer = await fs.readFile(clipPath)
    const tempUrl = await uploadToR2(fileBuffer, `temp/frame-extract-${Date.now()}.mp4`, 'video/mp4')
    const { extractVideoFrame } = await import('@/lib/fal/frameExtract')
    try {
      return await extractVideoFrame(tempUrl, {
        frameType: position === 'first' ? 'first' : 'last',
      })
    } catch (err) {
      console.warn("[caught] src/lib/swarm/SeamlessBlender.ts:260", err instanceof Error ? { name: err.name, message: err.message } : err)

      return tempUrl
    }
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const resp = await fetch(url)
    const buffer = Buffer.from(await resp.arrayBuffer())
    await fs.writeFile(dest, buffer)
  }
}
