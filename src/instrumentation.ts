export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const CRITICAL = [
    'AUTH_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'FAL_API_KEY',        // single key covers all 20+ video/image models
    'ANTHROPIC_API_KEY',  // orchestration stays direct
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ]

  const OPTIONAL: Record<string, string[]> = {
    runway:     ['RUNWAY_API_KEY'],
    elevenlabs: ['ELEVENLABS_API_KEY'],
    suno:       ['SUNO_API_KEY'],
    payments:   ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLIC_KEY'],
    social:     ['TIKTOK_CLIENT_ID', 'INSTAGRAM_APP_ID', 'YOUTUBE_CLIENT_ID'],
    maps:       ['MAPILLARY_ACCESS_TOKEN', 'CESIUM_ION_ACCESS_TOKEN'],
    stock:      ['PEXELS_API_KEY'],
  }

  const missing = CRITICAL.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `[CINEMA] Missing critical env vars:\n${missing.map(k => `  • ${k}`).join('\n')}`
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
