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
