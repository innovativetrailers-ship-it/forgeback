import { assembleMusicVideo, assertMusicRights, musicBreakdown, treatmentFromPlan } from '@/lib/orchestration/musicVideo'
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
      clips: [{ id: 'kept', trackId: 'v1', startTime: 0, endTime: 4, sourceUrl: 'https://example.com/kept.mp4' }],
    }],
  }
}

describe('music video mode', () => {
  it('refuses a track until the rights warrant is accepted', () => {
    expect(() => assertMusicRights(false)).toThrow(/rights/)
    expect(() => assertMusicRights(true)).not.toThrow()
  })

  it('times shots to sections and keeps the existing clip when assembling', () => {
    const plan = musicBreakdown({ audioUrl: 'https://example.com/song.mp3', duration: 32, bpm: 120, performer: 'Ava' })
    expect(plan.rights).toBe(false)
    expect(plan.beats[1]).toBe(0.5)
    expect(plan.breakdown.scenes[0].shots.every((shot) => shot.section && shot.choreography)).toBe(true)
    expect(plan.breakdown.entities[0].isPrimary).toBe(true)
    expect(treatmentFromPlan(plan)).toMatch(/lip-sync/i)
    const next = assembleMusicVideo(recipe(), plan)
    expect(next.tracks[0].clips[0].sourceUrl).toBe('https://example.com/kept.mp4')
    expect(next.tracks.some((track) => track.label === 'Master' && track.clips[0].sourceUrl.endsWith('song.mp3'))).toBe(true)
    expect(next.markers?.some((marker) => marker.kind === 'beat')).toBe(true)
  })
})