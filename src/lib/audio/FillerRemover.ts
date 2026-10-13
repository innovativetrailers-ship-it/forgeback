import { buildWhisperSttInput, falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.audio.FillerRemover')
import { db } from '../db'

const DEFAULT_FILLER_WORDS = [
  'um', 'uh', 'like', 'you know', 'sort of', 'basically', 'literally',
  'right', 'okay', 'so', 'actually',
]

interface RemovedSegment {
  start: number
  end: number
  type: 'filler' | 'silence'
  text?: string
}

interface TranscriptWord {
  word: string
  start: number
  end: number
  confidence: number
}

export async function removeFillersAndSilence(params: {
  projectId: string
  fillerWords?: string[]
  silenceThresholdMs?: number
  sensitivity?: 'aggressive' | 'moderate' | 'gentle'
  previewOnly?: boolean
  audioUrl?: string
}): Promise<{
  removedSegments: RemovedSegment[]
  timeSaved: number
  clipCount: number
}> {
  const {
    fillerWords = DEFAULT_FILLER_WORDS,
    silenceThresholdMs = 500,
    sensitivity = 'moderate',
    previewOnly = false,
    audioUrl,
  } = params

  const removedSegments: RemovedSegment[] = []

  if (!audioUrl) {
    return { removedSegments: [], timeSaved: 0, clipCount: 0 }
  }

  // Whisper transcription with word-level timestamps
  const transcriptResult = await falSubscribe(falEndpoint('whisper'), {
    input: buildWhisperSttInput({ audioUrl, chunkLevel: 'word' }),
  }) as unknown as { chunks: Array<{ text: string; timestamp: [number, number] }> }

  // Parse word-level timestamps
  const words: TranscriptWord[] = transcriptResult.chunks.map((c) => ({
    word: c.text.trim().toLowerCase(),
    start: c.timestamp[0],
    end: c.timestamp[1],
    confidence: 1.0,
  }))

  const sensitivityPad = { aggressive: 0, moderate: 0.05, gentle: 0.1 }[sensitivity]

  // Detect filler words
  for (const wordInfo of words) {
    const isFillerWord = fillerWords.some(
      (fw) => wordInfo.word === fw.toLowerCase() || wordInfo.word.includes(fw.toLowerCase())
    )
    if (isFillerWord) {
      removedSegments.push({
        start: Math.max(0, wordInfo.start - sensitivityPad),
        end: wordInfo.end + sensitivityPad,
        type: 'filler',
        text: wordInfo.word,
      })
    }
  }

  // Detect silence gaps using word timestamp gaps
  const silenceThresholdSec = silenceThresholdMs / 1000
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].start - words[i].end
    if (gap > silenceThresholdSec) {
      removedSegments.push({
        start: words[i].end,
        end: words[i + 1].start,
        type: 'silence',
      })
    }
  }

  // Sort by start time
  removedSegments.sort((a, b) => a.start - b.start)

  const timeSaved = removedSegments.reduce((acc, seg) => acc + (seg.end - seg.start), 0)

  return {
    removedSegments: previewOnly ? removedSegments : removedSegments,
    timeSaved,
    clipCount: removedSegments.length,
  }
}
