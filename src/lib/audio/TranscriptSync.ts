/**
 * TranscriptSync — utilities for word-level transcript synchronisation with timeline clips.
 * Powers A09: transcript-based editing where deleting text removes the matching audio/video.
 */

import { fal } from '@fal-ai/client'

export interface TranscriptWord {
  word:       string
  start:      number   // seconds
  end:        number   // seconds
  confidence: number
  speaker?:   string
  clipId?:    string
}

export interface TranscriptSegment {
  text:      string
  start:     number
  end:       number
  speaker?:  string
  words:     TranscriptWord[]
}

export interface TranscriptResult {
  segments:   TranscriptSegment[]
  words:      TranscriptWord[]
  text:       string
  language:   string
  durationSec: number
}

export interface TranscriptEdit {
  type:      'remove_word' | 'remove_range' | 'reorder'
  wordIndex?: number
  startSec?:  number
  endSec?:    number
  clipId?:    string
}

/** Transcribe audio using Whisper via fal.ai — returns word-level timestamps */
export async function transcribeAudio(audioUrl: string): Promise<TranscriptResult> {
  const result = await fal.subscribe('fal-ai/whisper', {
    input: {
      audio_url:  audioUrl,
      task:       'transcribe',
      chunk_level: 'word',
      version:    '3',
    },
  })

  const data = result.data as {
    text?:     string
    chunks?:   Array<{
      text:       string
      timestamp:  [number, number]
      words?:     Array<{ word: string; start: number; end: number }>
    }>
    language?: string
  }

  const words: TranscriptWord[] = []
  const segments: TranscriptSegment[] = []

  for (const chunk of data.chunks ?? []) {
    const segWords: TranscriptWord[] = (chunk.words ?? []).map(w => ({
      word:       w.word.trim(),
      start:      w.start,
      end:        w.end,
      confidence: 1.0,
    }))

    // Fall back to chunk-level if no word timestamps
    if (segWords.length === 0) {
      segWords.push({
        word:       chunk.text.trim(),
        start:      chunk.timestamp[0],
        end:        chunk.timestamp[1],
        confidence: 1.0,
      })
    }

    words.push(...segWords)
    segments.push({
      text:  chunk.text.trim(),
      start: chunk.timestamp[0],
      end:   chunk.timestamp[1],
      words: segWords,
    })
  }

  const durationSec = words.at(-1)?.end ?? 0

  return {
    segments,
    words,
    text:        data.text ?? words.map(w => w.word).join(' '),
    language:    data.language ?? 'en',
    durationSec,
  }
}

/**
 * Convert a list of removal edits into FFmpeg atrim/concat filter arguments.
 * Returns the segments that SHOULD be kept (complement of removals).
 */
export function editsToKeepRanges(
  edits:       TranscriptEdit[],
  durationSec: number,
): Array<{ start: number; end: number }> {
  // Collect all removal ranges
  const removals = edits
    .filter(e => e.startSec != null && e.endSec != null)
    .map(e => ({ start: e.startSec!, end: e.endSec! }))
    .sort((a, b) => a.start - b.start)

  if (removals.length === 0) return [{ start: 0, end: durationSec }]

  const keep: Array<{ start: number; end: number }> = []
  let cursor = 0

  for (const removal of removals) {
    if (removal.start > cursor) keep.push({ start: cursor, end: removal.start })
    cursor = Math.max(cursor, removal.end)
  }

  if (cursor < durationSec) keep.push({ start: cursor, end: durationSec })

  return keep
}

/** Export transcript as SRT subtitle format */
export function toSRT(segments: TranscriptSegment[]): string {
  return segments.map((seg, i) => {
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = Math.floor(s % 60)
      const ms  = Math.round((s % 1) * 1000)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`
    }
    return `${i + 1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${seg.text}\n`
  }).join('\n')
}

/** Export transcript as WebVTT */
export function toVTT(segments: TranscriptSegment[]): string {
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    const ms  = Math.round((s % 1) * 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
  }
  return 'WEBVTT\n\n' + segments.map((seg, i) => (
    `${i + 1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${seg.text}\n`
  )).join('\n')
}
