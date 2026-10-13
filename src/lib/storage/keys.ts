/** Object key stored on a media row, or a known prefix inside a URL. Never invent a key from an id. */
export function objectKeyFromStored(value: string | null | undefined): string | null {
  const bare = value?.trim().split('?')[0]
  if (!bare) return null
  if (/^(renders|videos|clips|uploads|media)\//.test(bare)) return bare
  const match = bare.match(/(?:^|\/)((?:renders|videos|clips|uploads|media)\/[^?#]+)$/)
  return match?.[1] ?? null
}

/** Legacy render location. New uploads do not use this. Old objects still resolve through it. */
export function renderVideoKey(userId: string, jobId: string): string {
  return `renders/${userId}/${jobId}.mp4`
}

export function clipVideoKey(projectId: string, clipId: string): string {
  return `clips/${projectId}/${clipId}.mp4`
}
