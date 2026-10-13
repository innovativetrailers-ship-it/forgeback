export const MISSING_FAIL_REASON = 'failed — reason not captured (pre-reconcile)'

const CANONICAL_STATES = new Set(['unresolved', 'imported', 'generated', 'trained'])

/** Legacy `resolved` / `needs_action` values map onto the canonical set. Nothing is deleted. */
export function canonicalAssetState(row: {
  resolutionState: string
  kind?: string | null
  generatedImage?: string | null
  weightsKey?: string | null
}): { resolutionState: string; needsAction: boolean } {
  if (row.weightsKey) return { resolutionState: 'trained', needsAction: false }
  if (row.resolutionState === 'needs_action') return { resolutionState: 'unresolved', needsAction: true }
  if (row.resolutionState === 'resolved') {
    if (row.kind === 'location') return { resolutionState: 'imported', needsAction: false }
    if (row.generatedImage) return { resolutionState: 'generated', needsAction: false }
    return { resolutionState: 'imported', needsAction: false }
  }
  if (row.resolutionState === 'unresolved' && !row.generatedImage && !row.weightsKey) {
    return { resolutionState: 'unresolved', needsAction: true }
  }
  if (row.generatedImage && !CANONICAL_STATES.has(row.resolutionState)) {
    return { resolutionState: 'generated', needsAction: false }
  }
  return { resolutionState: CANONICAL_STATES.has(row.resolutionState) ? row.resolutionState : 'unresolved', needsAction: false }
}

export function clipReason(
  clip: { keyframeUrl: string | null; prompt: string; videoUrl: string | null },
  paused: boolean,
): { failed: string; retry: boolean } {
  if (clip.videoUrl) return { failed: '', retry: false }
  const recoverable = Boolean(clip.keyframeUrl) || Boolean(clip.prompt?.trim())
  if (!recoverable) {
    return { failed: 'No video and nothing to resubmit. The clip was kept.', retry: false }
  }
  if (paused) {
    return {
      failed: 'Recoverable, but generation is paused, so it was not resubmitted. The clip was kept.',
      retry: true,
    }
  }
  return { failed: 'Recoverable. Waiting for a bounded retry. The clip was kept.', retry: true }
}
