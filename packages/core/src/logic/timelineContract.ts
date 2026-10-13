export interface TimelineClipContract {
  id: string
  sourceUrl: string
  startTime: number
  endTime: number
  shotPlanId?: string | null
}

function clipKey(clip: TimelineClipContract): string {
  return clip.shotPlanId || clip.id
}

function isPlaced(clip: TimelineClipContract, sourceUrl: string): boolean {
  return Boolean(clip.sourceUrl?.trim())
    && clip.sourceUrl === sourceUrl
    && Number(clip.endTime) > Number(clip.startTime)
}

/**
 * Merge incoming clips onto a track.
 * A clip leaves only when its id or shot id is in suppressedIds (an explicit delete).
 */
export function mergeTimelineClips<T extends TimelineClipContract>(input: {
  clips: T[]
  incoming: T[]
  suppressedIds?: readonly string[]
}): { clips: T[]; added: number; updated: number } {
  const suppressed = new Set(input.suppressedIds ?? [])
  let clips = input.clips.filter((clip) => {
    if (suppressed.has(clip.id)) return false
    if (clip.shotPlanId && suppressed.has(clip.shotPlanId)) return false
    return true
  })
  let added = 0
  let updated = 0
  let lastEnd = clips.reduce((max, clip) => Math.max(max, clip.endTime), 0)

  for (const next of input.incoming) {
    if (suppressed.has(next.id) || (next.shotPlanId && suppressed.has(next.shotPlanId))) continue
    const idx = clips.findIndex((clip) => clipKey(clip) === clipKey(next) || clip.id === next.id)
    if (idx >= 0 && isPlaced(clips[idx]!, next.sourceUrl)) continue
    if (idx >= 0) {
      const shell = clips[idx]!
      const startTime = Number.isFinite(shell.startTime) ? shell.startTime : lastEnd
      const span = Math.max(0, next.endTime - next.startTime)
      const endTime = Number(shell.endTime) > startTime ? shell.endTime : startTime + span
      clips = clips.map((clip, index) => index === idx
        ? {
          ...shell,
          startTime,
          endTime,
          sourceUrl: next.sourceUrl || shell.sourceUrl,
          shotPlanId: next.shotPlanId ?? shell.shotPlanId,
        }
        : clip)
      if (!isPlaced(shell, next.sourceUrl || shell.sourceUrl)) updated += 1
      continue
    }
    const span = Math.max(0, next.endTime - next.startTime)
    clips = [...clips, { ...next, startTime: lastEnd, endTime: lastEnd + span }]
    lastEnd += span
    added += 1
  }

  return { clips, added, updated }
}
