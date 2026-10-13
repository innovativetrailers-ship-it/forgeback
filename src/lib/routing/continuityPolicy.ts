import type { SceneSegment } from './types'

const HARD_REQUIREMENTS = new Set([
  'fluid_dynamics',
])

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of items) {
    const k = keyFn(item)
    if (!out[k]) out[k] = []
    out[k].push(item)
  }
  return out
}

function mergeAdjacentSameEngine(segments: SceneSegment[]): SceneSegment[] {
  const merged: SceneSegment[] = []
  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.shotId === seg.shotId &&
      last.engineId === seg.engineId &&
      last.endSeconds === seg.startSeconds
    ) {
      last.endSeconds = seg.endSeconds
      last.requirements = [...new Set([...last.requirements, ...seg.requirements])]
      last.estimatedCredits += seg.estimatedCredits
      if (seg.prompt && seg.prompt !== last.prompt) {
        last.prompt = `${last.prompt} ${seg.prompt}`.trim()
      }
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

/**
 * Enforce cut-point-aware model switching: within a shot, bias to the dominant
 * engine unless a hard specialist requirement applies. Merge adjacent same-engine
 * segments into one generation call.
 */
export function enforceContinuityPolicy(segments: SceneSegment[]): SceneSegment[] {
  const shots = groupBy(segments, (s) => s.shotId)
  const result: SceneSegment[] = []

  for (const shotSegments of Object.values(shots)) {
    const ordered = [...shotSegments].sort((a, b) => a.startSeconds - b.startSeconds)

    const engineSeconds = new Map<string, number>()
    for (const seg of ordered) {
      const dur = seg.endSeconds - seg.startSeconds
      engineSeconds.set(seg.engineId, (engineSeconds.get(seg.engineId) ?? 0) + dur)
    }
    const dominant = [...engineSeconds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!dominant) {
      result.push(...ordered)
      continue
    }

    for (const seg of ordered) {
      const hasHardReq = seg.requirements.some((r) => HARD_REQUIREMENTS.has(r))
      result.push({
        ...seg,
        engineId: hasHardReq ? seg.engineId : dominant,
      })
    }
  }

  return mergeAdjacentSameEngine(result)
}
