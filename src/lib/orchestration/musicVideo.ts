import type { BreakdownShot, ProductionBreakdown } from '@cinema/core'
import { detectBeats } from '@/lib/editor/gapFixes'
import type { TimelineRecipe } from '@/lib/timeline/schema'

export type MusicSectionName = NonNullable<BreakdownShot['section']>

export interface MusicSection {
  name: MusicSectionName
  start: number
  end: number
}

export interface MusicVideoPlan {
  audioUrl: string
  rights: boolean
  duration: number
  bpm: number
  beats: number[]
  sections: MusicSection[]
  breakdown: ProductionBreakdown
}

const SECTION_SHARE: Array<{ name: MusicSectionName; share: number; energy: string }> = [
  { name: 'intro', share: 0.08, energy: 'still, the performer finding the pulse' },
  { name: 'verse', share: 0.22, energy: 'close performance, restrained movement' },
  { name: 'chorus', share: 0.18, energy: 'full-body choreography on the downbeat' },
  { name: 'verse', share: 0.18, energy: 'the same performer, a new angle, same wardrobe' },
  { name: 'chorus', share: 0.18, energy: 'the chorus choreography returns, wider' },
  { name: 'bridge', share: 0.08, energy: 'a break in the movement, held eye-line' },
  { name: 'outro', share: 0.08, energy: 'the cast settles as the track ends' },
]

export function assertMusicRights(rights: boolean): void {
  if (!rights) throw new Error('Music rights are required before a video can be made from this track')
}

export function beatsFromBpm(bpm: number, duration: number): number[] {
  if (!(bpm > 0) || !(duration > 0)) return []
  const step = 60 / bpm
  const beats: number[] = []
  for (let time = 0; time < duration - 0.05; time += step) beats.push(Number(time.toFixed(3)))
  return beats
}

export function beatsForTrack(input: { bpm?: number; duration: number; energy?: number[]; hopSeconds?: number }): number[] {
  if (input.energy?.length) return detectBeats(input.energy, input.hopSeconds ?? 0.25)
  return beatsFromBpm(input.bpm ?? 120, input.duration)
}

export function sectionsFor(duration: number): MusicSection[] {
  let cursor = 0
  return SECTION_SHARE.map((row) => {
    const start = Number(cursor.toFixed(3))
    cursor = Math.min(duration, cursor + duration * row.share)
    return { name: row.name, start, end: Number(cursor.toFixed(3)) }
  }).filter((row) => row.end > row.start)
}

function snap(time: number, beats: number[]): number {
  if (!beats.length) return time
  let best = beats[0]
  let gap = Math.abs(time - best)
  for (const beat of beats) {
    const next = Math.abs(time - beat)
    if (next < gap) {
      best = beat
      gap = next
    }
  }
  return best
}

export function musicBreakdown(input: {
  audioUrl: string
  duration: number
  bpm?: number
  energy?: number[]
  performer?: string
}): MusicVideoPlan {
  const duration = Math.max(8, input.duration)
  const bpm = input.bpm && input.bpm > 0 ? input.bpm : 120
  const beats = beatsForTrack({ bpm, duration, energy: input.energy })
  const sections = sectionsFor(duration)
  const performer = input.performer?.trim() || 'the lead performer'
  const shots: BreakdownShot[] = sections.map((section, index) => {
    const start = snap(section.start, beats)
    const end = Math.max(start + 1, snap(section.end, beats))
    const vocal = section.name === 'verse' || section.name === 'chorus'
    const choreography = SECTION_SHARE.find((row) => row.name === section.name)?.energy ?? 'movement on the beat'
    return {
      id: `mv-${index + 1}`,
      duration: Number((end - start).toFixed(3)),
      description: `${performer} in the ${section.name}. ${choreography}. Same face, same wardrobe.`,
      entityRefs: [],
      continuity: index === 0 ? 'cut' : 'continuous',
      section: section.name,
      barStart: Math.floor(start / (60 / bpm) / 4) + 1,
      barEnd: Math.max(1, Math.floor(end / (60 / bpm) / 4)),
      choreography,
      lipSync: vocal,
    }
  })
  return {
    audioUrl: input.audioUrl,
    rights: false,
    duration,
    bpm,
    beats,
    sections,
    breakdown: {
      scenes: [{
        id: 'mv-scene',
        description: `Music video timed to the track at ${bpm} BPM.`,
        shots,
      }],
      entities: [{
        id: 'mv-lead',
        kind: 'character',
        name: performer,
        descriptor: 'The same performer in every shot. Primary identity, no variation drift.',
        appearsInShots: shots.map((shot) => shot.id),
        isPrimary: true,
      }],
    },
  }
}

export function treatmentFromPlan(plan: MusicVideoPlan): string {
  const lines = plan.breakdown.scenes[0]?.shots.map((shot) => {
    const sync = shot.lipSync ? ' Generate a performance from the still and this vocal, or lip-sync an existing clip.' : ''
    return `${shot.section} (${shot.duration}s, bars ${shot.barStart}–${shot.barEnd}): ${shot.description} Choreography: ${shot.choreography}.${sync}`
  }) ?? []
  return [`Music video at ${plan.bpm} BPM.`, ...lines].join('\n')
}

/** Place the plan on a copy of the recipe. Existing clips stay. The track is the only new audio master. */
export function assembleMusicVideo(recipe: TimelineRecipe, plan: MusicVideoPlan): TimelineRecipe {
  const video = recipe.tracks.find((track) => track.type === 'video' && !track.locked)
  const videoId = video?.id ?? 'mv-video'
  let cursor = video?.clips.reduce((max, clip) => Math.max(max, clip.endTime), 0) ?? 0
  const placed = plan.breakdown.scenes.flatMap((scene) => scene.shots).map((shot) => {
    const start = cursor
    const end = start + shot.duration
    cursor = end
    return {
      id: shot.id,
      trackId: videoId,
      startTime: start,
      endTime: end,
      sourceUrl: '',
      prompt: `${shot.description} ${shot.choreography ?? ''}`.trim(),
    }
  })
  const tracks = recipe.tracks.map((track) => track.id === videoId
    ? { ...track, clips: [...track.clips, ...placed] }
    : track)
  if (!video) {
    tracks.unshift({
      id: videoId, type: 'video', label: 'Video', muted: false, locked: false, solo: false, clips: placed,
    })
  }
  const masterId = 'mv-master'
  tracks.push({
    id: masterId,
    type: 'audio',
    label: 'Master',
    muted: false,
    locked: true,
    solo: false,
    clips: [{
      id: 'mv-master-audio',
      trackId: masterId,
      startTime: 0,
      endTime: plan.duration,
      sourceUrl: plan.audioUrl,
      prompt: 'Imported master track',
    }],
  })
  return {
    ...recipe,
    durationSeconds: Math.max(recipe.durationSeconds, plan.duration),
    markers: [
      ...(recipe.markers ?? []).filter((marker) => marker.kind !== 'beat'),
      ...plan.beats.map((time, index) => ({ id: `beat-${index}`, time, kind: 'beat' as const })),
    ],
    tracks,
  }
}
