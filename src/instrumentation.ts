export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const CRITICAL = [
    'AUTH_SECRET', 'DATABASE_URL', 'REDIS_URL',
    'ANTHROPIC_API_KEY', 'FAL_API_KEY',
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
  ]

  const OPTIONAL: Record<string, string[]> = {
    elevenlabs:  ['ELEVENLABS_API_KEY', 'ELEVENLABS_DEFAULT_VOICE_ID'],
    nano_banana: ['GOOGLE_AI_API_KEY', 'NANO_BANANA_MODEL'],
    veo:         ['GOOGLE_PROJECT_ID', 'GOOGLE_VERTEX_LOCATION'],
    kling:       ['KLING_API_KEY', 'KLING_API_SECRET'],
    runway:      ['RUNWAY_API_KEY'],
    payments:    ['STRIPE_SECRET_KEY', 'PAYPAL_CLIENT_ID'],
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
