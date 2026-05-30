/**
 * Environment variable validation.
 * Called at startup via src/instrumentation.ts.
 * Throws if critical variables are missing.
 */

const CRITICAL = [
  'DATABASE_URL',
  'REDIS_URL',
  'AUTH_SECRET',
  'FAL_API_KEY',
  'ANTHROPIC_API_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
] as const

const OPTIONAL: Record<string, string[]> = {
  stripe:     ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_STRIPE_PUBLIC_KEY'],
  runway:     ['RUNWAY_API_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY', 'ELEVENLABS_DEFAULT_VOICE_ID'],
  suno:       ['SUNO_API_KEY'],
  location:   ['MAPILLARY_ACCESS_TOKEN', 'CESIUM_ION_TOKEN'],
  stock:      ['PEXELS_API_KEY'],
  xai:        ['XAI_API_KEY'],
  social:     ['TIKTOK_CLIENT_ID', 'INSTAGRAM_APP_ID', 'YOUTUBE_CLIENT_ID'],
  monitoring: ['SENTRY_DSN', 'POSTHOG_API_KEY'],
}

export function validateEnv(): void {
  const missing = CRITICAL.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `[CINEMA] Missing critical env vars — app cannot start:\n${missing.map(k => `  • ${k}`).join('\n')}`
    )
  }

  for (const [group, keys] of Object.entries(OPTIONAL)) {
    const missingOptional = keys.filter(k => !process.env[k])
    if (missingOptional.length > 0) {
      console.warn(`[CINEMA] ${group} features disabled — missing: ${missingOptional.join(', ')}`)
    }
  }

  console.log('[CINEMA] Environment validated ✓')
}

/** List of all required env var names for documentation */
export const REQUIRED_ENV_VARS = CRITICAL
