/** Provider CDN URLs that expire — never use as long-lived playback src. */
export function isEphemeralVideoUrl(url: string): boolean {
  return /(?:^https?:\/\/)?(?:[a-z0-9]+\.)?fal\.media|fal\.run|v3b\.fal|xai-video|\.x\.ai/i.test(url)
}
