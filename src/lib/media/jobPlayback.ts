/** Same-origin playback — never point <video> at ephemeral fal.media URLs. */
export function jobPlaybackPath(jobId: string | undefined): string | null {
  if (!jobId || jobId.length < 20) return null
  return `/api/media/${jobId}`
}

export function jobDownloadPath(jobId: string | undefined): string | null {
  const base = jobPlaybackPath(jobId)
  return base ? `${base}?download=1` : null
}
