export type SceneRollup = 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED' | 'PARTIAL'

/** Honest parent status from child clip statuses. GENERATED means every clip finished cleanly. */
export function sceneStatusFromClips(statuses: string[]): SceneRollup {
  if (!statuses.length) return 'PENDING'
  if (statuses.some((status) => status === 'GENERATING')) return 'GENERATING'
  if (statuses.some((status) => status === 'PENDING' || status === 'AWAITING_DIRECTION')) return 'PENDING'
  const failed = statuses.filter((status) => status === 'FAILED').length
  const done = statuses.filter((status) => status === 'COMPLETED' || status === 'MANUAL').length
  if (failed && done) return 'PARTIAL'
  if (failed && failed === statuses.length) return 'FAILED'
  if (done === statuses.length) return 'GENERATED'
  return 'PENDING'
}
