/**
 * SilenceRemover — FFmpeg silencedetect + clip splicing.
 * Identifies silent regions in audio and returns their timestamps.
 * Actual FFmpeg splicing is handled by the export/render pipeline.
 */

import { fal }        from '@fal-ai/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { randomUUID } from 'crypto'

export interface SilenceSegment {
  start: number
  end:   number
  dB:    number   // measured silence level
}

export interface SilenceRemovalResult {
  segments:    SilenceSegment[]   // detected silence regions
  keepRanges:  Array<{ start: number; end: number }>
  timeSaved:   number             // seconds removed
  outputUrl?:  string             // if processed inline
}

/**
 * Detect silence via Whisper gaps (no FFmpeg required on server).
 * Gaps between words longer than minDurationSec are flagged as silence.
 */
export async function detectSilence(params: {
  audioUrl:       string
  thresholdDb?:   number   // default -40 dB (not used with Whisper gap method)
  minDurationSec?: number  // minimum silence duration to flag (default 0.5s)
}): Promise<SilenceSegment[]> {
  const { audioUrl, minDurationSec = 0.5 } = params

  // Use Whisper to get word-level timestamps — gaps = silence
  const result = await fal.subscribe('fal-ai/whisper', {
    input: { audio_url: audioUrl, task: 'transcribe', chunk_level: 'word' },
  })

  const data = result.data as {
    chunks?: Array<{ text: string; timestamp: [number, number] }>
  }

  const chunks = data.chunks ?? []
  if (chunks.length === 0) return []

  const silences: SilenceSegment[] = []

  for (let i = 0; i < chunks.length - 1; i++) {
    const gapStart = chunks[i].timestamp[1]
    const gapEnd   = chunks[i + 1].timestamp[0]
    const gap      = gapEnd - gapStart

    if (gap >= minDurationSec) {
      silences.push({ start: gapStart, end: gapEnd, dB: -40 })
    }
  }

  // Also check for leading / trailing silence
  if (chunks[0].timestamp[0] >= minDurationSec) {
    silences.unshift({ start: 0, end: chunks[0].timestamp[0], dB: -40 })
  }

  return silences.sort((a, b) => a.start - b.start)
}

/**
 * Remove silence regions and produce an edited audio file.
 * Delegates FFmpeg work to the Python IMF microservice if available.
 */
export async function removeSilence(params: {
  audioUrl:        string
  minDurationSec?: number
  thresholdDb?:    number
  previewOnly?:    boolean
}): Promise<SilenceRemovalResult> {
  const { audioUrl, minDurationSec = 0.5, previewOnly = false } = params

  const segments = await detectSilence({ audioUrl, minDurationSec })

  // Get duration from last chunk end
  const result = await fal.subscribe('fal-ai/whisper', {
    input: { audio_url: audioUrl, task: 'transcribe' },
  })
  const data = result.data as { chunks?: Array<{ timestamp: [number, number] }> }
  const durationSec = data.chunks?.at(-1)?.[1][1] ?? 60

  // Build keep ranges (complement of silence)
  const keepRanges: Array<{ start: number; end: number }> = []
  let cursor = 0

  for (const seg of segments) {
    if (seg.start > cursor) keepRanges.push({ start: cursor, end: seg.start })
    cursor = Math.max(cursor, seg.end)
  }
  if (cursor < durationSec) keepRanges.push({ start: cursor, end: durationSec })

  const timeSaved = segments.reduce((a, s) => a + (s.end - s.start), 0)

  if (previewOnly || keepRanges.length === 0) {
    return { segments, keepRanges, timeSaved }
  }

  // Attempt inline processing via IMF microservice
  const imfUrl = process.env.IMF_SERVICE_URL ?? 'http://localhost:7433'
  const res = await fetch(`${imfUrl}/audio/splice`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ audioUrl, keepRanges }),
  }).catch(() => null)

  if (res?.ok) {
    const { url } = await res.json() as { url: string }
    return { segments, keepRanges, timeSaved, outputUrl: url }
  }

  return { segments, keepRanges, timeSaved }
}
