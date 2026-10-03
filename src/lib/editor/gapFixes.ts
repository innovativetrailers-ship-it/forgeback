import type { Clip, TimelineRecipe } from '@/lib/timeline/schema'

function nextId(): string {
  return `gap-${Math.random().toString(36).slice(2, 10)}`
}

export interface TranscriptWord {
  text: string
  start: number
  end: number
  speaker?: string
}

const FILLERS = new Set(['um', 'uh', 'uhh', 'umm'])

export function rippleRemoveRange(recipe: TimelineRecipe, start: number, end: number): TimelineRecipe {
  const span = end - start
  if (!(span > 0)) return recipe
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => {
        if (clip.endTime <= start) return [clip]
        if (clip.startTime >= end) {
          return [{ ...clip, startTime: clip.startTime - span, endTime: clip.endTime - span }]
        }
        if (clip.startTime >= start && clip.endTime <= end) return []
        if (clip.startTime < start && clip.endTime > end) {
          return [
            { ...clip, endTime: start },
            { ...clip, id: `${clip.id}-keep`, startTime: start, endTime: clip.endTime - span },
          ]
        }
        if (clip.endTime <= end) return [{ ...clip, endTime: start }]
        return [{ ...clip, startTime: start, endTime: clip.endTime - span }]
      }),
    })),
  }
}

export function fillerRanges(words: TranscriptWord[]): Array<{ start: number; end: number }> {
  return words
    .filter((word) => FILLERS.has(word.text.toLowerCase().replace(/[^a-z]/g, '')))
    .map((word) => ({ start: word.start, end: word.end }))
}

export function removeFillers(recipe: TimelineRecipe, words: TranscriptWord[]): TimelineRecipe {
  return fillerRanges(words).reduce((next, range) => rippleRemoveRange(next, range.start, range.end), recipe)
}

export function sentenceRange(words: TranscriptWord[], sentence: string): { start: number; end: number } | null {
  const target = sentence.toLowerCase().replace(/[^a-z\s]/g, '').trim()
  if (!target) return null
  const tokens = words.map((word) => word.text.toLowerCase().replace(/[^a-z]/g, ''))
  const want = target.split(/\s+/)
  for (let i = 0; i <= tokens.length - want.length; i++) {
    if (want.every((token, offset) => tokens[i + offset] === token)) {
      return { start: words[i].start, end: words[i + want.length - 1].end }
    }
  }
  return null
}

export function detectBeats(energy: number[], hopSeconds: number): number[] {
  if (!energy.length || hopSeconds <= 0) return []
  const mean = energy.reduce((sum, value) => sum + value, 0) / energy.length
  const beats: number[] = []
  for (let i = 1; i < energy.length - 1; i++) {
    if (energy[i] > mean * 1.3 && energy[i] >= energy[i - 1] && energy[i] >= energy[i + 1]) {
      const time = i * hopSeconds
      if (!beats.length || time - beats[beats.length - 1] > hopSeconds * 2) beats.push(Number(time.toFixed(3)))
    }
  }
  return beats
}

export function withBeatMarkers(recipe: TimelineRecipe, times: number[]): TimelineRecipe {
  const markers = times.map((time) => ({ id: nextId(), time, kind: 'beat' as const }))
  return { ...recipe, markers: [...(recipe.markers ?? []).filter((marker) => marker.kind !== 'beat'), ...markers] }
}

export function snapToBeat(time: number, beats: number[], threshold = 0.15): number {
  let best = time
  let distance = threshold
  for (const beat of beats) {
    const gap = Math.abs(beat - time)
    if (gap <= distance) {
      best = beat
      distance = gap
    }
  }
  return best
}

export function alignCutsToBeats(recipe: TimelineRecipe, beats: number[]): TimelineRecipe {
  return {
    ...recipe,
    tracks: recipe.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        startTime: snapToBeat(clip.startTime, beats),
        endTime: Math.max(snapToBeat(clip.startTime, beats) + 0.2, snapToBeat(clip.endTime, beats)),
      })),
    })),
  }
}

export interface TakeLine {
  id: string
  text: string
  sourceUrl: string
}

function overlap(line: string, take: string): number {
  const want = new Set(line.toLowerCase().split(/\W+/).filter((token) => token.length > 2))
  if (!want.size) return 0
  const have = new Set(take.toLowerCase().split(/\W+/))
  let hit = 0
  for (const token of want) if (have.has(token)) hit += 1
  return hit / want.size
}

export function assembleFromTranscript(recipe: TimelineRecipe, lines: string[], takes: TakeLine[]): TimelineRecipe {
  const placed: Clip[] = []
  const alternates: Clip[] = []
  let cursor = 0
  for (const line of lines) {
    const ranked = takes
      .map((take) => ({ take, score: overlap(line, take.text) }))
      .sort((a, b) => b.score - a.score)
    const best = ranked[0]
    if (!best || best.score <= 0) continue
    const clip: Clip = {
      id: nextId(),
      trackId: 'assembled',
      startTime: cursor,
      endTime: cursor + 3,
      sourceUrl: best.take.sourceUrl,
      prompt: line,
      metadata: best.score < 0.34 ? { lowConfidence: true, score: best.score } : { score: best.score },
    }
    placed.push(clip)
    for (const other of ranked.slice(1, 3)) {
      if (other.score <= 0) continue
      alternates.push({
        ...clip,
        id: nextId(),
        trackId: 'alternates',
        sourceUrl: other.take.sourceUrl,
        metadata: { alternate: true, score: other.score, lowConfidence: other.score < 0.34 },
      })
    }
    cursor += 3
  }
  const video = recipe.tracks.find((track) => track.type === 'video' && track.id !== 'alternates')
  const tracks = recipe.tracks
    .filter((track) => track.id !== 'alternates')
    .map((track) => track.id === video?.id
      ? { ...track, clips: [...track.clips, ...placed.map((clip) => ({ ...clip, trackId: track.id }))] }
      : track)
  tracks.push({
    id: 'alternates',
    type: 'video',
    label: 'Alternates',
    muted: true,
    locked: true,
    solo: false,
    clips: alternates,
  })
  return { ...recipe, tracks }
}

export function placeSpeakerRanges(
  recipe: TimelineRecipe,
  sourceUrl: string,
  ranges: Array<{ speaker: string; start: number; end: number }>,
): TimelineRecipe {
  const added = ranges.map((range) => {
    const id = nextId()
    return {
      id,
      type: 'audio' as const,
      label: range.speaker,
      muted: false,
      locked: false,
      solo: false,
      clips: [{
        id: nextId(),
        trackId: id,
        startTime: range.start,
        endTime: Math.max(range.end, range.start + 0.05),
        sourceUrl,
        metadata: { speaker: range.speaker, diarizedRange: true },
      }],
    }
  })
  return { ...recipe, tracks: [...recipe.tracks, ...added] }
}

export function placeSoundscape(recipe: TimelineRecipe, audioUrl: string, at: number, prompt: string): TimelineRecipe {
  const id = nextId()
  return {
    ...recipe,
    tracks: [...recipe.tracks, {
      id,
      type: 'audio',
      label: 'Soundscape',
      muted: false,
      locked: false,
      solo: false,
      clips: [{
        id: nextId(),
        trackId: id,
        startTime: at,
        endTime: at + 8,
        sourceUrl: audioUrl,
        prompt,
      }],
    }],
  }
}

export function speakerRanges(words: TranscriptWord[]): Array<{ speaker: string; start: number; end: number }> {
  const ranges: Array<{ speaker: string; start: number; end: number }> = []
  for (const word of words) {
    const speaker = word.speaker || 'speaker'
    const last = ranges[ranges.length - 1]
    if (last && last.speaker === speaker && word.start - last.end < 0.4) last.end = word.end
    else ranges.push({ speaker, start: word.start, end: word.end })
  }
  return ranges
}
