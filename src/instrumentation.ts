import { FAL_KEY_ENV, hasFalKey } from '@/lib/config/keys'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const CRITICAL = [
    'AUTH_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ]

  const OPTIONAL: Record<string, string[]> = {
    runway:     ['RUNWAY_API_KEY'],
    elevenlabs: ['ELEVENLABS_API_KEY', 'ELEVENLABS_DEFAULT_VOICE_ID'],
    suno:       ['SUNO_API_KEY'],
    location:   ['MAPILLARY_ACCESS_TOKEN', 'CESIUM_ION_ACCESS_TOKEN'],
    stock:      ['PEXELS_API_KEY'],
    payments:   ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLIC_KEY'],
    social:     ['TIKTOK_CLIENT_ID', 'INSTAGRAM_APP_ID', 'YOUTUBE_CLIENT_ID'],
    xai_video:  ['XAI_API_KEY'],
  }

  const missing = CRITICAL.filter(k => !process.env[k])
  if (!hasFalKey()) missing.push(FAL_KEY_ENV)
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

  const { installNodeCodeGuards } = await import('@/lib/diagnostics/codeGuards')
  installNodeCodeGuards('next.instrumentation')
}
