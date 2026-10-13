/** Canonical fal.ai credential — use FAL_KEY on Vercel / Railway. */
export const FAL_KEY_ENV = 'FAL_KEY' as const

const LEGACY_FAL_KEY_ENV = 'FAL_API_KEY' as const

/** Returns the fal.ai API key (FAL_KEY preferred, FAL_API_KEY legacy fallback). */
export function getFalKey(): string {
  const key = process.env[FAL_KEY_ENV] ?? process.env[LEGACY_FAL_KEY_ENV]
  if (!key?.trim()) {
    throw new Error(`${FAL_KEY_ENV} is not configured`)
  }
  return key.trim()
}

export function hasFalKey(): boolean {
  return Boolean(
    process.env[FAL_KEY_ENV]?.trim() || process.env[LEGACY_FAL_KEY_ENV]?.trim(),
  )
}
