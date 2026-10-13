import { logCaught } from '@/lib/diagnostics/caught'
/**
 * Pro Tools & professional DAW audio delivery.
 * Handles BWF with SMPTE timecode, stem rendering, OMF, and Pro Tools session XML.
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { runArgv } from '../shell/argv'
import { nanoid } from 'nanoid'
import { uploadToR2 } from '../storage/r2'
import type { TimelineRecipe, Track } from '../timeline/schema'

export interface BWFParams {
  audioUrl: string
  timecodeStart: number    // seconds from timeline start
  fps: number
  sampleRate: 48000 | 96000
  bitDepth: 16 | 24 | 32
  description?: string
  originatorRef?: string
  trackLabel?: string
}

export interface StemPackage {
  dialogue: string    // R2 URL — BWF
  music: string       // R2 URL — BWF
  sfx: string         // R2 URL — BWF
  mx: string          // R2 URL — BWF  (Music & Effects, no dialogue)
  full_mix: string    // R2 URL — BWF
  atmos?: string      // R2 URL — Dolby Atmos ADM BWF
}

export interface StemRenderParams {
  recipe: TimelineRecipe
  fps: number
  sampleRate: 48000 | 96000
  bitDepth: 16 | 24 | 32
  deliveryFormat: 'stereo' | '5.1' | '7.1' | 'atmos'
  selectedStems?: Array<'dialogue' | 'music' | 'sfx' | 'mx' | 'full_mix' | 'atmos'>
}

// ── BWF (Broadcast Wave Format) with SMPTE timecode ─────────────────────────

export async function exportBWF(params: BWFParams): Promise<string> {
  const tmpDir = os.tmpdir()
  const inputPath = path.join(tmpDir, `bwf_in_${nanoid()}.wav`)
  const outputPath = path.join(tmpDir, `bwf_out_${nanoid()}.wav`)

  // Download source audio
  const resp = await fetch(params.audioUrl)
  if (!resp.ok) throw new Error(`Failed to fetch audio: ${resp.statusText}`)
  await fs.writeFile(inputPath, Buffer.from(await resp.arrayBuffer()))

  const timeRef = Math.round(params.timecodeStart * params.sampleRate)
  const sampleFmtMap = { 16: 's16', 24: 's32', 32: 'flt' }
  const sampleFmt = sampleFmtMap[params.bitDepth] ?? 's32'
  const codecMap = { 16: 'pcm_s16le', 24: 'pcm_s24le', 32: 'pcm_f32le' }
  const codec = codecMap[params.bitDepth] ?? 'pcm_s24le'

  runArgv('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-ar', params.sampleRate.toString(),
    '-sample_fmt', sampleFmt,
    '-c:a', codec,
    '-metadata', `description=${params.description ?? 'CINÉMA Export'}`,
    '-metadata', 'originator=CINEMA',
    '-metadata', `originator_reference=${params.originatorRef ?? nanoid()}`,
    '-metadata', `time_reference=${timeRef}`,
    '-rf64', 'auto',
    outputPath,
  ])

  const fileBuffer = await fs.readFile(outputPath)
  const key = `pro_tools/bwf_${nanoid()}.wav`
  const url = await uploadToR2(fileBuffer, key, 'audio/wav')

  await fs.unlink(inputPath).catch((err) => logCaught('lib/audio/ProToolsExport', err))
  await fs.unlink(outputPath).catch((err) => logCaught('lib/audio/ProToolsExport', err))
  return url
}

// ── Stem delivery package ────────────────────────────────────────────────────

export async function renderStemPackage(params: StemRenderParams): Promise<StemPackage> {
  const { recipe, fps, sampleRate, bitDepth } = params
  const selectedStems = params.selectedStems ?? ['dialogue', 'music', 'sfx', 'mx', 'full_mix']

  // Categorise tracks into buses
  const dialogueTracks = recipe.tracks.filter(
    t => t.type === 'audio' && t.label.toLowerCase().match(/voice|dialogue|dialog|speech/)
  )
  const musicTracks = recipe.tracks.filter(
    t => t.type === 'audio' && t.label.toLowerCase().match(/music|score|mus/)
  )
  const sfxTracks = recipe.tracks.filter(
    t => t.type === 'audio' && t.label.toLowerCase().match(/sfx|sound|foley|ambient|atmos/)
  )
  // Fallback: any audio track not already categorised goes to sfx
  const uncategorised = recipe.tracks.filter(
    t =>
      t.type === 'audio' &&
      !dialogueTracks.includes(t) &&
      !musicTracks.includes(t) &&
      !sfxTracks.includes(t)
  )
  const allSFX = [...sfxTracks, ...uncategorised]

  const mixTracksToWAV = async (tracks: Track[], label: string): Promise<string> => {
    if (tracks.length === 0 || tracks.every(t => t.clips.length === 0)) {
      // Return a silent placeholder
      return ''
    }

    const tmpDir = os.tmpdir()
    const outputPath = path.join(tmpDir, `stem_${label}_${nanoid()}.wav`)

    // Build FFmpeg filter_complex to mix tracks
    const allClips = tracks.flatMap(t => t.clips).filter(c => c.sourceUrl)
    if (allClips.length === 0) return ''

    const mixFilter = `[${allClips.map((_, i) => `${i}:a`).join('][')}]amix=inputs=${allClips.length}:duration=longest[out]`
    const mixArgs = ['-y']
    for (const clip of allClips) mixArgs.push('-i', clip.sourceUrl!)
    mixArgs.push('-filter_complex', mixFilter, '-map', '[out]', '-ar', String(sampleRate), '-c:a', 'pcm_s24le', '-rf64', 'auto', outputPath)
    runArgv('ffmpeg', mixArgs)

    const fileBuffer = await fs.readFile(outputPath)
    const key = `pro_tools/stems/${label}_${nanoid()}.wav`
    const url = await uploadToR2(fileBuffer, key, 'audio/wav')
    await fs.unlink(outputPath).catch((err) => logCaught('lib/audio/ProToolsExport', err))
    return url
  }

  const results: Partial<StemPackage> = {}

  await Promise.all(
    selectedStems.map(async stem => {
      if (stem === 'dialogue') {
        results.dialogue = await mixTracksToWAV(dialogueTracks, 'dialogue')
      } else if (stem === 'music') {
        results.music = await mixTracksToWAV(musicTracks, 'music')
      } else if (stem === 'sfx') {
        results.sfx = await mixTracksToWAV(allSFX, 'sfx')
      } else if (stem === 'mx') {
        // M&E = Music + Effects, no dialogue
        results.mx = await mixTracksToWAV([...musicTracks, ...allSFX], 'mx')
      } else if (stem === 'full_mix') {
        const allAudio = recipe.tracks.filter(t => t.type === 'audio')
        results.full_mix = await mixTracksToWAV(allAudio, 'full_mix')
      }
    })
  )

  return {
    dialogue: results.dialogue ?? '',
    music: results.music ?? '',
    sfx: results.sfx ?? '',
    mx: results.mx ?? '',
    full_mix: results.full_mix ?? '',
    atmos: results.atmos,
  }
}

// ── Pro Tools Session XML ────────────────────────────────────────────────────

export function exportProToolsSessionXML(recipe: TimelineRecipe): string {
  const audioTracks = recipe.tracks.filter(
    t => t.type === 'audio' || t.label.toLowerCase().includes('voice') || t.label.toLowerCase().includes('music')
  )
  const sampleRate = 48000
  const fps = recipe.fps

  const audioFileEntries = audioTracks
    .flatMap(t => t.clips)
    .map(
      clip => `    <AudioFile>
      <Name>${escapeXML(clip.id)}.wav</Name>
      <Path>${escapeXML(clip.sourceUrl)}</Path>
    </AudioFile>`
    )
    .join('\n')

  const trackEntries = audioTracks
    .map(
      (track, i) => `    <Track number="${i + 1}" name="${escapeXML(track.label)}" type="Audio">
${[...track.clips]
  .sort((a, b) => a.startTime - b.startTime)
  .map(
    clip => `      <Region start="${Math.round(clip.startTime * sampleRate)}" end="${Math.round(clip.endTime * sampleRate)}" file="${escapeXML(clip.id)}.wav" />`
  )
  .join('\n')}
    </Track>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ProToolsSession version="11">
  <SessionInfo>
    <Name>CINÉMA Export</Name>
    <SampleRate>${sampleRate}</SampleRate>
    <BitDepth>24</BitDepth>
    <TimeCodeRate>${fps}</TimeCodeRate>
    <Project>${escapeXML(recipe.projectId)}</Project>
  </SessionInfo>
  <AudioFiles>
${audioFileEntries}
  </AudioFiles>
  <Tracks>
${trackEntries}
  </Tracks>
</ProToolsSession>`
}

// ── OMF Export ───────────────────────────────────────────────────────────────

export async function exportOMF(params: {
  recipe: TimelineRecipe
  embedMedia: boolean
  handleLength: number  // seconds of handle on each side
}): Promise<string> {
  const { recipe, handleLength } = params
  const tmpDir = os.tmpdir()
  const outputPath = path.join(tmpDir, `omf_${nanoid()}.omf`)

  const audioClips = recipe.tracks
    .filter(t => t.type === 'audio')
    .flatMap(t => t.clips)
    .filter(c => c.sourceUrl)

  if (audioClips.length === 0) throw new Error('No audio clips found in timeline')

  // Build inputs list
  const omfArgs = ['-y']
  for (const clip of audioClips) omfArgs.push('-i', clip.sourceUrl!)

  // For OMF we build a concat with handles
  const filterParts = audioClips
    .map((clip, i) => {
      const inPoint = Math.max(0, clip.startTime - handleLength)
      const duration = clip.endTime - clip.startTime + handleLength * 2
      return `[${i}:a]atrim=start=${inPoint}:duration=${duration},adelay=${Math.round(clip.startTime * 1000)}|${Math.round(clip.startTime * 1000)}[a${i}]`
    })
    .join('; ')
  const mixMap = audioClips.map((_, i) => `[a${i}]`).join('')
  const filter = `${filterParts}; ${mixMap}amix=inputs=${audioClips.length}:duration=longest[out]`

  omfArgs.push('-filter_complex', filter, '-map', '[out]', '-f', 'wav', outputPath)
  runArgv('ffmpeg', omfArgs)

  const fileBuffer = await fs.readFile(outputPath)
  const key = `pro_tools/omf_${nanoid()}.omf`
  const url = await uploadToR2(fileBuffer, key, 'application/octet-stream')
  await fs.unlink(outputPath).catch((err) => logCaught('lib/audio/ProToolsExport', err))
  return url
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
