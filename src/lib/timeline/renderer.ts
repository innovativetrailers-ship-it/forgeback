import ffmpeg from 'fluent-ffmpeg'
import { createWriteStream, mkdirSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import https from 'https'
import http from 'http'
import { pipeline } from 'stream/promises'
import type { TimelineRecipe, Clip, ColourGradeSettings } from './schema'
import { controlExportFilters, planarOverlayPlacement } from './controlLayer'
import { peakBlurFilter, speedRampFilter } from './timeRemap'
import { expandForExport } from './nleDepth'
import { deepGradeFragment } from '@cinema/core'

export type ExportFormat = 'mp4_1080p' | 'mp4_4k' | 'prores_422' | 'prores_4444' | 'dcp'

const FORMAT_SETTINGS: Record<
  ExportFormat,
  { codec: string; width: number; height: number; pixFmt: string; profile?: string; crf?: number; bitrate?: string }
> = {
  mp4_1080p: { codec: 'libx264', width: 1920, height: 1080, pixFmt: 'yuv420p', crf: 18 },
  mp4_4k: { codec: 'libx264', width: 3840, height: 2160, pixFmt: 'yuv420p', crf: 16 },
  prores_422: { codec: 'prores_ks', width: 1920, height: 1080, pixFmt: 'yuv422p10le', profile: '3' },
  prores_4444: { codec: 'prores_ks', width: 1920, height: 1080, pixFmt: 'yuva444p10le', profile: '4' },
  dcp: { codec: 'libopenjpeg', width: 2048, height: 1080, pixFmt: 'rgb48be', bitrate: '250M' },
}

const TRANSITION_MAP: Record<string, string> = {
  dissolve: 'dissolve',
  fade: 'fadeblack',
  'fade-in': 'fadeblack',
  'fade-out': 'fadeblack',
  flash: 'fadewhite',
  wipe: 'slideleft',
  slide: 'slideleft',
  push: 'slideright',
  zoom: 'zoomin',
  whip: 'hblur',
  spin: 'radial',
  glitch: 'pixelize',
  blur: 'hblur',
  film_burn: 'hblur',
  light_leak: 'fadewhite',
}

function filmLook(name: string | undefined): string {
  if (name === 'bw_contrast') return 'hue=s=0,eq=contrast=1.25'
  if (name === 'fuji_3510') return 'eq=saturation=0.9:contrast=1.05,hue=h=-8'
  if (name === 'kodak_2383') return 'eq=saturation=1.05:contrast=1.12,colorbalance=rs=0.06:bs=-0.04'
  if (name === 'kodak_5219') return 'eq=saturation=1.15:contrast=1.08,colorbalance=rs=0.04:bs=-0.02'
  return ''
}

function isHardCut(type: string | undefined): boolean {
  return !type || type === 'cut' || type === 'match' || type === 'generative-bridge'
}

function centerReframe(aspect: Clip['reframe'], width: number, height: number): string | null {
  if (!aspect) return null
  const [aw, ah] = aspect.split(':').map(Number)
  if (!aw || !ah) return null
  const target = aw / ah
  const current = width / height
  if (Math.abs(target - current) < 0.02) return null
  if (target < current) {
    const cropW = Math.max(2, Math.round(height * target))
    const x = Math.max(0, Math.round((width - cropW) / 2))
    return `crop=${cropW}:${height}:${x}:0`
  }
  const cropH = Math.max(2, Math.round(width / target))
  const y = Math.max(0, Math.round((height - cropH) / 2))
  return `crop=${width}:${cropH}:0:${y}`
}

async function resolveExportSource(sourceUrl: string): Promise<string> {
  if (!sourceUrl.startsWith('/api/media/')) return sourceUrl
  const id = sourceUrl.slice('/api/media/'.length).split('?')[0]
  const { db } = await import('@/lib/db')
  const { resolveOwnedMedia, signedUrlForStoredKey } = await import('@/lib/media/resolveStoredMedia')
  const asset = await db.asset.findUnique({ where: { id }, select: { ownerId: true } })
  const clip = asset ? null : await db.studioClip.findUnique({
    where: { id },
    select: { scene: { select: { project: { select: { userId: true } } } } },
  })
  const job = asset || clip ? null : await db.renderJob.findUnique({ where: { id }, select: { userId: true } })
  const userId = asset?.ownerId ?? clip?.scene.project.userId ?? job?.userId
  if (!userId) throw new Error(`Export cannot resolve media ${id}`)
  const resolved = await resolveOwnedMedia(id, userId)
  if (resolved.remoteUrl) return resolved.remoteUrl
  if (resolved.reason !== 'ok' || !resolved.key) throw new Error(`Export media ${id} has no stored file`)
  const signed = await signedUrlForStoredKey(resolved.key)
  if (!signed) throw new Error(`Export media ${id} is missing from storage`)
  return signed
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const protocol = url.startsWith('https') ? https : http
  await new Promise<void>((resolve, reject) => {
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`))
        return
      }
      const writer = createWriteStream(destPath)
      pipeline(res, writer).then(resolve).catch((err) => {
        console.warn("[caught] src/lib/timeline/renderer.ts:41", err instanceof Error ? { name: err.name, message: err.message } : err)
        reject(err)
      })
    }).on('error', (err: Error) => reject(err))
  })
}

function buildColourGradeFilter(grade: ColourGradeSettings): string {
  const filters: string[] = []

  // ASC CDL — Lift/Gamma/Gain per channel
  const { lift, gamma, gain, saturation } = grade.asc_cdl
  const rExpr = `(r * ${gain[0]} + ${lift[0]}) ^ (1 / ${gamma[0]})`
  const gExpr = `(g * ${gain[1]} + ${lift[1]}) ^ (1 / ${gamma[1]})`
  const bExpr = `(b * ${gain[2]} + ${lift[2]}) ^ (1 / ${gamma[2]})`
  filters.push(`curves=r='0/0 0.5/${rExpr.replace(/[^0-9.+*/^()]/g, '')} 1/1':g='0/0 0.5/0.5 1/1':b='0/0 0.5/0.5 1/1'`)

  // Saturation
  if (saturation !== 1) {
    filters.push(`hue=s=${saturation}`)
  }

  // Temperature (colour temperature shift via hue rotation of a/b channels)
  if (grade.temperature && Math.abs(grade.temperature - 6500) > 100) {
    const tempShift = (grade.temperature - 6500) / 10000
    filters.push(`colorbalance=rs=${tempShift}:gs=0:bs=${-tempShift}:rm=${tempShift * 0.5}:gm=0:bm=${-tempShift * 0.5}:rh=0:gh=0:bh=0`)
  }

  // Tint
  if (grade.tint && Math.abs(grade.tint) > 2) {
    const tintVal = grade.tint / 100
    filters.push(`colorbalance=rs=0:gs=${tintVal}:bs=0:rm=0:gm=${tintVal * 0.5}:bm=0:rh=0:gh=0:bh=0`)
  }

  // Shadows/Midtones/Highlights
  if (grade.shadows !== 0 || grade.midtones !== 0 || grade.highlights !== 0) {
    const s = grade.shadows / 100
    const m = grade.midtones / 100
    const h = grade.highlights / 100
    filters.push(`curves=all='0/${0.5 + s * 0.5} 0.5/${0.5 + m * 0.3} 1/${1 + h * 0.3}'`)
  }

  return filters.join(',')
}

function buildEffectFilters(effects: NonNullable<Clip['effects']>): string {
  return effects
    .map((effect) => {
      const i = effect.intensity
      switch (effect.type) {
        case 'film_grain':
          return `noise=alls=${Math.round(i * 40)}:allf=t+u`
        case 'vignette':
          return `vignette=PI/${2 - i}`
        case 'chromatic_aberration':
          return `rgbashift=rh=${Math.round(i * 5)}:bh=${-Math.round(i * 5)}`
        case 'bloom':
          return `gblur=sigma=${i * 3}[glow];[glow]blend=all_mode=screen:all_opacity=${i * 0.5}`
        case 'motion_blur':
          return `tmix=frames=${Math.round(i * 5 + 2)}:weights=1`
        case 'halation':
          return `gblur=sigma=${i * 8}[h];[h]blend=all_mode=screen:all_opacity=${i * 0.35}`
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join(',')
}

export interface RenderProgress {
  stage: 'downloading' | 'encoding' | 'finalising'
  percent: number
}

export async function renderTimeline(
  recipe: TimelineRecipe,
  outputPath: string,
  format: ExportFormat = 'mp4_1080p',
  onProgress?: (p: RenderProgress) => void
): Promise<string> {
  const settings = FORMAT_SETTINGS[format]
  const tempDir = path.join(tmpdir(), `cinema_render_${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })

  const downloadedFiles: string[] = []

  try {
    // ── 1. Gather all clips from video tracks ──────────────────────────────
    const prepared = expandForExport(recipe)
    const videoTracks = prepared.tracks.filter((t) => t.type === 'video' && !t.muted)
    const audioTracks = prepared.tracks.filter((t) => t.type === 'audio' && !t.muted)

    const allVideoClips = videoTracks.flatMap((t) => t.clips).sort((a, b) => a.startTime - b.startTime)
    const allAudioClips = audioTracks.flatMap((t) => t.clips).sort((a, b) => a.startTime - b.startTime)

    if (allVideoClips.length === 0) throw new Error('No video clips to render')

    // ── 2. Download all source files ───────────────────────────────────────
    onProgress?.({ stage: 'downloading', percent: 0 })
    const clipPaths: Map<string, string> = new Map()
    let downloaded = 0

    const allUrls = [...new Set([
      ...allVideoClips.map((c) => c.sourceUrl),
      ...allAudioClips.map((c) => c.sourceUrl),
    ])]
    const fetchable = new Map<string, string>()
    for (const sourceUrl of allUrls) {
      fetchable.set(sourceUrl, await resolveExportSource(sourceUrl))
    }

    await Promise.all(
      allUrls.map(async (url) => {
        const source = fetchable.get(url) ?? url
        const ext = url.split('.').pop()?.split('?')[0] ?? 'mp4'
        const dest = path.join(tempDir, `src_${downloaded++}_${Date.now()}.${ext}`)
        await downloadFile(source, dest)
        clipPaths.set(url, dest)
        downloadedFiles.push(dest)
        onProgress?.({ stage: 'downloading', percent: Math.round((downloaded / allUrls.length) * 40) })
      })
    )

    const lutPaths = new Map<string, string>()
    let lutIndex = 0
    for (const clip of allVideoClips) {
      const lutUrl = clip.colourGrade?.lutUrl?.trim()
      if (!lutUrl || !lutUrl.startsWith('http') || lutPaths.has(lutUrl)) continue
      const lutPath = path.join(tempDir, `clip_lut_${lutIndex++}.cube`)
      await downloadFile(lutUrl, lutPath)
      downloadedFiles.push(lutPath)
      lutPaths.set(lutUrl, lutPath)
    }

    const insertPaths = new Map<string, string>()
    let insertIndex = 0
    for (const clip of allVideoClips) {
      const imageUrl = clip.control?.planarInsert?.imageUrl?.trim()
      if (!imageUrl || insertPaths.has(imageUrl)) continue
      const source = await resolveExportSource(imageUrl)
      const ext = imageUrl.split('.').pop()?.split('?')[0] ?? 'png'
      const dest = path.join(tempDir, `insert_${insertIndex++}.${ext}`)
      await downloadFile(source, dest)
      downloadedFiles.push(dest)
      insertPaths.set(imageUrl, dest)
    }

    // ── 3. Build FFmpeg filter graph ──────────────────────────────────────
    onProgress?.({ stage: 'encoding', percent: 40 })

    const cmd = ffmpeg()

    // Add input files
    for (const clip of allVideoClips) {
      const localPath = clipPaths.get(clip.sourceUrl)!
      cmd.input(localPath)
    }
    for (const clip of allAudioClips) {
      const localPath = clipPaths.get(clip.sourceUrl)!
      cmd.input(localPath)
    }

    // Build complex filter graph
    const filterParts: string[] = []
    const videoInputCount = allVideoClips.length

    // Process each video clip: trim, scale, apply per-clip effects
    allVideoClips.forEach((clip, i) => {
      const clipDuration = clip.endTime - clip.startTime
      const filters: string[] = [`[${i}:v]`]

      // Trim to clip duration
      filters.push(`trim=duration=${clipDuration}`)

      // Scale to output resolution
      filters.push(`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease`)
      filters.push(`pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:black`)
      filters.push(`setpts=PTS-STARTPTS`)
      const framed = centerReframe(clip.reframe, settings.width, settings.height)
      if (framed) filters.push(framed, `scale=${settings.width}:${settings.height}`)
      const ramp = speedRampFilter(clip, clipDuration)
      if (ramp) filters.push(ramp)
      const blur = peakBlurFilter(clip)
      if (blur) filters.push(blur)

      filters.push(...controlExportFilters(clip.control, clipDuration, settings.width, settings.height))

      const placement = planarOverlayPlacement(clip.control, clipDuration, settings.width, settings.height)
      const insertPath = placement ? insertPaths.get(placement.imageUrl) : undefined

      // Apply effects
      if (clip.effects && clip.effects.length > 0) {
        const effectFilter = buildEffectFilters(clip.effects)
        if (effectFilter) filters.push(effectFilter)
      }

      if (clip.colourGrade?.lutUrl?.startsWith('http')) {
        const lutPath = lutPaths.get(clip.colourGrade.lutUrl.trim())
        if (lutPath) filters.push(`lut3d=${lutPath.replace(/\\/g, '/').replace(/:/g, '\\:')}`)
      }
      const look = filmLook(clip.colourGrade?.filmEmulation)
      if (look) filters.push(look)
      const deep = deepGradeFragment(clip.colourGrade?.deep).replace(/^,/, '')
      if (deep) filters.push(deep)

      // Apply colour grade
      if (clip.colourGrade) {
        const gradeFilter = buildColourGradeFilter({
          asc_cdl: clip.colourGrade.asc_cdl ?? {
            lift: [0, 0, 0],
            gamma: [1, 1, 1],
            gain: [1, 1, 1],
            saturation: 1,
          },
          shadows: clip.colourGrade.shadows ?? 0,
          midtones: clip.colourGrade.midtones ?? 0,
          highlights: clip.colourGrade.highlights ?? 0,
          temperature: clip.colourGrade.temperature ?? 6500,
          tint: clip.colourGrade.tint ?? 0,
        })
        if (gradeFilter) filters.push(gradeFilter)
      }

      // Apply global colour grade
      if (recipe.colourGradeSettings) {
        const gradeFilter = buildColourGradeFilter(recipe.colourGradeSettings)
        if (gradeFilter) filters.push(gradeFilter)
      }

      if (placement && insertPath) {
        const escaped = insertPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
        filterParts.push(`${filters.join(',')}[vpre${i}]`)
        filterParts.push(`movie='${escaped}',scale=${placement.w}:${placement.h}[pins${i}]`)
        filterParts.push(`[vpre${i}][pins${i}]overlay=x='${placement.x}':y='${placement.y}':format=auto[v${i}]`)
      } else {
        filterParts.push(`${filters.join(',')}[v${i}]`)
      }
    })

    // Concatenate clips with transitions
    if (allVideoClips.length === 1) {
      filterParts.push(`[v0]copy[vout]`)
    } else {
      let currentLabel = 'v0'

      for (let i = 1; i < allVideoClips.length; i++) {
        const clip = allVideoClips[i]
        const outLabel = i === allVideoClips.length - 1 ? 'vout' : `vconcat${i}`

        if (clip.transition && !isHardCut(clip.transition.type)) {
          const xfadeType = TRANSITION_MAP[clip.transition.type] ?? 'dissolve'
          const offset = allVideoClips[i - 1].endTime - clip.transition.duration

          filterParts.push(
            `[${currentLabel}][v${i}]xfade=transition=${xfadeType}:duration=${clip.transition.duration}:offset=${offset}[${outLabel}]`
          )
        } else {
          filterParts.push(`[${currentLabel}][v${i}]concat=n=2:v=1:a=0[${outLabel}]`)
        }
        currentLabel = outLabel
      }
    }

    // Mix audio clips
    if (allAudioClips.length > 0) {
      const audioDelayParts: string[] = []
      allAudioClips.forEach((clip, i) => {
        const inputIndex = videoInputCount + i
        const delayMs = Math.round(clip.startTime * 1000)
        const raw = clip.audioSettings?.volume
        const gain = raw == null ? 1 : raw > 2 ? raw / 100 : raw
        const eq = clip.audioSettings?.eq
        const tone = [
          eq?.low ? `bass=g=${eq.low}` : '',
          eq?.mid ? `equalizer=f=1000:width_type=q:width=1:g=${eq.mid}` : '',
          eq?.high ? `treble=g=${eq.high}` : '',
        ].filter(Boolean).join(',')
        audioDelayParts.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs}${tone ? ',' + tone : ''},volume=${gain}[a${i}]`)
      })
      filterParts.push(...audioDelayParts)

      if (allAudioClips.length === 1) {
        filterParts.push(`[a0]loudnorm=I=-14:TP=-1.5:LRA=11[anorm]`)
      } else {
        const audioInputs = allAudioClips.map((_, i) => `[a${i}]`).join('')
        filterParts.push(
          `${audioInputs}amix=inputs=${allAudioClips.length}:duration=longest:normalize=0[amixed]`,
        )
        filterParts.push('[amixed]loudnorm=I=-14:TP=-1.5:LRA=11[anorm]')
      }
    }

    // Apply global effects (silent film grain, master saturation, etc.)
    if (recipe.globalEffects && recipe.globalEffects.length > 0) {
      const globalFilters = recipe.globalEffects
        .map((e) => {
          if (e.type === 'film_grain')
            return `noise=alls=${Math.round(e.intensity * 40)}:allf=t+u`
          return ''
        })
        .filter(Boolean)
        .join(',')
      if (globalFilters) {
        filterParts.push(`[vout]${globalFilters}[vfinal]`)
        // Rename vout to vfinal
      }
    }

    const finalVideoLabel = recipe.globalEffects?.length ? 'vfinal' : 'vout'
    const hasAudio = allAudioClips.length > 0

    // Apply pixel format and fps
    filterParts.push(
      `[${finalVideoLabel}]fps=${recipe.fps},format=${settings.pixFmt}[vrender]`
    )

    // ── 4. Assemble and run FFmpeg ──────────────────────────────────────
    cmd.complexFilter(filterParts.join(';'))
    cmd.outputOption('-map', '[vrender]')
    if (hasAudio) cmd.outputOption('-map', '[anorm]')

    // Codec settings
    cmd.videoCodec(settings.codec)
    if (settings.crf !== undefined) cmd.outputOption('-crf', String(settings.crf))
    if (settings.bitrate) cmd.outputOption('-b:v', settings.bitrate)
    if (settings.profile) cmd.outputOption('-profile:v', settings.profile)
    if (hasAudio) cmd.audioCodec('aac').audioBitrate('256k')
    else {
      cmd.outputOption('-map', '0:a?')
      cmd.audioCodec('aac').audioBitrate('256k')
      cmd.audioFilter('loudnorm=I=-14:TP=-1.5:LRA=11')
    }

    // C2PA metadata injection
    cmd.outputOption('-metadata', `generated_by=CINEMA`)
    cmd.outputOption('-metadata', `generation_timestamp=${new Date().toISOString()}`)
    cmd.outputOption('-metadata', `project_id=${recipe.projectId}`)

    // Duration
    cmd.duration(recipe.durationSeconds)

    cmd.output(outputPath)

    await new Promise<void>((resolve, reject) => {
      cmd
        .on('progress', (progress: { percent?: number }) => {
          const pct = 40 + Math.round((progress.percent ?? 0) * 0.55)
          onProgress?.({ stage: 'encoding', percent: pct })
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run()
    })

    onProgress?.({ stage: 'finalising', percent: 95 })

    // ── 5. Apply LUT if specified ─────────────────────────────────────────
    if (recipe.colourGradeSettings?.lut?.url) {
      const lutPath = path.join(tempDir, 'grade.cube')
      await downloadFile(recipe.colourGradeSettings.lut.url, lutPath)
      downloadedFiles.push(lutPath)

      const lutOutput = outputPath.replace(/(\.[^.]+)$/, '_graded$1')
      await new Promise<void>((resolve, reject) => {
        ffmpeg(outputPath)
          .videoFilter(`lut3d=${lutPath}`)
          .outputOption('-c:v', settings.codec)
          .outputOption('-c:a', 'copy')
          .output(lutOutput)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run()
      })

      // Replace original with graded version
      unlinkSync(outputPath)
      const { renameSync } = await import('fs')
      renameSync(lutOutput, outputPath)
    }

    onProgress?.({ stage: 'finalising', percent: 100 })
    return outputPath
  } finally {
    // Clean up temp downloads
    for (const f of downloadedFiles) {
      try { if (existsSync(f)) unlinkSync(f) } catch (err) {
        console.warn("[caught] src/lib/timeline/renderer.ts:357", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
    }
  }
}

export async function generateProxy(
  clip: { sourceUrl: string; duration: number },
  onProgress?: (pct: number) => void
): Promise<string> {
  const tempDir = path.join(tmpdir(), `cinema_proxy_${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })

  const inputPath = path.join(tempDir, 'source.mp4')
  const outputPath = path.join(tempDir, 'proxy.mp4')

  await downloadFile(clip.sourceUrl, inputPath)

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .size('640x360')
      .outputOption('-crf', '28')
      .outputOption('-preset', 'ultrafast')
      .outputOption('-movflags', 'faststart')
      .duration(clip.duration)
      .output(outputPath)
      .on('progress', (p: { percent?: number }) => onProgress?.(p.percent ?? 0))
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run()
  })

  const { readFileSync } = await import('fs')
  const buffer = readFileSync(outputPath)

  const { uploadToR2 } = await import('../storage/r2')
  const { nanoid } = await import('nanoid')
  const key = `proxies/${nanoid()}.mp4`

  const url = await uploadToR2(buffer, key, 'video/mp4')

  try { unlinkSync(inputPath) } catch (err) {
    console.warn("[caught] src/lib/timeline/renderer.ts:398", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }
  try { unlinkSync(outputPath) } catch (err) {
    console.warn("[caught] src/lib/timeline/renderer.ts:399", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ }

  return url
}
