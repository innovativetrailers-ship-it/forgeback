import { mergeTimelineClips, type TimelineClipContract } from '@cinema/core'
import { jobPlaybackPath } from '@/lib/media/jobPlayback'
import { shotPlaybackUrl } from '@/lib/media/clipPlayback'
import type { ShotPlanCard } from '@/lib/studio/shotPlan'
import type { Clip, TimelineRecipe, Track } from '@/lib/timeline/schema'
import { computeTimelineDuration, isVideoMediaUrl, sanitizeClipDuration } from '@/lib/timeline/playback'
import { buildDefaultRecipe } from '@/lib/timeline/defaultRecipe'
import { usePlaybackStore } from '@/store/playbackStore'

const VIDEO_TRACK_ID = 't-v1'

function isTimelineShot(shot: ShotPlanCard): boolean {
  return shot.status === 'completed' || shot.status === 'manual'
}

function findClipForShot(track: Track, shotId: string): Clip | undefined {
  return track.clips.find((c) => {
    const meta = c.metadata as { shotPlanId?: string } | undefined
    return meta?.shotPlanId === shotId || c.id === shotId
  })
}

function hasPlayableSource(clip: Clip): boolean {
  return Boolean(clip.sourceUrl?.trim()) && isVideoMediaUrl(clip.sourceUrl)
}

/** A shot slot is not a placed clip. Placement needs a media url and a positive span. */
function isPlacedClip(clip: Clip, sourceUrl: string): boolean {
  return hasPlayableSource(clip)
    && clip.sourceUrl === sourceUrl
    && Number(clip.endTime) > Number(clip.startTime)
}

function clipKey(clip: Clip): string {
  const shotPlanId = (clip.metadata as { shotPlanId?: string } | undefined)?.shotPlanId
  return shotPlanId || clip.id
}

function logReconcileDiagnostics(
  shots: ShotPlanCard[],
  added: number,
  updated: number,
): void {
  const completed = shots.filter(isTimelineShot).length
  const withVideo = shots.filter((s) => Boolean(s.videoUrl?.trim())).length
  console.log('reconcileTimeline', {
    total: shots.length,
    completed,
    withVideo,
    added,
    updated,
  })
}

function playbackForShot(shot: ShotPlanCard): string {
  return shotPlaybackUrl(shot.id, shot.videoUrl)
}

/** @deprecated Use reconcileTimeline — projects shots into playbackStore.recipe. */
export function reconcileTimelineStore(shots: ShotPlanCard[]): void {
  const { recipe, projectId, setRecipe } = usePlaybackStore.getState()
  const base = recipe ?? buildDefaultRecipe(projectId ?? 'local')
  const { recipe: next } = reconcileTimeline(shots, base)
  setRecipe(next)
}

/** Add or fill shot-plan clips on the Ultimate/Advanced editor recipe. */
export function reconcileRecipeFromShots(
  shots: ShotPlanCard[],
  recipe: TimelineRecipe,
): { recipe: TimelineRecipe; added: number; updated: number } {
  const track = recipe.tracks.find((t) => t.id === VIDEO_TRACK_ID)
  if (!track) return { recipe, added: 0, updated: 0 }

  const suppressedIds = usePlaybackStore.getState().suppressedShotIds
  const existing: TimelineClipContract[] = track.clips.map((clip) => ({
    id: clip.id,
    sourceUrl: clip.sourceUrl,
    startTime: clip.startTime,
    endTime: clip.endTime,
    shotPlanId: (clip.metadata as { shotPlanId?: string } | undefined)?.shotPlanId ?? null,
  }))
  const incoming: TimelineClipContract[] = shots.filter(isTimelineShot).flatMap((shot) => {
    const sourceUrl = playbackForShot(shot)
    if (!sourceUrl.trim() || !isVideoMediaUrl(sourceUrl)) return []
    const prior = findClipForShot(track, shot.id)
    const duration = sanitizeClipDuration(shot.duration)
    const startTime = prior?.startTime ?? 0
    const endTime = prior && prior.endTime > prior.startTime ? prior.endTime : startTime + duration
    return [{
      id: prior?.id ?? shot.id,
      sourceUrl,
      startTime,
      endTime,
      shotPlanId: shot.id,
    }]
  })
  const firstVideo = shots.find((shot) => isTimelineShot(shot) && shot.videoUrl?.trim())
  if (firstVideo) {
    const prior = findClipForShot(track, firstVideo.id)
    console.log('reconcile_decision', {
      shotId: firstVideo.id,
      priorKey: prior ? clipKey(prior) : null,
      priorSource: prior?.sourceUrl ?? null,
      nextSource: playbackForShot(firstVideo),
      placed: Boolean(prior && isPlacedClip(prior, playbackForShot(firstVideo))),
      trackClips: track.clips.length,
    })
  }
  const merged = mergeTimelineClips({ clips: existing, incoming, suppressedIds })
  const byId = new Map(track.clips.map((clip) => [clip.id, clip]))
  const shotById = new Map(shots.map((shot) => [shot.id, shot]))
  const clips = merged.clips.map((slim) => {
    const prev = byId.get(slim.id)
    const shot = slim.shotPlanId ? shotById.get(slim.shotPlanId) : undefined
    if (prev) {
      return {
        ...prev,
        startTime: slim.startTime,
        endTime: slim.endTime,
        sourceUrl: slim.sourceUrl,
        posterUrl: shot?.lastFrame ?? prev.posterUrl,
        metadata: { ...(prev.metadata as object | undefined), shotPlanId: slim.shotPlanId ?? undefined },
      }
    }
    return {
      id: slim.id,
      trackId: VIDEO_TRACK_ID,
      startTime: slim.startTime,
      endTime: slim.endTime,
      sourceUrl: slim.sourceUrl,
      posterUrl: shot?.lastFrame,
      prompt: shot ? `Shot ${shot.shotNumber}` : undefined,
      metadata: { shotPlanId: slim.shotPlanId ?? undefined },
    }
  })
  const added = merged.added
  const updated = merged.updated
  const changed = added > 0 || updated > 0 || clips.length !== track.clips.length

  if (!changed) return { recipe, added: 0, updated: 0 }

  const nextTracks = recipe.tracks.map((t) =>
    t.id === VIDEO_TRACK_ID ? { ...t, clips } : t,
  )

  return {
    recipe: {
      ...recipe,
      tracks: nextTracks,
      durationSeconds: computeTimelineDuration(nextTracks, recipe.durationSeconds),
    },
    added,
    updated,
  }
}

/** Unified projection: DB completed shots → playbackStore recipe only. */
export function reconcileTimeline(
  shots: ShotPlanCard[],
  recipe: TimelineRecipe,
): { recipe: TimelineRecipe; added: number; updated: number } {
  const before = videoTrackCount(recipe)
  const { recipe: next, added, updated } = reconcileRecipeFromShots(shots, recipe)
  const after = videoTrackCount(next)
  if (usePlaybackStore.getState().recipe !== next) {
    usePlaybackStore.getState().setRecipe(next)
  }
  logReconcileDiagnostics(shots, added, updated)
  console.log('[timeline_render_target]', { before, after, added, updated })
  return { recipe: next, added, updated }
}

export function videoTrackCount(recipe: TimelineRecipe | null | undefined): number {
  return recipe?.tracks.find((track) => track.id === VIDEO_TRACK_ID)?.clips.length ?? 0
}

/** The strip paints whichever recipe actually has t-v1 clips. */
export function recipeForTimeline(
  storeRecipe: TimelineRecipe | null,
  localRecipe: TimelineRecipe | null,
): TimelineRecipe | null {
  if (videoTrackCount(storeRecipe) >= videoTrackCount(localRecipe)) return storeRecipe ?? localRecipe
  return localRecipe ?? storeRecipe
}

/** Prefer same-origin playback when a render job id is known. */
export function reconcileRecipeFromShotsWithJobs(
  shots: ShotPlanCard[],
  recipe: TimelineRecipe,
  jobIdByShotId?: Map<string, string>,
): TimelineRecipe {
  if (!jobIdByShotId?.size) return reconcileRecipeFromShots(shots, recipe).recipe

  const patched = shots.map((s) => {
    const jobId = jobIdByShotId.get(s.id)
    const playback = jobId ? jobPlaybackPath(jobId) : null
    return playback && s.videoUrl ? { ...s, videoUrl: playback } : s
  })
  return reconcileRecipeFromShots(patched, recipe).recipe
}

/** Move a clip onto a track. Same-track moves only change time. */
export function moveClipInRecipe(
  recipe: TimelineRecipe,
  clipId: string,
  newStart: number,
  targetTrackId: string,
): TimelineRecipe {
  const found = recipe.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId)
  if (!found) return recipe
  const dur = Math.max(0.5, found.endTime - found.startTime)
  const placed: Clip = { ...found, trackId: targetTrackId, startTime: newStart, endTime: newStart + dur }
  const stripped = recipe.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== clipId),
  }))
  return {
    ...recipe,
    tracks: stripped.map((track) =>
      track.id === targetTrackId
        ? { ...track, clips: [...track.clips, placed].sort((a, b) => a.startTime - b.startTime) }
        : track,
    ),
  }
}
