export interface ServiceEntry {
  name:     string
  category: 'video' | 'image' | 'audio' | 'llm' | 'storage' | 'payment'
  via:      'fal' | 'direct' | 'internal'
  envVar:   string
  endpoint: string
  enabled:  boolean
}

export const SERVICES: Record<string, ServiceEntry> = {
  // ─── Video — via FAL single key ───────────────────────────────────────────
  veo3: {
    name: 'Veo 3.1', category: 'video', via: 'fal',
    envVar: 'FAL_API_KEY', endpoint: 'fal.run/fal-ai/veo3',
    enabled: !!process.env.FAL_API_KEY,
  },
  kling: {
    name: 'Kling 3.0', category: 'video', via: 'fal',
    envVar: 'FAL_API_KEY', endpoint: 'fal.run/fal-ai/kling-video',
    enabled: !!process.env.FAL_API_KEY,
  },
  luma: {
    name: 'Luma Ray 3', category: 'video', via: 'fal',
    envVar: 'FAL_API_KEY', endpoint: 'fal.run/fal-ai/luma-dream-machine',
    enabled: !!process.env.FAL_API_KEY,
  },
  // ─── Video — direct xAI API ───────────────────────────────────────────────
  grokVideo: {
    name: 'Grok Imagine Video', category: 'video', via: 'direct',
    envVar: 'XAI_API_KEY', endpoint: 'api.x.ai/v1/videos/generations',
    enabled: !!process.env.XAI_API_KEY,
  },
  // ─── Video — direct Runway API ────────────────────────────────────────────
  runway: {
    name: 'Runway Gen-4', category: 'video', via: 'direct',
    envVar: 'RUNWAY_API_KEY', endpoint: 'api.runwayml.com/v1',
    enabled: !!process.env.RUNWAY_API_KEY,
  },
  // ─── Audio ────────────────────────────────────────────────────────────────
  elevenlabs: {
    name: 'ElevenLabs TTS', category: 'audio', via: 'direct',
    envVar: 'ELEVENLABS_API_KEY', endpoint: 'api.elevenlabs.io/v1',
    enabled: !!process.env.ELEVENLABS_API_KEY,
  },
  suno: {
    name: 'Suno Music', category: 'audio', via: 'direct',
    envVar: 'SUNO_API_KEY', endpoint: 'studio-api.suno.ai',
    enabled: !!process.env.SUNO_API_KEY,
  },
  // ─── Image ────────────────────────────────────────────────────────────────
  nanoBanana: {
    name: 'Nano Banana (Gemini Image)', category: 'image', via: 'fal',
    envVar: 'FAL_API_KEY', endpoint: 'fal.run/fal-ai/gemini-flash-image',
    enabled: !!process.env.FAL_API_KEY,
  },
  // ─── LLM ──────────────────────────────────────────────────────────────────
  anthropic: {
    name: 'Claude (Anthropic)', category: 'llm', via: 'direct',
    envVar: 'ANTHROPIC_API_KEY', endpoint: 'api.anthropic.com/v1',
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },
  // ─── Storage ──────────────────────────────────────────────────────────────
  r2: {
    name: 'Cloudflare R2', category: 'storage', via: 'direct',
    envVar: 'R2_ACCOUNT_ID', endpoint: 'r2.cloudflarestorage.com',
    enabled: !!process.env.R2_ACCOUNT_ID,
  },
  // ─── Payments ─────────────────────────────────────────────────────────────
  stripe: {
    name: 'Stripe', category: 'payment', via: 'direct',
    envVar: 'STRIPE_SECRET_KEY', endpoint: 'api.stripe.com/v1',
    enabled: !!process.env.STRIPE_SECRET_KEY,
  },
}

export function getEnabledServices(): ServiceEntry[] {
  return Object.values(SERVICES).filter(s => s.enabled)
}

export function isServiceEnabled(key: keyof typeof SERVICES): boolean {
  return SERVICES[key]?.enabled ?? false
}
