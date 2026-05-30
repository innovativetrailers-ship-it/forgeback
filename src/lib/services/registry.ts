export interface ServiceConfig {
  name:        string
  category:    'video' | 'image' | 'audio' | 'llm' | 'location' | 'stock'
  access:      'fal' | 'direct' | 'fal-openrouter'
  envVar:      string
  engineFile?: string
  apiRoute?:   string
}

export const SERVICE_REGISTRY: Record<string, ServiceConfig> = {
  // ── Video — all via FAL ───────────────────────────────────────
  kling:      { name: 'Kling 3.0',     category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  luma:       { name: 'Luma Ray3',     category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  pika:       { name: 'Pika 2.5',      category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  minimax:    { name: 'Minimax 2.3',   category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  seedance:   { name: 'Seedance 2.0',  category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  skyreels:   { name: 'SkyReels V3',   category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  ltx:        { name: 'LTX 2.3',       category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  pixverse:   { name: 'PixVerse C1',   category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  hunyuan:    { name: 'HunyuanVideo',  category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },
  veo3:       { name: 'Veo 3.1',       category: 'video', access: 'fal',    envVar: 'FAL_API_KEY' },

  // ── Video — direct ────────────────────────────────────────────
  runway:     { name: 'Runway Gen-4',  category: 'video', access: 'direct', envVar: 'RUNWAY_API_KEY',
                engineFile: 'src/lib/routing/MediaRouter.ts',  apiRoute: 'src/app/api/generate/route.ts' },
  grokVideo:  { name: 'Grok Video',    category: 'video', access: 'direct', envVar: 'XAI_API_KEY',
                apiRoute: 'src/app/api/generate/route.ts' },

  // ── Image — via FAL ───────────────────────────────────────────
  nanoBanana: { name: 'Nano Banana 2', category: 'image', access: 'fal',    envVar: 'FAL_API_KEY',
                engineFile: 'src/lib/engines/nanoBanana.ts',   apiRoute: 'src/app/api/generate/image/route.ts' },

  // ── Audio — direct ────────────────────────────────────────────
  elevenlabs: { name: 'ElevenLabs',    category: 'audio', access: 'direct', envVar: 'ELEVENLABS_API_KEY',
                engineFile: 'src/lib/engines/elevenLabs.ts',   apiRoute: 'src/app/api/audio/synthesise/route.ts' },
  suno:       { name: 'Suno',          category: 'audio', access: 'direct', envVar: 'SUNO_API_KEY',
                engineFile: 'src/lib/engines/suno.ts',         apiRoute: 'src/app/api/audio/music/route.ts' },

  // ── LLM — Claude direct, others via FAL OpenRouter ───────────
  claude:     { name: 'Claude',        category: 'llm', access: 'direct',         envVar: 'ANTHROPIC_API_KEY',
                engineFile: 'src/lib/engines/llm.ts', apiRoute: 'src/app/api/llm/route.ts' },
  groq:       { name: 'Groq',          category: 'llm', access: 'fal-openrouter', envVar: 'FAL_API_KEY' },
  xai:        { name: 'xAI Grok',      category: 'llm', access: 'fal-openrouter', envVar: 'FAL_API_KEY' },
  kimi:       { name: 'Kimi K2',       category: 'llm', access: 'fal-openrouter', envVar: 'FAL_API_KEY' },

  // ── Location — direct (free tier) ────────────────────────────
  mapillary:  { name: 'Mapillary',     category: 'location', access: 'direct', envVar: 'MAPILLARY_ACCESS_TOKEN',
                engineFile: 'src/lib/engines/mapillary.ts',    apiRoute: 'src/app/api/location/imagery/route.ts' },
  cesium:     { name: 'Cesium',        category: 'location', access: 'direct', envVar: 'CESIUM_ION_TOKEN',
                engineFile: 'src/lib/engines/cesium.ts',       apiRoute: 'src/app/api/location/aerial-path/route.ts' },

  // ── Stock — direct (free tier) ────────────────────────────────
  pexels:     { name: 'Pexels',        category: 'stock', access: 'direct', envVar: 'PEXELS_API_KEY',
                engineFile: 'src/lib/engines/pexels.ts',       apiRoute: 'src/app/api/stock/route.ts' },
}

export function checkServiceHealth(): Record<string, boolean> {
  const health: Record<string, boolean> = {}
  for (const [key, config] of Object.entries(SERVICE_REGISTRY)) {
    health[key] = !!process.env[config.envVar]
  }
  return health
}

export function getEnabledServices(): Array<ServiceConfig & { key: string }> {
  return Object.entries(SERVICE_REGISTRY)
    .filter(([, config]) => !!process.env[config.envVar])
    .map(([key, config]) => ({ key, ...config }))
}

export function isServiceEnabled(key: string): boolean {
  const config = SERVICE_REGISTRY[key]
  return config ? !!process.env[config.envVar] : false
}
