export type SceneRollup = 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED' | 'PARTIAL'

/** Honest parent status from the full clip mix. Awaiting does not hide completed siblings. */
export function sceneStatusFromClips(statuses: string[]): SceneRollup {
  if (!statuses.length) return 'PENDING'
  if (statuses.some((status) => status === 'GENERATING')) return 'GENERATING'
  const done = statuses.filter((status) => status === 'COMPLETED' || status === 'MANUAL').length
  const failed = statuses.filter((status) => status === 'FAILED').length
  if (done === statuses.length) return 'GENERATED'
  if (done > 0) return 'PARTIAL'
  if (failed > 0) return 'FAILED'
  return 'PENDING'
}
