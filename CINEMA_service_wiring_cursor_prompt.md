# CINEMATIC FORGE — COMPLETE SERVICE WIRING
## Cursor Agent Prompt
### Wire every remaining service end-to-end — engine + route + credits + UI

---

## STATUS: WHAT'S ALREADY WIRED vs WHAT THIS DOC FIXES

| Service | Engine | Route | Status |
|---|---|---|---|
| FAL video models | ✅ | ✅ | Done (todays_fixes) |
| Anthropic orchestration | ✅ | ✅ | Done (MediaRouter) |
| ElevenLabs | ✅ | ✅ | Done (todays_fixes) |
| Nano Banana | ✅ | ✅ | Done (todays_fixes) |
| Runway | ✅ | ✅ | Done (todays_fixes) |
| **Suno** | ❌ | ❌ | **THIS DOC** |
| **Mapillary** | ❌ | ❌ | **THIS DOC** |
| **Cesium** | ❌ | ❌ | **THIS DOC** |
| **Pexels** | ❌ | ❌ | **THIS DOC** |
| **Groq / xAI / Kimi (LLMs)** | ❌ | ❌ | **THIS DOC** |

This document wires the 5 remaining service groups.

---

## FIX 1 — SUNO (music generation)

**Create** `src/lib/engines/suno.ts`:

```typescript
// src/lib/engines/suno.ts

const SUNO_BASE = 'https://api.suno.ai/v1'

export interface SunoParams {
  prompt:      string       // description of the music
  style?:      string       // 'cinematic' | 'ambient' | 'orchestral' | 'electronic'
  duration?:   number       // seconds (max 240)
  instrumental?: boolean     // no vocals
  title?:      string
}

export async function generateMusic(
  params: SunoParams
): Promise<{ audioUrl: string; jobId: string }> {
  const res = await fetch(`${SUNO_BASE}/generate`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.SUNO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt:        params.prompt,
      style:         params.style ?? 'cinematic',
      duration:      params.duration ?? 60,
      instrumental:  params.instrumental ?? true,
      title:         params.title ?? 'Cinematic Forge Track',
      model:         'v4',
    }),
  })

  if (!res.ok) throw new Error(`Suno generation failed: ${await res.text()}`)

  const data = await res.json()
  return {
    audioUrl: data.audio_url,
    jobId:    data.id ?? `suno_${Date.now()}`,
  }
}

export async function getMusicStatus(jobId: string): Promise<{
  status:   'pending' | 'complete' | 'failed'
  audioUrl?: string
}> {
  const res  = await fetch(`${SUNO_BASE}/clips/${jobId}`, {
    headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` },
  })
  const data = await res.json()
  return {
    status:   data.status === 'complete' ? 'complete' : data.status === 'error' ? 'failed' : 'pending',
    audioUrl: data.audio_url,
  }
}
```

**Create** `src/app/api/audio/music/route.ts`:

```typescript
// src/app/api/audio/music/route.ts

import { generateMusic }                  from '@/lib/engines/suno'
import { uploadToR2 }                     from '@/lib/storage/r2'
import { deductCredits, OPERATION_COSTS } from '@/lib/credits'
import { db }                             from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, style, duration, instrumental, title } = await req.json()

  // Cost: 5 credits per 30 seconds
  const cost = Math.ceil((duration ?? 60) / 30) * OPERATION_COSTS['suno_music_per_30s']
  await deductCredits(db, userId, cost, `Music: ${prompt?.slice(0, 40)}`, 'suno', cost * 0.05)

  const result   = await generateMusic({ prompt, style, duration, instrumental, title })
  // Mirror to R2 for permanence
  const buffer   = await fetch(result.audioUrl).then(r => r.arrayBuffer())
  const audioUrl = await uploadToR2(Buffer.from(buffer), `music/${userId}/${Date.now()}.mp3`)

  return Response.json({ audioUrl, cost })
}
```

---

## FIX 2 — MAPILLARY (street-level location imagery)

**Create** `src/lib/engines/mapillary.ts`:

```typescript
// src/lib/engines/mapillary.ts

const MAPILLARY_BASE = 'https://graph.mapillary.com'

export interface MapillarySearchParams {
  lat:     number
  lng:     number
  radius?: number   // metres, default 100
  limit?:  number
}

export async function searchLocationImagery(
  params: MapillarySearchParams
): Promise<Array<{
  id:        string
  thumbUrl:  string
  capturedAt: string
  lat:       number
  lng:       number
}>> {
  const token  = process.env.MAPILLARY_ACCESS_TOKEN!
  const radius = params.radius ?? 100

  // Bounding box around the point
  const delta  = radius / 111000  // rough metres → degrees
  const bbox   = [
    params.lng - delta, params.lat - delta,
    params.lng + delta, params.lat + delta,
  ].join(',')

  const url = `${MAPILLARY_BASE}/images?` +
    `access_token=${token}&` +
    `fields=id,thumb_2048_url,captured_at,geometry&` +
    `bbox=${bbox}&` +
    `limit=${params.limit ?? 10}`

  const res  = await fetch(url)
  const data = await res.json()

  return (data.data ?? []).map((img: any) => ({
    id:         img.id,
    thumbUrl:   img.thumb_2048_url,
    capturedAt: img.captured_at,
    lat:        img.geometry?.coordinates?.[1] ?? params.lat,
    lng:        img.geometry?.coordinates?.[0] ?? params.lng,
  }))
}
```

**Create** `src/app/api/location/imagery/route.ts`:

```typescript
// src/app/api/location/imagery/route.ts

import { searchLocationImagery } from '@/lib/engines/mapillary'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '0')
  const lng = parseFloat(searchParams.get('lng') ?? '0')
  const radius = parseInt(searchParams.get('radius') ?? '100')

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const images = await searchLocationImagery({ lat, lng, radius })
  return Response.json({ images })
}
```

---

## FIX 3 — CESIUM (3D geospatial / aerial paths)

**Create** `src/lib/engines/cesium.ts`:

```typescript
// src/lib/engines/cesium.ts

const CESIUM_BASE = 'https://api.cesium.com/v1'

export interface AerialPathParams {
  startLat:  number
  startLng:  number
  endLat:    number
  endLng:    number
  altitude?: number   // metres
}

// Returns terrain + 3D tileset assets for an aerial fly-through
export async function getAerialPathAssets(
  params: AerialPathParams
): Promise<{
  terrainAssetId:  number
  tilesetUrl:      string
  waypoints:       Array<{ lat: number; lng: number; alt: number }>
}> {
  const token = process.env.CESIUM_ION_ACCESS_TOKEN!

  // Cesium World Terrain asset ID is 1, Google Photorealistic 3D Tiles is 2275207
  const terrainAssetId = 1
  const tilesetAssetId = 2275207

  // Get tileset endpoint
  const res = await fetch(`${CESIUM_BASE}/assets/${tilesetAssetId}/endpoint`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()

  // Interpolate waypoints along the path
  const steps = 10
  const waypoints = Array.from({ length: steps + 1 }, (_, i) => ({
    lat: params.startLat + (params.endLat - params.startLat) * (i / steps),
    lng: params.startLng + (params.endLng - params.startLng) * (i / steps),
    alt: params.altitude ?? 300,
  }))

  return {
    terrainAssetId,
    tilesetUrl: data.url ?? '',
    waypoints,
  }
}
```

**Create** `src/app/api/location/aerial-path/route.ts`:

```typescript
// src/app/api/location/aerial-path/route.ts

import { getAerialPathAssets } from '@/lib/engines/cesium'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { startLat, startLng, endLat, endLng, altitude } = await req.json()

  const assets = await getAerialPathAssets({ startLat, startLng, endLat, endLng, altitude })
  return Response.json(assets)
}
```

---

## FIX 4 — PEXELS (stock photos + video)

**Create** `src/lib/engines/pexels.ts`:

```typescript
// src/lib/engines/pexels.ts

const PEXELS_BASE = 'https://api.pexels.com'

export interface StockSearchParams {
  query:   string
  type:    'photo' | 'video'
  page?:   number
  perPage?: number
}

export async function searchStock(
  params: StockSearchParams
): Promise<Array<{
  id:       string
  url:      string
  thumbUrl: string
  type:     'photo' | 'video'
  width:    number
  height:   number
  author:   string
}>> {
  const key = process.env.PEXELS_API_KEY!
  const endpoint = params.type === 'video'
    ? `${PEXELS_BASE}/videos/search`
    : `${PEXELS_BASE}/v1/search`

  const url = `${endpoint}?query=${encodeURIComponent(params.query)}&` +
    `page=${params.page ?? 1}&per_page=${params.perPage ?? 15}`

  const res  = await fetch(url, { headers: { Authorization: key } })
  const data = await res.json()

  if (params.type === 'video') {
    return (data.videos ?? []).map((v: any) => ({
      id:       String(v.id),
      url:      v.video_files?.[0]?.link ?? '',
      thumbUrl: v.image,
      type:     'video' as const,
      width:    v.width,
      height:   v.height,
      author:   v.user?.name ?? 'Pexels',
    }))
  }

  return (data.photos ?? []).map((p: any) => ({
    id:       String(p.id),
    url:      p.src?.original ?? '',
    thumbUrl: p.src?.medium ?? '',
    type:     'photo' as const,
    width:    p.width,
    height:   p.height,
    author:   p.photographer ?? 'Pexels',
  }))
}
```

**Create** `src/app/api/stock/route.ts`:

```typescript
// src/app/api/stock/route.ts

import { searchStock } from '@/lib/engines/pexels'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query') ?? ''
  const type  = (searchParams.get('type') ?? 'photo') as 'photo' | 'video'

  if (!query) return Response.json({ error: 'query required' }, { status: 400 })

  const results = await searchStock({ query, type })
  return Response.json({ results })  // stock is free — no credit deduction
}
```

---

## FIX 5 — UNIFIED LLM SERVICE (Groq, xAI, Kimi via FAL OpenRouter)

**Create** `src/lib/engines/llm.ts`:

```typescript
// src/lib/engines/llm.ts
// Unified LLM caller — Claude direct, everything else via FAL OpenRouter

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export type LLMModel =
  | 'claude-sonnet'    // direct Anthropic
  | 'claude-haiku'     // direct Anthropic
  | 'groq-llama'       // via FAL OpenRouter — fastest
  | 'xai-grok'         // via FAL OpenRouter
  | 'kimi-k2'          // via FAL OpenRouter — long context
  | 'qwen-max'         // via FAL OpenRouter

const OPENROUTER_IDS: Record<string, string> = {
  'groq-llama': 'groq/llama-3.3-70b-versatile',
  'xai-grok':   'x-ai/grok-3',
  'kimi-k2':    'moonshotai/kimi-k2-0905',
  'qwen-max':   'qwen/qwen3-7b-max',
}

export async function callLLM(params: {
  model:      LLMModel
  system?:    string
  messages:   Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}): Promise<{ content: string; model: string }> {

  // Claude — direct Anthropic SDK (low latency for orchestration)
  if (params.model === 'claude-sonnet' || params.model === 'claude-haiku') {
    const modelId = params.model === 'claude-sonnet'
      ? 'claude-sonnet-4-6'
      : 'claude-haiku-4-5'

    const response = await anthropic.messages.create({
      model:      modelId,
      max_tokens: params.maxTokens ?? 1024,
      system:     params.system,
      messages:   params.messages,
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')

    return { content: text, model: modelId }
  }

  // Groq / xAI / Kimi / Qwen — via FAL OpenRouter integration
  const openrouterModel = OPENROUTER_IDS[params.model]
  if (!openrouterModel) throw new Error(`Unknown LLM: ${params.model}`)

  const result = await fetch('https://fal.run/openrouter/router', {
    method:  'POST',
    headers: {
      Authorization:  `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        model:      openrouterModel,
        messages:   params.system
          ? [{ role: 'system', content: params.system }, ...params.messages]
          : params.messages,
        max_tokens: params.maxTokens ?? 1024,
      },
    }),
  }).then(r => r.json())

  return {
    content: result.output?.choices?.[0]?.message?.content ?? result.output ?? '',
    model:   openrouterModel,
  }
}

// Helper — pick the best LLM for a task
export function selectLLMForTask(task: 'orchestration' | 'fast' | 'reasoning' | 'long_context'): LLMModel {
  switch (task) {
    case 'orchestration': return 'claude-sonnet'  // router/segmentation
    case 'fast':          return 'groq-llama'     // quick classification
    case 'reasoning':     return 'xai-grok'       // complex reasoning
    case 'long_context':  return 'kimi-k2'        // long documents
    default:              return 'claude-sonnet'
  }
}
```

**Create** `src/app/api/llm/route.ts`:

```typescript
// src/app/api/llm/route.ts

import { callLLM, type LLMModel } from '@/lib/engines/llm'
import { deductCredits }          from '@/lib/credits'
import { db }                     from '@/lib/db'

// LLM credit costs (per 1000 tokens estimated)
const LLM_COSTS: Record<string, number> = {
  'claude-sonnet': 3,
  'claude-haiku':  1,
  'groq-llama':    1,
  'xai-grok':      2,
  'kimi-k2':       1,
  'qwen-max':      1,
}

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { model, system, messages, maxTokens } = await req.json()

  const cost = LLM_COSTS[model as string] ?? 2
  await deductCredits(db, userId, cost, `LLM: ${model}`)

  const result = await callLLM({ model: model as LLMModel, system, messages, maxTokens })
  return Response.json(result)
}
```

---

## FIX 6 — SERVICE REGISTRY (single source of truth — all 23 services)

**Create** `src/lib/services/registry.ts`:

```typescript
// src/lib/services/registry.ts
// Central registry — every external service and how it's accessed

export interface ServiceConfig {
  name:        string
  category:    'video' | 'image' | 'audio' | 'llm' | 'location' | 'stock'
  access:      'fal' | 'direct' | 'fal-openrouter'
  envVar:      string
  engineFile?: string
  apiRoute?:   string
}

export const SERVICE_REGISTRY: Record<string, ServiceConfig> = {
  // ── Video — all via FAL ──────────────────────────────────────
  kling:        { name: 'Kling 3.0',     category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  luma:         { name: 'Luma Ray3',     category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  pika:         { name: 'Pika 2.5',      category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  minimax:      { name: 'Minimax 2.3',   category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  seedance:     { name: 'Seedance 2.0',  category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  skyreels:     { name: 'SkyReels V3',   category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  ltx:          { name: 'LTX 2.3',       category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  pixverse:     { name: 'PixVerse C1',   category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  hunyuan:      { name: 'HunyuanVideo',  category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },
  veo3:         { name: 'Veo 3.1',       category: 'video', access: 'fal', envVar: 'FAL_API_KEY' },

  // ── Video — direct (camera control) ──────────────────────────
  runway:       { name: 'Runway Gen-4',  category: 'video', access: 'direct', envVar: 'RUNWAY_API_KEY',
                  engineFile: 'src/lib/routing/MediaRouter.ts', apiRoute: 'src/app/api/generate/route.ts' },

  // ── Image — via FAL ──────────────────────────────────────────
  nanoBanana:   { name: 'Nano Banana 2', category: 'image', access: 'fal', envVar: 'FAL_API_KEY',
                  engineFile: 'src/lib/engines/nanoBanana.ts', apiRoute: 'src/app/api/generate/image/route.ts' },

  // ── Audio — direct ───────────────────────────────────────────
  elevenlabs:   { name: 'ElevenLabs',    category: 'audio', access: 'direct', envVar: 'ELEVENLABS_API_KEY',
                  engineFile: 'src/lib/engines/elevenLabs.ts', apiRoute: 'src/app/api/audio/synthesise/route.ts' },
  suno:         { name: 'Suno',          category: 'audio', access: 'direct', envVar: 'SUNO_API_KEY',
                  engineFile: 'src/lib/engines/suno.ts', apiRoute: 'src/app/api/audio/music/route.ts' },

  // ── LLM — Claude direct, others via FAL OpenRouter ───────────
  claude:       { name: 'Claude',        category: 'llm', access: 'direct',        envVar: 'ANTHROPIC_API_KEY',
                  engineFile: 'src/lib/engines/llm.ts', apiRoute: 'src/app/api/llm/route.ts' },
  groq:         { name: 'Groq',          category: 'llm', access: 'fal-openrouter', envVar: 'FAL_API_KEY' },
  xai:          { name: 'xAI Grok',      category: 'llm', access: 'fal-openrouter', envVar: 'FAL_API_KEY' },
  kimi:         { name: 'Kimi K2',       category: 'llm', access: 'fal-openrouter', envVar: 'FAL_API_KEY' },

  // ── Location — direct (free) ─────────────────────────────────
  mapillary:    { name: 'Mapillary',     category: 'location', access: 'direct', envVar: 'MAPILLARY_ACCESS_TOKEN',
                  engineFile: 'src/lib/engines/mapillary.ts', apiRoute: 'src/app/api/location/imagery/route.ts' },
  cesium:       { name: 'Cesium',        category: 'location', access: 'direct', envVar: 'CESIUM_ION_ACCESS_TOKEN',
                  engineFile: 'src/lib/engines/cesium.ts', apiRoute: 'src/app/api/location/aerial-path/route.ts' },

  // ── Stock — direct (free) ────────────────────────────────────
  pexels:       { name: 'Pexels',        category: 'stock', access: 'direct', envVar: 'PEXELS_API_KEY',
                  engineFile: 'src/lib/engines/pexels.ts', apiRoute: 'src/app/api/stock/route.ts' },
}

// Health check — verify all configured services have their keys
export function checkServiceHealth(): Record<string, boolean> {
  const health: Record<string, boolean> = {}
  for (const [key, config] of Object.entries(SERVICE_REGISTRY)) {
    health[key] = !!process.env[config.envVar]
  }
  return health
}
```

**Create** `src/app/api/health/services/route.ts`:

```typescript
// src/app/api/health/services/route.ts
// Admin endpoint — verify all services are connected

import { checkServiceHealth, SERVICE_REGISTRY } from '@/lib/services/registry'

export async function GET(req: Request) {
  const role = req.headers.get('x-user-role')
  if (role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const health = checkServiceHealth()
  const report = Object.entries(SERVICE_REGISTRY).map(([key, config]) => ({
    service:   config.name,
    category:  config.category,
    access:    config.access,
    connected: health[key],
  }))

  const allConnected = Object.values(health).every(Boolean)

  return Response.json({
    allConnected,
    services:  report,
    summary: {
      total:     report.length,
      connected: report.filter(r => r.connected).length,
      missing:   report.filter(r => !r.connected).map(r => r.service),
    },
  })
}
```

---

## FIX 7 — ADD MISSING CREDIT COSTS

**Add to** `src/lib/credits.ts` `OPERATION_COSTS`:

```typescript
// Add these entries:
'suno_music_per_30s':       5,
'mapillary_search':         0,   // free
'cesium_aerial_path':       0,   // free
'pexels_stock':             0,   // free
'llm_claude_sonnet':        3,
'llm_claude_haiku':         1,
'llm_groq':                 1,
'llm_xai':                  2,
'llm_kimi':                 1,
```

---

## FIX 8 — UPDATE INSTRUMENTATION (verify all services at boot)

**Modify** `src/instrumentation.ts`:

```typescript
const OPTIONAL: Record<string, string[]> = {
  runway:     ['RUNWAY_API_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY', 'ELEVENLABS_DEFAULT_VOICE_ID'],
  suno:       ['SUNO_API_KEY'],
  location:   ['MAPILLARY_ACCESS_TOKEN', 'CESIUM_ION_ACCESS_TOKEN'],
  stock:      ['PEXELS_API_KEY'],
  payments:   ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLIC_KEY'],
}
```

---

## SUMMARY — FILES CREATED

| File | Service |
|---|---|
| `src/lib/engines/suno.ts` | Suno music |
| `src/app/api/audio/music/route.ts` | Suno route |
| `src/lib/engines/mapillary.ts` | Mapillary imagery |
| `src/app/api/location/imagery/route.ts` | Mapillary route |
| `src/lib/engines/cesium.ts` | Cesium aerial |
| `src/app/api/location/aerial-path/route.ts` | Cesium route |
| `src/lib/engines/pexels.ts` | Pexels stock |
| `src/app/api/stock/route.ts` | Pexels route |
| `src/lib/engines/llm.ts` | Groq/xAI/Kimi/Claude unified |
| `src/app/api/llm/route.ts` | LLM route |
| `src/lib/services/registry.ts` | Service registry |
| `src/app/api/health/services/route.ts` | Health check |

---

## VERIFICATION — confirm all 23 services connected

```bash
# TypeScript passes
npx tsc --noEmit

# Service health check (as admin)
curl http://localhost:3000/api/health/services \
  -H "x-user-role: ADMIN"
# Expected: { allConnected: true, summary: { total: 23, connected: 23, missing: [] } }

# Test each service group:

# Music (Suno)
curl -X POST http://localhost:3000/api/audio/music \
  -H "x-user-id: test" -H "Content-Type: application/json" \
  -d '{"prompt":"epic orchestral","duration":30}'

# Location imagery (Mapillary)
curl "http://localhost:3000/api/location/imagery?lat=-33.86&lng=151.21" \
  -H "x-user-id: test"

# Aerial path (Cesium)
curl -X POST http://localhost:3000/api/location/aerial-path \
  -H "x-user-id: test" -H "Content-Type: application/json" \
  -d '{"startLat":-33.86,"startLng":151.21,"endLat":-33.87,"endLng":151.22}'

# Stock (Pexels)
curl "http://localhost:3000/api/stock?query=ocean&type=video" \
  -H "x-user-id: test"

# LLM (Groq via FAL)
curl -X POST http://localhost:3000/api/llm \
  -H "x-user-id: test" -H "Content-Type: application/json" \
  -d '{"model":"groq-llama","messages":[{"role":"user","content":"hi"}]}'
```

---

## ALL 23 SERVICES — FINAL WIRING STATUS

```
VIA FAL (one key):
✅ Kling     ✅ Luma      ✅ Pika      ✅ Minimax
✅ Seedance  ✅ SkyReels  ✅ LTX       ✅ PixVerse
✅ Hunyuan   ✅ Veo 3     ✅ Nano Banana
✅ Groq      ✅ xAI       ✅ Kimi

DIRECT (own key):
✅ Anthropic (orchestration)  ✅ Runway (camera)
✅ ElevenLabs (voice)         ✅ Suno (music)

FREE (own key, no billing):
✅ Mapillary  ✅ Cesium  ✅ Pexels

All engine files + API routes + credit costs + health check wired.
```
