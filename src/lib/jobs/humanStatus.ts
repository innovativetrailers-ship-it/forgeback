export function looksLikeRawJob(text: string | null | undefined): boolean {
  const value = text?.trim() ?? ''
  if (!value || value.includes(' ')) return false
  return /^[A-Za-z0-9_-]{12,}$/.test(value)
}

export function humanStatusText(
  userMessage: string | null | undefined,
  fallback: string | null | undefined,
): string | undefined {
  const human = userMessage?.trim()
  if (human) return human
  const next = fallback?.trim()
  if (!next || looksLikeRawJob(next)) return undefined
  return next
}
