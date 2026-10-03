import { falEndpoint } from '@cinema/core/endpoints'
import { logCaught } from '@/lib/diagnostics/caught'
import { runFal } from '../fal/client'
import { extractVideoFrame } from '../fal/frameExtract'
import { relightImage } from '../fal/lighting'
import { runModel1 } from '../brain/model1'
import ffmpeg from 'fluent-ffmpeg'
import { uploadToR2 } from '../storage/r2'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import path from 'path'
import os from 'os'

export type BackdropSource =
  | 'ai_generated'
  | 'location_vault'
  | 'user_uploaded'
  | 'hdri_environment'
  | 'solid_colour'

export interface BackdropConfig {
  source: BackdropSource
  prompt?: string
  generationModel?: string
  locationId?: string
  uploadedUrl?: string
  hdriUrl?: string
  color?: string
  timeOfDay?: string
  weather?: string
  lightingMatchToForeground?: boolean
  addShadowsToBackdrop?: boolean
  depthBlur?: boolean
  depthBlurAmount?: number
}

export interface GreenScreenJob {
  sourceVideoUrl: string
  extractionMode: 'chroma_key' | 'ai_matting' | 'depth_matting'
  chromaColour?: 'green' | 'blue' | 'custom'
  customChromaHex?: string
  spillSuppression?: boolean
  edgeRefinement?: number
  subjectType?: 'person' | 'object' | 'animal' | 'multiple_people'
  backdrop: BackdropConfig
  lightingHarmonise?: boolean
  outputFormat?: 'mp4' | 'webm_alpha'
}

interface LightingInfo {
  direction: string
  temperature_kelvin: number
  intensity: string
  shadows: string
}

export class GreenScreenEngine {

  async processGreenScreen(job: GreenScreenJob): Promise<string> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cinema-gs-'))

    try {
      const foregroundData = await this.extractForeground(job, tmp)
      const backdropUrl = await this.resolveBackdrop(job.backdrop, foregroundData.lightingInfo)

      let harmonisedForeground = foregroundData.alphaVideoUrl
      if (job.lightingHarmonise) {
        harmonisedForeground = await this.harmoniseLighting(
          foregroundData.alphaVideoUrl, backdropUrl, foregroundData.lightingInfo
        )
      }

      const compositedPath = await this.composite(
        harmonisedForeground,
        backdropUrl,
        foregroundData.depthMapUrl,
        job.backdrop.depthBlur ?? false,
        job.backdrop.depthBlurAmount ?? 0.3,
        job.backdrop.addShadowsToBackdrop ?? true,
        tmp
      )

      const buffer = await fs.readFile(compositedPath)
      const key = `greenscreen/${Date.now()}.mp4`
      return uploadToR2(buffer, key, 'video/mp4')

    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  }

  private async extractForeground(
    job: GreenScreenJob,
    tmpDir: string
  ): Promise<{
    alphaVideoUrl: string
    depthMapUrl?: string
    lightingInfo: LightingInfo
  }> {
    if (job.extractionMode === 'chroma_key') {
      const outputPath = path.join(tmpDir, 'foreground_alpha.webm')
      const sourceLocal = path.join(tmpDir, 'source.mp4')
      await this.downloadFile(job.sourceVideoUrl, sourceLocal)

      const keyColour = job.chromaColour === 'green' ? '0x00ff00'
        : job.chromaColour === 'blue' ? '0x0000ff'
        : job.customChromaHex ?? '0x00ff00'

      await new Promise<void>((res, rej) => {
        ffmpeg(sourceLocal)
          .videoFilter([
            `chromakey=${keyColour}:similarity=0.3:blend=0.05`,
            job.spillSuppression ? 'despill=type=green' : null,
            job.edgeRefinement ? `morpho=mode=open:width=${Math.round(job.edgeRefinement! * 5)}` : null,
          ].filter(Boolean) as string[])
          .outputOptions(['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0'])
          .output(outputPath)
          .on('end', () => res())
          .on('error', rej)
          .run()
      })

      const buf = await fs.readFile(outputPath)
      const alphaUrl = await uploadToR2(buf, `alpha/${Date.now()}.webm`, 'video/webm')
      const lighting = await this.extractLightingInfo(job.sourceVideoUrl)
      return { alphaVideoUrl: alphaUrl, lightingInfo: lighting }

    } else if (job.extractionMode === 'ai_matting') {
      const result = await runFal(falEndpoint('birefnet-general'), {
          image_url: job.sourceVideoUrl,
          model: 'General Use (Heavy)',
          operating_resolution: '1024x1024',
          output_format: 'webp',
          refine_foreground: true,
        }) as unknown as { image: { url: string } }

      const depth = await runFal(falEndpoint('imageutils/depth'), { image_url: job.sourceVideoUrl }) as unknown as { image_url: string }

      const lighting = await this.extractLightingInfo(job.sourceVideoUrl)
      return { alphaVideoUrl: result.image.url, depthMapUrl: depth.image_url, lightingInfo: lighting }

    } else {
      const depth = await runFal(falEndpoint('imageutils/depth'), { image_url: job.sourceVideoUrl }) as unknown as { image_url: string }

      const rembgResult = await runFal(falEndpoint('imageutils/rembg'), { image_url: job.sourceVideoUrl }) as unknown as { image: { url: string } }

      const lighting = await this.extractLightingInfo(job.sourceVideoUrl)
      return { alphaVideoUrl: rembgResult.image.url, depthMapUrl: depth.image_url, lightingInfo: lighting }
    }
  }

  private async resolveBackdrop(
    config: BackdropConfig,
    lightingInfo: LightingInfo
  ): Promise<string> {
    switch (config.source) {
      case 'ai_generated': {
        const bgPrompt = `${config.prompt}. ${config.timeOfDay ?? 'natural daylight'}, ${config.weather ?? 'clear weather'}. No people in frame. Photorealistic environment, wide shot, background plate for compositing.`
        const { WAN_T2V } = await import('@/lib/fal/wanEndpoints')
        const result = await runFal(WAN_T2V, {
          prompt: bgPrompt,
          duration: 5,
        }) as unknown as { video?: { url: string }; video_url?: string }
        return result.video?.url ?? result.video_url ?? ''
      }

      case 'user_uploaded':
        return config.uploadedUrl!

      case 'location_vault': {
        const { db } = await import('../db')
        const location = await db.vaultLocation.findUnique({ where: { id: config.locationId! } })
        return location?.referenceUrls?.[0] ?? ''
      }

      case 'hdri_environment': {
        const result = await relightImage({
          imageUrl: config.hdriUrl!,
          prompt: `Panoramic environment background, ${config.timeOfDay ?? 'natural light'}`,
        })
        return result.imageUrl
      }

      case 'solid_colour':
        return `solid:${config.color ?? '#1a1a2e'}`

      default:
        return config.uploadedUrl ?? ''
    }
  }

  private async harmoniseLighting(
    foregroundUrl: string,
    backdropUrl: string,
    lightingInfo: LightingInfo
  ): Promise<string> {
    const backdropLighting = await runModel1({
      systemPrompt: 'Analyse the lighting in this image. Return: {"direction": "left|right|above|below|front|back", "temperature": "warm|neutral|cool", "intensity": "soft|medium|hard", "ambient": "description"}',
      userMessage: 'Analyse the lighting direction and quality in this backdrop image.',
      images: [backdropUrl],
      requireJSON: true,
    })
    const bdLighting = JSON.parse(backdropLighting.content)

    const relitResult = await relightImage({
      imageUrl: foregroundUrl,
      prompt: `Relight to match: ${bdLighting.direction} ${bdLighting.temperature} lighting, ${bdLighting.intensity} quality, ${bdLighting.ambient}`,
    })

    return relitResult.imageUrl
  }

  private async composite(
    foregroundAlphaUrl: string,
    backdropUrl: string,
    depthMapUrl?: string,
    depthBlur?: boolean,
    depthBlurAmount?: number,
    addShadows?: boolean,
    tmpDir?: string
  ): Promise<string> {
    if (backdropUrl.startsWith('solid:')) {
      // Generate a solid colour plate via FFmpeg
      const hex = backdropUrl.replace('solid:', '')
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      backdropUrl = `color=c=rgb(${r}\\,${g}\\,${b}):s=1920x1080:d=5`
    }

    const fgPath = path.join(tmpDir!, 'fg_alpha.webm')
    const bgPath = path.join(tmpDir!, 'backdrop.mp4')
    const outPath = path.join(tmpDir!, 'composited.mp4')

    await Promise.all([
      this.downloadFile(foregroundAlphaUrl, fgPath),
      this.downloadFile(backdropUrl, bgPath).catch((err) => logCaught('lib/greenscreen/GreenScreenEngine', err)),
    ])

    await new Promise<void>((res, rej) => {
      const cmd = ffmpeg()
        .input(bgPath)
        .input(fgPath)

      const filters: string[] = []
      if (depthBlur && depthMapUrl) {
        filters.push(`[0:v]boxblur=${Math.round((depthBlurAmount ?? 0.3) * 10)}[bgblurred]`)
        filters.push(`[bgblurred][1:v]overlay=0:0[out]`)
      } else {
        filters.push(`[0:v][1:v]overlay=0:0[out]`)
      }

      cmd
        .complexFilter(filters)
        .outputOptions(['-map', '[out]', '-map', '1:a?', '-c:v', 'libx264', '-crf', '16', '-c:a', 'aac'])
        .output(outPath)
        .on('end', () => res())
        .on('error', rej)
        .run()
    })

    return outPath
  }

  private async extractLightingInfo(videoUrl: string): Promise<LightingInfo> {
    const frameUrl = await extractVideoFrame(videoUrl, { timestamp: 0.5 })
    const analysis = await runModel1({
      systemPrompt: 'Analyse lighting. Return JSON: {"direction": "string", "temperature_kelvin": number, "intensity": "soft|medium|hard", "shadows": "direction"}',
      userMessage: 'Analyse the lighting in this frame.',
      images: [frameUrl],
      requireJSON: true,
    })
    return JSON.parse(analysis.content)
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    if (url.startsWith('solid:')) return
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Failed to download ${url}: ${resp.status}`)
    if (!resp.body) throw new Error(`Empty response body for ${url}`)
    await pipeline(resp.body as unknown as NodeJS.ReadableStream, createWriteStream(dest))
  }
}
