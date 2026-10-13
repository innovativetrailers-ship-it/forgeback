import { nanoid } from 'nanoid'
import type { TimelineRecipe, Track } from '@/lib/timeline/schema'

export const DEFAULT_TRACKS: Track[] = [
  { id: 't-v1', type: 'video', label: 'VIDEO 1', muted: false, locked: false, solo: false, clips: [] },
  { id: 't-v2', type: 'video', label: 'VIDEO 2', muted: false, locked: false, solo: false, clips: [] },
  { id: 't-vfx', type: 'vfx', label: 'VFX', muted: false, locked: false, solo: false, clips: [] },
  { id: 't-cgi', type: 'cgi', label: 'CGI', muted: false, locked: false, solo: false, clips: [] },
  { id: 't-music', type: 'audio', label: 'MUSIC', muted: false, locked: false, solo: false, volume: 0.7, clips: [] },
  { id: 't-voice', type: 'audio', label: 'VOICE', muted: false, locked: false, solo: false, volume: 1, clips: [] },
  { id: 't-sfx', type: 'audio', label: 'SFX', muted: false, locked: false, solo: false, volume: 0.6, clips: [] },
  { id: 't-cap', type: 'caption', label: 'CAPTIONS', muted: false, locked: false, solo: false, clips: [] },
]

export function buildDefaultRecipe(projectId: string): TimelineRecipe {
  return {
    id: nanoid(),
    projectId,
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    durationSeconds: 120,
    colorSpace: 'rec709',
    tracks: DEFAULT_TRACKS.map((t) => ({ ...t, clips: [...t.clips] })),
  }
}

export function isTimelineRecipe(value: unknown): value is TimelineRecipe {
  if (!value || typeof value !== 'object') return false
  const r = value as TimelineRecipe
  return (
    typeof r.id === 'string' &&
    typeof r.projectId === 'string' &&
    Array.isArray(r.tracks) &&
    r.tracks.every((t) => Array.isArray(t.clips))
  )
}
