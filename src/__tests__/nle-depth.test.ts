import type { TimelineRecipe } from '@/lib/timeline/schema'
import {
  addAdjustment,
  applyLookPreset,
  attachProxy,
  expandForExport,
  exportPlaybackUrl,
  nestSequence,
  removeTimelineClip,
  saveLookPreset,
} from '@/lib/timeline/nleDepth'

function recipe(): TimelineRecipe {
  return {
    id: 'film',
    projectId: 'project',
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    durationSeconds: 8,
    colorSpace: 'rec709',
    tracks: [{
      id: 'v1',
      type: 'video',
      label: 'Video',
      muted: false,
      locked: false,
      solo: false,
      clips: [{
        id: 'a',
        trackId: 'v1',
        startTime: 0,
        endTime: 4,
        sourceUrl: 'https://example.com/full.mp4',
        colourGrade: { filmEmulation: 'kodak_5219' },
      }],
    }],
  }
}

describe('nle depth', () => {
  it('keeps full resolution when a proxy is attached', () => {
    const withProxy = attachProxy(recipe(), 'a', 'https://example.com/proxy.mp4')
    const clip = withProxy.tracks[0].clips[0]
    expect(clip.sourceUrl).toBe('https://example.com/full.mp4')
    expect(clip.proxyUrl).toBe('https://example.com/proxy.mp4')
    expect(exportPlaybackUrl(clip)).toBe('https://example.com/full.mp4')
    const exported = expandForExport({ ...withProxy, editWithProxies: true })
    expect(exported.tracks[0].clips[0].sourceUrl).toBe('https://example.com/full.mp4')
  })

  it('applies an adjustment look and leaves the clip when the layer is removed', () => {
    const base = recipe()
    const layered = addAdjustment(base, 0, 4, { effects: [{ type: 'bloom', intensity: 0.5 }] })
    const exported = expandForExport(layered)
    expect(exported.tracks[0].clips).toHaveLength(1)
    expect(exported.tracks[0].clips[0].effects?.[0].type).toBe('bloom')
    expect(exported.tracks[0].clips[0].id).toBe('a')
    const removed = removeTimelineClip(layered, layered.tracks[0].clips.find((clip) => clip.adjustment)!.id)
    expect(removed.tracks[0].clips.map((clip) => clip.id)).toEqual(['a'])
  })

  it('nests a sequence and refuses a cycle', () => {
    const parent = recipe()
    const child = recipe()
    child.id = 'scene'
    const nested = nestSequence(parent, child, 4, 8)
    const exported = expandForExport(nested)
    expect(exported.tracks[0].clips.some((clip) => clip.sourceUrl === 'https://example.com/full.mp4')).toBe(true)
    expect(() => nestSequence(nested, nested, 0, 1)).toThrow(/already inside/)
  })

  it('applies a look preset and meters a model preset', () => {
    const clip = recipe().tracks[0].clips[0]
    const preset = saveLookPreset('Warm', clip)
    const applied = applyLookPreset({ ...clip, colourGrade: undefined }, preset)
    expect(applied.metered).toBe(false)
    expect(applied.clip.colourGrade?.filmEmulation).toBe('kodak_5219')
    const model = { ...preset, modelOp: true }
    expect(applyLookPreset(clip, model).metered).toBe(true)
    expect(applyLookPreset(clip, model).clip.colourGrade?.filmEmulation).toBe('kodak_5219')
  })
})
