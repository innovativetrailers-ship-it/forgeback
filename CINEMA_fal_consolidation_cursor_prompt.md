# CINEMATIC FORGE — FAL API CONSOLIDATION
## Cursor Agent Prompt
### Replace all individual video model keys with single FAL_API_KEY

---

## TASK SUMMARY

**IMPORTANT: NO MODELS ARE REMOVED.** Every model stays fully available. This task only
consolidates the *access method* — instead of separate API keys and SDKs for each model,
they all route through one FAL key. The models themselves remain registered and selectable.

Consolidate access for: Kling, Luma, Pika, Minimax, Seedance, SkyReels, LTX, PixVerse,
HunyuanVideo (all variants), CogVideoX, Wan, Veo 3, Nano Banana, and all LLMs via OpenRouter.
One FAL key replaces the individual KEYS — the models are kept, just accessed differently.

Do NOT touch: Anthropic, Runway, ElevenLabs, Suno — these remain direct (Runway and the
audio services are not on FAL; Anthropic stays direct for orchestration latency).

---

## STEP 1 — Update `src/lib/routing/engineRegistry.ts`

Add FAL model IDs for ALL models including Veo 3 and Nano Banana.
Replace the entire `FAL_MODEL_IDS` export with:

```typescript
export const FAL_MODEL_IDS: Record<string, string> = {
  // Video generation
  'veo-3.1':              'fal-ai/veo3',
  'kling-3.0':            'fal-ai/kling-video/v1.6/pro/text-to-video',
  'seedance-2.0':         'fal-ai/seedance-video-lite',
  'skyreels-v3':          'fal-ai/skyreels-v2-t2v',
  'luma-ray3':            'fal-ai/luma-dream-machine',
  'minimax-2.3':          'fal-ai/minimax-video',
  'cogvideox':            'fal-ai/cogvideox-5b',
  'wan-2.2':              'fal-ai/wan-t2v',
  'ltx-2.3':              'fal-ai/ltx-video-v0-9-7',
  'ltx-2.3-fast':         'fal-ai/ltx-video-v0-9-7',
  'pika-2.5':             'fal-ai/pika-v2-turbo',
  'pixverse-c1':          'fal-ai/pixverse/v4.5',
  'pixverse-v6':          'fal-ai/pixverse/v4',
  'hunyuan-video-1.5':    'fal-ai/hunyuan-video',
  'hunyuan-hy-motion':    'fal-ai/hunyuan-video',
  'hunyuan-world-mirror': 'fal-ai/hunyuan-video',
  'hunyuan-r-dmesh':      'fal-ai/hunyuan-video',

  // Image generation — all via FAL
  'nano-banana-2':        'fal-ai/gemini-flash-image',
  'nano-banana-pro':      'fal-ai/gemini-pro-image',
  'flux-pro':             'fal-ai/flux-pro',
  'flux-ultra':           'fal-ai/flux-pro/v1.1-ultra',

  // LLMs via OpenRouter on FAL
  'claude-sonnet':        'openrouter/anthropic/claude-sonnet-4-6',
  'claude-haiku':         'openrouter/anthropic/claude-haiku-4-5',
  'grok-3':               'openrouter/x-ai/grok-3',
  'groq-llama':           'openrouter/groq/llama-3.3-70b-versatile',
  'kimi-k2':              'openrouter/moonshotai/kimi-k2-0905',
  'qwen-max':             'openrouter/qwen/qwen3-7b-max',
}
```

---

## STEP 2 — Update `src/lib/routing/MediaRouter.ts`

### 2a — Remove Veo 3.1 special case block

Find and DELETE this entire block:

```typescript
// DELETE THIS ENTIRE BLOCK:
if (params.model === 'veo-3.1') {
  const { VertexAI } = await import('@google-cloud/vertexai')
  const vertex = new VertexAI({
    project:  process.env.GOOGLE_PROJECT_ID!,
    location: process.env.GOOGLE_VERTEX_LOCATION ?? 'us-central1',
  })
  const model  = vertex.preview.getGenerativeModel({ model: 'veo-3.1-generate-001' })
  const result = await (model as any).generateVideo({
    prompt:   params.prompt,
    duration: params.duration,
  })
  return { videoUrl: result.videoUrl, jobId: `veo_${Date.now()}` }
}
```

### 2b — Remove Nano Banana special case block

Find and DELETE this entire block:

```typescript
// DELETE THIS ENTIRE BLOCK:
if (params.model === 'nano-banana-2' || params.model === 'nano-banana-pro') {
  const { generateWithNanoBanana } = await import('../engines/nanoBanana')
  const result = await generateWithNanoBanana({
    prompt:             params.prompt,
    referenceImageUrl:  params.imageUrl,
    quality:            params.model === 'nano-banana-pro' ? 'pro' : 'standard',
    style:              'cinematic',
  })
  return { imageUrl: result.imageUrl, jobId: `nb_${Date.now()}` }
}
```

### 2c — Replace the entire callEngine function with this clean version

```typescript
export async function callEngine(params: {
  model:     string
  prompt:    string
  duration:  number
  imageUrl?: string
}): Promise<{ videoUrl?: string; imageUrl?: string; jobId: string }> {

  // Runway — only model NOT on FAL, stays direct
  if (params.model === 'runway-gen4') {
    const RunwayML = (await import('@runwayml/sdk')).default
    const client   = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY! })
    const task     = await client.imageToVideo.create({
      model:      'gen4_turbo',
      promptText: params.prompt,
      duration:   params.duration as 5 | 10,
      ...(params.imageUrl ? { promptImage: params.imageUrl } : {}),
    })
    return { jobId: task.id }
  }

  // Everything else — FAL
  const falModelId = FAL_MODEL_IDS[params.model]
  if (!falModelId) throw new Error(`Unknown model: ${params.model}`)

  const input: Record<string, unknown> = {
    prompt:       params.prompt,
    duration:     params.duration,
    aspect_ratio: '16:9',
    resolution:   '1080p',
  }

  if (params.imageUrl)                  input.image_url = params.imageUrl
  if (params.model === 'ltx-2.3-fast')  input.quality   = 'fast'

  const result = await fetch(`https://fal.run/${falModelId}`, {
    method:  'POST',
    headers: {
      Authorization:  `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  }).then(r => r.json())

  return {
    videoUrl: result.video?.url ?? result.video_url ?? result.image?.url,
    imageUrl: result.image?.url,
    jobId:    result.request_id ?? `fal_${Date.now()}`,
  }
}
```

---

## STEP 3 — Update `src/lib/engines/nanoBanana.ts`

Replace the entire file with the FAL version:

```typescript
// src/lib/engines/nanoBanana.ts
// Nano Banana now routes through FAL — no Google AI SDK needed

import { uploadToR2 } from '@/lib/storage/r2'

export interface NanoBananaParams {
  prompt:             string
  referenceImageUrl?: string
  style?:             'photorealistic' | 'cinematic' | 'illustrated' | 'stylised'
  quality?:           'standard' | 'pro'
}

export async function generateWithNanoBanana(
  params: NanoBananaParams
): Promise<{ imageUrl: string }> {
  const modelId = params.quality === 'pro'
    ? 'fal-ai/gemini-pro-image'
    : 'fal-ai/gemini-flash-image'

  const stylePrefix: Record<string, string> = {
    photorealistic: 'Professional photorealistic photograph: ',
    cinematic:      'Cinematic film still, shot on ARRI Alexa: ',
    illustrated:    'Detailed concept art illustration: ',
    stylised:       'Stylised artistic render: ',
  }

  const input: Record<string, unknown> = {
    prompt: `${stylePrefix[params.style ?? 'cinematic']}${params.prompt}`,
  }

  if (params.referenceImageUrl) {
    input.image_url = params.referenceImageUrl
  }

  const result = await fetch(`https://fal.run/${modelId}`, {
    method:  'POST',
    headers: {
      Authorization:  `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  }).then(r => r.json())

  const rawUrl = result.images?.[0]?.url ?? result.image?.url
  if (!rawUrl) throw new Error('Nano Banana: no image returned from FAL')

  // Upload to R2 for permanent storage
  const imageBuffer = await fetch(rawUrl).then(r => r.arrayBuffer())
  const imageUrl    = await uploadToR2(
    Buffer.from(imageBuffer),
    `generated/${Date.now()}.jpg`
  )

  return { imageUrl }
}
```

---

## STEP 4 — Remove unused direct-SDK engine files (models stay — only the redundant direct-access files go)

Delete these files — they are replaced by FAL routing:

```
DELETE: src/lib/engines/vertexAI.ts        (if exists)
DELETE: src/lib/engines/googleAI.ts        (if exists)
DELETE: src/lib/engines/klingDirect.ts     (if exists)
DELETE: src/lib/engines/lumaDirect.ts      (if exists)
```

Do NOT delete:
```
KEEP: src/lib/engines/elevenLabs.ts        (not on FAL)
KEEP: src/lib/engines/nanoBanana.ts        (updated above)
```

---

## STEP 5 — Remove unused packages

```bash
npm uninstall @google-cloud/vertexai @google/generative-ai
```

These are no longer needed since Veo 3 and Nano Banana now route through FAL.

Keep these:
```bash
# DO NOT uninstall:
# @runwayml/sdk     — Runway stays direct
# @anthropic-ai/sdk — orchestration stays direct
```

---

## STEP 6 — Update `.env.local` — remove redundant per-model keys (the models remain, accessed via FAL)

Remove these from `.env.local` and from Vercel environment variables:

```env
# DELETE THESE — replaced by FAL_API_KEY:
KLING_API_KEY=
KLING_API_SECRET=
SEEDANCE_API_KEY=
SKYREELS_API_KEY=
MINIMAX_API_KEY=
LUMA_API_KEY=
PIKA_API_KEY=
PIXVERSE_API_KEY=
COGVIDEOX_API_KEY=
HUNYUAN_API_KEY=
WAN_API_KEY=
GOOGLE_AI_API_KEY=
GOOGLE_PROJECT_ID=
GOOGLE_VERTEX_LOCATION=
GOOGLE_SERVICE_ACCOUNT_KEY=
NANO_BANANA_MODEL=
NANO_BANANA_PRO_MODEL=
REPLICATE_API_TOKEN=
```

---

## STEP 7 — Final `.env.local` (clean version to replace existing)

```env
# ── AI Generation (one key covers 15+ models) ─────────────────────────────
FAL_API_KEY=

# ── Orchestration — stays direct for low latency ──────────────────────────
ANTHROPIC_API_KEY=
ANTHROPIC_API_KEY_TECHNICAL=
ANTHROPIC_API_KEY_INTELLIGENCE=
ANTHROPIC_API_KEY_MARKETING=

# ── Direct services — not on FAL ──────────────────────────────────────────
RUNWAY_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_DEFAULT_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
SUNO_API_KEY=

# ── Free APIs ─────────────────────────────────────────────────────────────
MAPILLARY_ACCESS_TOKEN=
CESIUM_ION_ACCESS_TOKEN=
PEXELS_API_KEY=

# ── Auth ──────────────────────────────────────────────────────────────────
AUTH_SECRET=
NEXTAUTH_URL=https://forgecinema.vercel.app
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── Database ──────────────────────────────────────────────────────────────
DATABASE_URL=
DB_PRODUCT=
DB_TECHNICAL=
DB_INTELLIGENCE=
DB_MARKETING=

# ── Cache ─────────────────────────────────────────────────────────────────
REDIS_URL=
REDIS_PRODUCT=
REDIS_TECHNICAL=
REDIS_INTELLIGENCE=
REDIS_MARKETING=

# ── Storage ───────────────────────────────────────────────────────────────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=cinematic-forge
R2_PUBLIC_URL=

# ── Payments ──────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_YEARLY_PRICE_ID=
STRIPE_STUDIO_MONTHLY_PRICE_ID=
STRIPE_STUDIO_YEARLY_PRICE_ID=
STRIPE_ULTIMATE_MONTHLY_PRICE_ID=
STRIPE_ULTIMATE_YEARLY_PRICE_ID=
STRIPE_CREDITS_100_PRICE_ID=
STRIPE_CREDITS_500_PRICE_ID=
STRIPE_CREDITS_2000_PRICE_ID=
STRIPE_CREDITS_10000_PRICE_ID=

# ── App ───────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://forgecinema.vercel.app
NODE_ENV=production
```

---

## STEP 8 — Update `src/instrumentation.ts`

Replace the `CRITICAL` and `OPTIONAL` var lists to match new simplified structure:

```typescript
const CRITICAL = [
  'AUTH_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'FAL_API_KEY',           // replaces all individual model keys
  'ANTHROPIC_API_KEY',     // direct orchestration
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
```

---

## STEP 9 — Also update Vercel environment variables

After making code changes, go to:
**Vercel → forgecinema → Settings → Environment Variables**

1. DELETE all the keys listed in Step 6
2. Confirm `FAL_API_KEY` is set for Production + Preview + Development
3. Redeploy

---

## VERIFICATION

```bash
# TypeScript must pass with no errors
npx tsc --noEmit

# Test FAL routing covers all models
curl -X POST http://localhost:3000/api/generate/estimate \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"prompt":"test","duration":5,"mode":"simple","tier":"cinematic"}'
# Expected: { totalCredits: 8, segments: [{ assignedModel: "luma-ray3" }] }

# Test Nano Banana via FAL
curl -X POST http://localhost:3000/api/generate/image \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"prompt":"neon Tokyo street","style":"cinematic","quality":"standard"}'
# Expected: { imageUrl: "https://..." }

# Confirm no references to removed env vars remain
grep -r "KLING_API_KEY\|GOOGLE_PROJECT_ID\|GOOGLE_AI_API_KEY\|VERTEX" src/ --include="*.ts"
# Expected: no results
```

---

## SUMMARY

| Before | After |
|---|---|
| 15+ individual model API keys | 1 FAL key |
| Vertex AI SDK for Veo 3 | FAL endpoint |
| Google AI SDK for Nano Banana | FAL endpoint |
| Multiple billing accounts | 1 FAL account |
| Complex error handling per vendor | Single FAL error handler |
| `npm install @google-cloud/vertexai @google/generative-ai` | Removed |
