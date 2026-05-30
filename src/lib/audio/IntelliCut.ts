/**
 * IntelliCut (F08) — AI-powered combined silence + filler word removal with preview.
 * Combines Whisper transcript analysis with FFmpeg audio splicing.
 * User reviews the removal list before committing.
 */

import { transcribeAudio }  from './TranscriptSync'
import { detectSilence }    from './SilenceRemover'

export interface IntelliCutItem {
  id:      string
  type:    'filler' | 'silence' | 'pause'
  text?:   string         // for filler words
  start:   number
  end:     number
  keep:    boolean        // user can toggle to preserve
}

export interface IntelliCutAnalysis {
  items:       IntelliCutItem[]
  timeSaved:   number     // total seconds if all non-kept items removed
  wordCount:   number
  fillerCount: number
  silenceCount: number
}

const DEFAULT_FILLERS = [
  'um', 'uh', 'like', 'you know', 'sort of', 'basically',
  'literally', 'right', 'okay', 'so', 'actually',
]

/**
 * Analyse audio and return a preview list of all removable items.
 * User reviews and unchecks anything they want to keep.
 */
export async function analyseIntelliCut(params: {
  audioUrl:         string
  fillerWords?:     string[]
  minSilenceSec?:   number
  removePauses?:    boolean   // pauses > 0.3s between sentences
}): Promise<IntelliCutAnalysis> {
  const {
    audioUrl,
    fillerWords     = DEFAULT_FILLERS,
    minSilenceSec   = 0.5,
    removePauses    = false,
  } = params

  const [transcript, silences] = await Promise.all([
    transcribeAudio(audioUrl),
    detectSilence({ audioUrl, minDurationSec: minSilenceSec }),
  ])

  const items: IntelliCutItem[] = []
  let idx = 0

  // Add filler words from transcript
  for (const word of transcript.words) {
    const normalised = word.word.toLowerCase().replace(/[^a-z ]/g, '')
    if (fillerWords.some(fw => normalised === fw || normalised.startsWith(fw))) {
      items.push({
        id:    `filler-${idx++}`,
        type:  'filler',
        text:  word.word,
        start: word.start,
        end:   word.end,
        keep:  false,
      })
    }
  }

  // Add silence regions
  for (const silence of silences) {
    const isPause = silence.end - silence.start < 0.8

    if (isPause && !removePauses) continue

    items.push({
      id:    `silence-${idx++}`,
      type:  isPause ? 'pause' : 'silence',
      start: silence.start,
      end:   silence.end,
      keep:  false,
    })
  }

  // Sort by start time
  items.sort((a, b) => a.start - b.start)

  const fillerCount  = items.filter(i => i.type === 'filler').length
  const silenceCount = items.filter(i => i.type === 'silence' || i.type === 'pause').length
  const timeSaved    = items
    .filter(i => !i.keep)
    .reduce((acc, i) => acc + (i.end - i.start), 0)

  return {
    items,
    timeSaved,
    wordCount:   transcript.words.length,
    fillerCount,
    silenceCount,
  }
}

/**
 * Apply IntelliCut — remove all items where keep=false.
 * Returns the keep-ranges for FFmpeg processing.
 */
export function applyIntelliCut(
  items:       IntelliCutItem[],
  durationSec: number,
): Array<{ start: number; end: number }> {
  const removals = items
    .filter(i => !i.keep)
    .map(i => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start)

  const keep: Array<{ start: number; end: number }> = []
  let cursor = 0

  for (const r of removals) {
    if (r.start > cursor) keep.push({ start: cursor, end: r.start })
    cursor = Math.max(cursor, r.end)
  }
  if (cursor < durationSec) keep.push({ start: cursor, end: durationSec })

  return keep
}
