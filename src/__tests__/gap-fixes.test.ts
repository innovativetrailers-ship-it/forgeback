import { KEYMAP_PRESETS, commandFor, exportKeymap, importKeymap } from '@/lib/editor/keymap'
import {
  alignCutsToBeats,
  assembleFromTranscript,
  detectBeats,
  fillerRanges,
  removeFillers,
  rippleRemoveRange,
  sentenceRange,
  snapToBeat,
  speakerRanges,
  withBeatMarkers,
  type TranscriptWord,
} from '@/lib/editor/gapFixes'
import type { TimelineRecipe } from '@/lib/timeline/schema'

function recipe(): TimelineRecipe {
  return {
    id: 'film',
    projectId: 'p',
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    durationSeconds: 8,
    colorSpace: 'rec709',
    tracks: [{
      id: 'v1', type: 'video', label: 'V', muted: false, locked: false, solo: false,
      clips: [{ id: 'a', trackId: 'v1', startTime: 0, endTime: 4, sourceUrl: 'https://example.com/a.mp4' }],
    }],
  }
}

const words: TranscriptWord[] = [
  { text: 'Hello', start: 0, end: 0.4 },
  { text: 'um', start: 0.5, end: 0.7 },
  { text: 'there', start: 0.8, end: 1.2 },
]

describe('gap fixes', () => {
  it('ships the verified Premiere and Resolve bindings', () => {
    expect(KEYMAP_PRESETS.Premiere.c).toBe('razor')
    expect(KEYMAP_PRESETS.Premiere.b).toBe('ripple')
    expect(KEYMAP_PRESETS.Premiere[',']).toBe('insert')
    expect(KEYMAP_PRESETS.Premiere['shift+backspace']).toBe('rippleDelete')
    expect(KEYMAP_PRESETS.Resolve.f9).toBe('insert')
    expect(KEYMAP_PRESETS.Resolve.a).toBe('select')
    expect(KEYMAP_PRESETS.Resolve['mod+\\']).toBe('split')
    expect(KEYMAP_PRESETS.Resolve['alt+v']).toBe('pasteAttributes')
    expect(commandFor(KEYMAP_PRESETS.Premiere, { key: 'A', shiftKey: true })).toBe('trackSelectBack')
    const raw = exportKeymap(KEYMAP_PRESETS.Forge)
    expect(importKeymap(raw)?.b).toBe('blade')
  })

  it('ripple-removes a sentence and fillers without touching the source file of the kept clip', () => {
    const range = sentenceRange(words, 'Hello um')
    expect(range).toEqual({ start: 0, end: 0.7 })
    const cut = rippleRemoveRange(recipe(), 0.5, 0.7)
    expect(cut.tracks[0].clips[0].sourceUrl).toBe('https://example.com/a.mp4')
    expect(fillerRanges(words)).toEqual([{ start: 0.5, end: 0.7 }])
    expect(removeFillers(recipe(), words).tracks[0].clips.length).toBeGreaterThan(0)
  })

  it('detects beats, snaps a cut, and assembles takes without generating', () => {
    const beats = detectBeats([0.1, 0.2, 0.9, 0.1, 0.2, 0.95, 0.1], 0.5)
    expect(beats.length).toBeGreaterThan(0)
    expect(snapToBeat(beats[0] + 0.05, beats)).toBe(beats[0])
    const marked = withBeatMarkers(recipe(), beats)
    const snapped = alignCutsToBeats(marked, beats)
    expect(snapped.tracks[0].clips[0].sourceUrl).toBe('https://example.com/a.mp4')
    const assembled = assembleFromTranscript(recipe(), ['woman crosses the room'], [
      { id: 't1', text: 'a woman crosses the room slowly', sourceUrl: 'https://example.com/best.mp4' },
      { id: 't2', text: 'unrelated weather', sourceUrl: 'https://example.com/alt.mp4' },
    ])
    expect(assembled.tracks[0].clips.some((clip) => clip.sourceUrl.includes('best'))).toBe(true)
    expect(assembled.tracks.some((track) => track.locked && track.label === 'Alternates')).toBe(true)
  })

  it('groups diarized words onto speaker ranges and keeps the source', () => {
    const ranges = speakerRanges([
      { text: 'Hi', start: 0, end: 0.3, speaker: 'a' },
      { text: 'there', start: 0.4, end: 0.8, speaker: 'a' },
      { text: 'Hey', start: 1.2, end: 1.5, speaker: 'b' },
    ])
    expect(ranges.map((range) => range.speaker)).toEqual(['a', 'b'])
  })
})
