'use client'

import { useEditorStore, type Clip, type TimelineRecipe, type Track } from '@/store/editor'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { useCallback } from 'react'
import { nanoid } from 'nanoid'

const parseResolution = (resolution: string) => {
  const [w, h] = resolution.split('x').map((n) => parseInt(n, 10))
  return { width: Number.isFinite(w) ? w : 1920, height: Number.isFinite(h) ? h : 1080 }
}

const emptyClip = (
  trackId: string,
  startTime: number,
  duration: number,
  videoUrl: string,
): Clip => ({
  id: nanoid(),
  trackId,
  startTime,
  duration,
  videoUrl,
  proxyUrl: null,
  thumbnailUrl: null,
  prompt: '',
  engineUsed: 'imported',
  tier: 'Draft',
  characterIds: [],
  locationId: null,
  isGenerating: false,
  generationProgress: 0,
  jobId: null,
  trimIn: 0,
  trimOut: duration,
  volume: 1,
  opacity: 1,
  speed: 1,
  colourGradeJson: null,
  sfxMakeupJson: null,
  src: videoUrl,
  type: 'video',
})

export function useTimeline() {
  const {
    selectedClipId,
    playheadTime,
    isPlaying,
    zoom,
    setTimeline,
    selectClip,
    setPlayheadTime,
    setIsPlaying,
    setZoom,
    addTrack,
    removeTrack,
    addClipToTrack,
    updateClip,
    removeClip,
    reorderTracks,
  } = useEditorStore()
  const timeline = useEditorRecipeView()

  const initTimeline = useCallback(
    (fps: number = 24, resolution: string = '1920x1080') => {
      const defaultTracks: Track[] = [
        { id: nanoid(), type: 'video', name: 'VIDEO 1', label: 'VIDEO 1', height: 72, muted: false, locked: false, solo: false, clips: [] },
        { id: nanoid(), type: 'video', name: 'VIDEO 2', label: 'VIDEO 2', height: 72, muted: false, locked: false, solo: false, clips: [] },
        { id: nanoid(), type: 'vfx', name: 'VFX', label: 'VFX', height: 72, muted: false, locked: false, solo: false, clips: [] },
        { id: nanoid(), type: 'audio', name: 'MUSIC', label: 'MUSIC', height: 48, muted: false, locked: false, solo: false, volume: 0.8, clips: [] },
        { id: nanoid(), type: 'audio', name: 'VOICE', label: 'VOICE', height: 48, muted: false, locked: false, solo: false, volume: 1, clips: [] },
        { id: nanoid(), type: 'audio', name: 'SFX', label: 'SFX', height: 48, muted: false, locked: false, solo: false, volume: 0.7, clips: [] },
      ]
      const recipe: TimelineRecipe = {
        id: nanoid(),
        projectId: '',
        fps,
        resolution: parseResolution(resolution),
        totalDuration: 0,
        durationSeconds: 0,
        colourSpace: 'rec709',
        tracks: defaultTracks,
      }
      setTimeline(recipe)
    },
    [setTimeline],
  )

  const appendClip = useCallback(
    (trackId: string, sourceUrl: string, duration: number) => {
      const track = timeline?.tracks.find((t) => t.id === trackId)
      if (!track) return

      const startTime = track.clips.reduce(
        (max, c) => Math.max(max, c.startTime + c.duration),
        0,
      )

      const clip = emptyClip(trackId, startTime, duration, sourceUrl)
      addClipToTrack(trackId, clip)
      return clip
    },
    [timeline, addClipToTrack],
  )

  const getSelectedClip = useCallback(() => {
    if (!selectedClipId || !timeline) return null
    for (const track of timeline.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId)
      if (clip) return clip
    }
    return null
  }, [selectedClipId, timeline])

  const totalDuration = timeline?.tracks.reduce((max, t) => {
    const trackEnd = t.clips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0)
    return Math.max(max, trackEnd)
  }, 0) ?? 0

  return {
    timeline,
    selectedClipId,
    playheadTime,
    isPlaying,
    zoom,
    totalDuration,
    initTimeline,
    appendClip,
    getSelectedClip,
    selectClip,
    setPlayheadTime,
    setIsPlaying,
    setZoom,
    addTrack,
    removeTrack,
    updateClip,
    removeClip,
    reorderTracks,
  }
}
