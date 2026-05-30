# CINEMATIC FORGE — ADD GROK IMAGINE VIDEO
## Cursor Agent Prompt
### Add grok-imagine-video as a direct xAI integration (NOT via FAL)

---

## WHAT IS GROK IMAGINE VIDEO

- **Model**: `grok-imagine-video` by xAI
- **Engine**: Aurora autoregressive engine (110,000 NVIDIA GB200 GPUs)
- **Capabilities**: text-to-video + image-to-video, native synchronized audio, 6–15 seconds, 720p 24fps
- **Speed**: ~30 seconds generation — significantly faster than most competitors
- **Cost**: $0.05 per second → 5s clip = $0.25 → charge user 20cr/5s
- **API**: Direct xAI API — `POST https://api.x.ai/v1/videos/generations`
- **NOT on FAL**: fal.ai benchmarks confirm Grok Imagine is measured via xAI API directly, not FAL
- **ENV var**: `XAI_API_KEY` (same account as xAI Grok text LLM)

---

## FIX 1 — Add to `src/lib/routing/engineRegistry.ts`

### Add to `MODEL_COSTS`:
```typescript
'grok-imagine-video': 20,  // $0.05/s API cost, 20cr/5s to user covers margin
```

### Add to `MODEL_SPECIALTIES`:
```typescript
'grok-imagine-video': {
  costTier:   'mid',
  strengths:  [
    'native_audio',          // synchronized audio generated with video
    'speed',                 // ~30s generation — fastest in class
    'photorealism',          // top leaderboard quality
    'text_to_video',
    'image_to_video',
    'creative_style',
    'short_clips',           // optimised for 6-15s
  ],
  weaknesses: ['max_15s', 'not_on_fal'],
  bestFor:    'Fast photorealistic clips with native audio, 6–15s, competitive quality',
},
```

### Add note to `FAL_MODEL_IDS` — grok-imagine-video is NOT in this map:
```typescript
// grok-imagine-video intentionally excluded — uses XAI_API_KEY directly
// All other models above use FAL_API_KEY
```

---

## FIX 2 — Add direct xAI handler to `src/lib/routing/MediaRouter.ts`

Inside the `callEngine` function, add this block **before** the FAL fallback:

```typescript
// Grok Imagine Video — direct xAI API (NOT on FAL)
if (params.model === 'grok-imagine-video') {
  const res = await fetch('https://api.x.ai/v1/videos/generations', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:        'grok-imagine-video',
      prompt:       params.prompt,
      duration:     Math.min(params.duration, 15),  // max 15s
      aspect_ratio: '16:9',
      resolution:   '720p',
      ...(params.imageUrl ? { image_url: params.imageUrl } : {}),
    }),
  })

  if (!res.ok) throw new Error(`Grok Imagine: ${await res.text()}`)
  const data = await res.json()
  const requestId = data.request_id

  // Poll until complete (typically ~30s)
  const videoUrl = await pollXAIVideo(requestId)
  return { videoUrl, jobId: requestId }
}
```

### Add the polling helper function to `MediaRouter.ts`:

```typescript
async function pollXAIVideo(
  requestId: string,
  maxAttempts = 60
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000))  // poll every 2s

    const res = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    })
    const data = await res.json()

    if (data.status === 'done') return data.video?.url
    if (data.status === 'failed') throw new Error(`Grok Imagine failed: ${data.error}`)
    // status === 'pending' — keep polling
  }
  throw new Error('Grok Imagine: timed out after 120s')
}
```

---

## FIX 3 — Add to `src/lib/credits.ts` OPERATION_COSTS

```typescript
// Add to OPERATION_COSTS:
'grok-imagine-video': 20,   // 20cr per 5s — $0.05/s × 5 = $0.25 cost, 20cr = $1.00 to user
```

---

## FIX 4 — Add to `src/lib/services/registry.ts`

```typescript
// Add to SERVICES:
grokVideo: {
  name:     'Grok Imagine Video',
  category: 'video',
  via:      'direct',           // NOT via FAL
  envVar:   'XAI_API_KEY',
  endpoint: 'api.x.ai/v1/videos/generations',
  enabled:  !!process.env.XAI_API_KEY,
},
```

---

## FIX 5 — Add ENV var

### `.env.local`:
```env
# xAI — covers Grok text LLM (via FAL) + Grok Imagine Video (direct)
XAI_API_KEY=                # console.x.ai → API Keys
```

### Also add to Vercel Environment Variables:
```
XAI_API_KEY=xai-xxxxx
```

---

## FIX 6 — Update `src/instrumentation.ts` OPTIONAL vars

```typescript
// Update optional services map:
const OPTIONAL: Record<string, string[]> = {
  // ... existing entries ...
  xai_video: ['XAI_API_KEY'],   // add this line
}
```

---

## ACCOUNT REGISTRATION

- Go to: **console.x.ai**
- Sign up / log in
- Settings → API Keys → Create key
- Billing → Add debit card
- Copy key → `XAI_API_KEY`

Note: This same `XAI_API_KEY` is used for:
- `grok-imagine-video` (direct, this integration)
- `x-ai/grok-3` text LLM (via FAL's OpenRouter — same key, different routing)

---

## SPECIALTIES vs OTHER MODELS

| Use case | Best model |
|---|---|
| Fastest generation needed | `grok-imagine-video` (~30s) |
| Native audio with video | `grok-imagine-video` or `veo-3.1` |
| Short 6-15s photorealistic | `grok-imagine-video` |
| Longer than 15s | `skyreels-v3` (infinite length) |
| Human locomotion | `kling-3.0` |
| CGI/VFX/particles | `pixverse-c1` |
| Camera control | `runway-gen4` |

---

## VERIFICATION

```bash
# TypeScript check
npx tsc --noEmit

# Test Grok Imagine Video
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{
    "prompt": "A glowing crystal rocket launching from Mars",
    "duration": 8,
    "selectedModels": ["grok-imagine-video"],
    "mode": "director"
  }'
# Expected: { queued: true, creditCost: 32, segments: [{ assignedModel: "grok-imagine-video" }] }

# Confirm health check includes grok video
curl http://localhost:3000/api/health/services -H "x-user-role: ADMIN"
# Expected: grokVideo: { configured: true, via: "direct" }
```

---

## SUMMARY

| File | Change |
|---|---|
| `src/lib/routing/engineRegistry.ts` | Add `grok-imagine-video` to MODEL_COSTS + MODEL_SPECIALTIES, note excluded from FAL_MODEL_IDS |
| `src/lib/routing/MediaRouter.ts` | Add direct xAI handler + `pollXAIVideo()` helper |
| `src/lib/credits.ts` | Add `grok-imagine-video: 20` to OPERATION_COSTS |
| `src/lib/services/registry.ts` | Add `grokVideo` service entry as `via: 'direct'` |
| `src/instrumentation.ts` | Add `XAI_API_KEY` to optional service validation |
| `.env.local` + Vercel | Add `XAI_API_KEY` |
