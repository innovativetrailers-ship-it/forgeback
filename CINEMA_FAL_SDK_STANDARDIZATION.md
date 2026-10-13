# CINEMATIC FORGE — FAL SDK STANDARDISATION (CONSOLIDATED FIX)
## Cursor Agent Prompt — V2 web + V3 desktop
### Convert all raw `fal.run` fetch calls → `fal.subscribe()` · Proper file uploads · Fix timeout bugs

---

## WHY THIS MATTERS

Raw `fetch('https://fal.run/{model}')` hits the **synchronous** endpoint which times out
after ~2-5 minutes. Video generation takes longer → silent failures. The SDK's
`fal.subscribe()` uses the **queue** endpoint (no timeout) and provides progress events.

This fix standardises every FAL call onto the SDK. **xAI Grok and Runway stay as direct
API calls** (they're not FAL).

---

## STEP 0 — DISCOVERY: FIND ALL RAW FAL CALLS

Run in BOTH repos:

```bash
# Find every raw fetch to fal.run (these are the bugs):
grep -rn "fal.run\|fal\.run\|https://fal" src/ --include="*.ts" --include="*.tsx"

# Find existing correct SDK usage (the pattern to match):
grep -rn "fal.subscribe\|fal.config\|@fal-ai/client" src/ --include="*.ts" --include="*.tsx"

# Confirm the SDK is installed:
grep "@fal-ai/client" package.json || echo "NEED TO INSTALL"
```

```bash
# Install if missing:
npm install @fal-ai/client
```

---

## STEP 1 — CREATE THE SHARED FAL CLIENT

One place to configure FAL, one helper everyone uses. This eliminates per-call auth
headers and guarantees the queue endpoint is always used.

### V2 web app — `src/lib/fal/client.ts`

```typescript
// src/lib/fal/client.ts
// Single source for all FAL calls — always uses the queue endpoint via subscribe

import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_API_KEY })

export interface FalProgressUpdate {
  status:  'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'
  position?: number
  message?:  string
}

/**
 * Run any FAL model through the QUEUE endpoint (no sync timeout).
 * Returns the data payload. Throws on FAL errors.
 */
export async function runFal<T = any>(
  modelId: string,
  input:   Record<string, unknown>,
  onProgress?: (update: FalProgressUpdate) => void,
  timeoutMs: number = 1_200_000,   // 20 min ceiling
): Promise<T> {
  const result = await fal.subscribe(modelId, {
    input,
    logs:    true,
    timeout: timeoutMs,
    onQueueUpdate: (update: any) => {
      if (update.status === 'IN_QUEUE') {
        onProgress?.({ status: 'IN_QUEUE', position: update.queue_position })
      } else if (update.status === 'IN_PROGRESS') {
        const msg = update.logs?.slice(-1)[0]?.message ?? 'Processing...'
        onProgress?.({ status: 'IN_PROGRESS', message: msg })
      } else if (update.status === 'COMPLETED') {
        onProgress?.({ status: 'COMPLETED' })
      }
    },
  })

  const data = result.data as any
  // FAL queue returns errors in the payload, not as thrown exceptions:
  if (data?.detail === 'Not Found' || data?.error) {
    throw new Error(`FAL error for ${modelId}: ${data.error ?? data.detail}`)
  }
  return data as T
}

/**
 * Upload an image/mask to FAL storage and get a URL.
 * Use this instead of stuffing base64 data URLs into the input payload —
 * large base64 strings bloat requests and sometimes fail.
 */
export async function uploadToFal(
  data: Blob | File | Buffer | string,   // string = base64 (with or without data: prefix)
): Promise<string> {
  let file: Blob
  if (typeof data === 'string') {
    const base64 = data.includes(',') ? data.split(',')[1] : data
    const mime   = data.startsWith('data:') ? data.split(';')[0].split(':')[1] : 'image/png'
    const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    file = new Blob([bytes], { type: mime })
  } else if (Buffer.isBuffer(data)) {
    file = new Blob([data])
  } else {
    file = data
  }
  return await fal.storage.upload(file)
}

// Common video output URL extractor (models return different shapes)
export function extractVideoUrl(data: any): string | undefined {
  return data?.video?.url ?? data?.video_url ?? data?.output?.video?.url ?? data?.url
}

export function extractImageUrl(data: any): string | undefined {
  return data?.images?.[0]?.url ?? data?.image?.url ?? data?.output?.image?.url ?? data?.url
}
```

### V3 desktop — `src/main/ai/falClient.ts`

```typescript
// src/main/ai/falClient.ts
// Same pattern, but reads key from keystore (not env) per V3 security model

import { fal } from '@fal-ai/client'
import { keystore } from '../keys/keychain'

let configured = false
function ensureConfigured() {
  if (!configured) {
    fal.config({ credentials: keystore.get('FAL_API_KEY') })
    configured = true
  }
}

export async function runFal<T = any>(
  modelId: string,
  input:   Record<string, unknown>,
  onProgress?: (pct: number, message: string) => void,
  timeoutMs: number = 1_200_000,
): Promise<T> {
  ensureConfigured()
  const result = await fal.subscribe(modelId, {
    input, logs: true, timeout: timeoutMs,
    onQueueUpdate: (u: any) => {
      if (u.status === 'IN_QUEUE')      onProgress?.(0,  `Queued (pos ${u.queue_position ?? '?'})`)
      else if (u.status === 'IN_PROGRESS') onProgress?.(50, u.logs?.slice(-1)[0]?.message ?? 'Processing')
      else if (u.status === 'COMPLETED')   onProgress?.(100, 'Complete')
    },
  })
  const data = result.data as any
  if (data?.detail === 'Not Found' || data?.error) {
    throw new Error(`FAL error for ${modelId}: ${data.error ?? data.detail}`)
  }
  return data as T
}

export async function uploadToFal(data: Buffer | Blob | string): Promise<string> {
  ensureConfigured()
  let file: Blob
  if (typeof data === 'string') {
    const base64 = data.includes(',') ? data.split(',')[1] : data
    const bytes  = Buffer.from(base64, 'base64')
    file = new Blob([bytes])
  } else if (Buffer.isBuffer(data)) {
    file = new Blob([data])
  } else { file = data }
  return await fal.storage.upload(file)
}

export function extractVideoUrl(d: any) { return d?.video?.url ?? d?.video_url ?? d?.url }
export function extractImageUrl(d: any) { return d?.images?.[0]?.url ?? d?.image?.url ?? d?.url }
```

---

## STEP 2 — CONVERT V2: storyboard.ts

**Edit** `src/lib/orchestration/storyboard.ts`:

```typescript
// ❌ BEFORE — raw fetch (sync endpoint, can time out):
const res = await fetch('https://fal.run/fal-ai/gemini-pro-image', {
  method: 'POST',
  headers: { Authorization: `Key ${process.env.FAL_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ input }),
}).then(r => r.json())
const rawUrl = res.images?.[0]?.url ?? res.image?.url

// ✅ AFTER — SDK queue endpoint + extractor:
import { runFal, extractImageUrl } from '@/lib/fal/client'

const data   = await runFal('fal-ai/gemini-pro-image', input)
const rawUrl = extractImageUrl(data)
```

---

## STEP 3 — CONVERT V2: aiTools.ts (interactive player)

**Edit** `src/lib/playback/aiTools.ts` — this is the biggest one. Every function uses raw fetch
AND passes giant base64 data URLs in the JSON. Fix both.

```typescript
// At top:
import { runFal, uploadToFal, extractImageUrl, extractVideoUrl } from '@/lib/fal/client'

// ── captureFrame now uploads to FAL storage instead of returning base64 ──
export async function captureFrameAndUpload(
  video: HTMLVideoElement,
  mask?: SelectionMask
): Promise<{ frameUrl: string; maskUrl?: string }> {
  const W = video.videoWidth, H = video.videoHeight
  const fc = document.createElement('canvas'); fc.width = W; fc.height = H
  fc.getContext('2d')!.drawImage(video, 0, 0, W, H)
  const frameBlob = await new Promise<Blob>(r => fc.toBlob(b => r(b!), 'image/jpeg', 0.95))
  const frameUrl  = await uploadToFal(frameBlob)

  let maskUrl: string | undefined
  if (mask) {
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H
    const mctx = mc.getContext('2d')!
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, W, H)
    mctx.fillStyle = '#fff'; mctx.beginPath()
    mask.points.forEach((p, i) => i === 0 ? mctx.moveTo(p.x*W, p.y*H) : mctx.lineTo(p.x*W, p.y*H))
    mctx.closePath(); mctx.fill()
    const maskBlob = await new Promise<Blob>(r => mc.toBlob(b => r(b!), 'image/png'))
    maskUrl = await uploadToFal(maskBlob)
  }
  return { frameUrl, maskUrl }
}

// ── removeObject — converted ──
export async function removeObject(video: HTMLVideoElement, mask: SelectionMask): Promise<string> {
  const { frameUrl, maskUrl } = await captureFrameAndUpload(video, mask)
  const data = await runFal('fal-ai/flux-pro/v1/fill', {
    image:  frameUrl,            // ← URL, not base64
    mask:   maskUrl,
    prompt: 'Clean background continuation, seamless fill, photorealistic',
    num_inference_steps: 28, guidance_scale: 60,
  })
  return extractImageUrl(data)!
}

// ── fillWithPrompt — converted ──
export async function fillWithPrompt(video: HTMLVideoElement, mask: SelectionMask, prompt: string): Promise<string> {
  const { frameUrl, maskUrl } = await captureFrameAndUpload(video, mask)
  const data = await runFal('fal-ai/flux-pro/v1/fill', {
    image: frameUrl, mask: maskUrl, prompt, num_inference_steps: 32, guidance_scale: 50,
  })
  return extractImageUrl(data)!
}

// ── correctDefects — converted ──
export async function correctDefects(video: HTMLVideoElement, mask?: SelectionMask): Promise<string> {
  const { frameUrl, maskUrl } = await captureFrameAndUpload(video, mask)
  if (maskUrl) {
    const data = await runFal('fal-ai/flux-pro/v1/fill', {
      image: frameUrl, mask: maskUrl,
      prompt: 'Fix visual artifacts, correct generation defects, clean and seamless',
      guidance_scale: 65,
    })
    return extractImageUrl(data)!
  }
  const data = await runFal('fal-ai/restore-image', { image: frameUrl })
  return extractImageUrl(data)!
}

// ── relightFrame — converted ──
export async function relightFrame(video: HTMLVideoElement, params: RelightParams, mask?: SelectionMask): Promise<string> {
  const { frameUrl } = await captureFrameAndUpload(video, mask)
  const dir = params.direction
  const dirPrompt  = dir.x > 0.3 ? 'light from right' : dir.x < -0.3 ? 'light from left'
    : dir.y < -0.3 ? 'light from above' : dir.y > 0.3 ? 'light from below' : 'soft ambient light'
  const tempPrompt = params.colorTemp < 4000 ? 'warm golden light'
    : params.colorTemp > 6000 ? 'cool blue daylight' : 'neutral white light'
  const data = await runFal('fal-ai/ic-light-m', {
    image: frameUrl,
    prompt: `${dirPrompt}, ${tempPrompt}, intensity ${params.intensity.toFixed(1)}, photorealistic`,
    num_images: 1, guidance_scale: 1.5, num_inference_steps: 28,
  })
  return extractImageUrl(data)!
}

// ── addGoreEffect — converted ──
export async function addGoreEffect(
  video: HTMLVideoElement, mask: SelectionMask, effectType: string,
  intensity: 'light' | 'medium' | 'heavy'
): Promise<string> {
  const { frameUrl, maskUrl } = await captureFrameAndUpload(video, mask)
  const data = await runFal('fal-ai/flux-pro/v1/fill', {
    image: frameUrl, mask: maskUrl,
    prompt: `Realistic ${effectType}, ${intensity} severity, photorealistic film makeup FX, seamlessly integrated, professional practical effects`,
    num_inference_steps: 35, guidance_scale: 55,
  })
  return extractImageUrl(data)!
}
```

---

## STEP 4 — CONVERT V2: schemaPayload.ts

**Edit** `src/lib/cognition/routing/schemaPayload.ts`:

```typescript
// The schema FETCH stays as a raw fetch (it's a GET to the schema endpoint, not generation).
// But document it clearly:

// Schema fetch — this is fine as raw fetch (fast GET, not a queue job):
async function getModelSchema(falModelId: string): Promise<any> {
  const cached = schemaCache.get(falModelId)
  if (cached && Date.now() - cached.fetchedAt < SCHEMA_TTL) return cached.schema
  try {
    // OK to use fetch here — schema endpoint is a fast metadata GET, not generation
    const res = await fetch(`https://fal.run/${falModelId}/schema`, {
      headers: { Authorization: `Key ${process.env.FAL_API_KEY}` },
    }).then(r => r.json())
    schemaCache.set(falModelId, { schema: res, fetchedAt: Date.now() })
    return res
  } catch { return null }
}

// buildPayload itself doesn't call FAL — it just shapes the input object.
// The actual generation using this payload goes through runFal() in the caller.
// No change needed to buildPayload — just confirm callers use runFal not raw fetch.
```

---

## STEP 5 — CONVERT V2: character ingestion

**Edit** the character ingestion file (from the V3 character pipeline, adapted for V2):

```typescript
import { runFal, uploadToFal, extractImageUrl } from '@/lib/fal/client'

// Photo-to-Cast: InstantID embedding extraction
export async function photoToCast(imagePaths: string[], onProgress) {
  // Upload the image to FAL storage first (if it's a local file/blob)
  const faceImageUrl = imagePaths[0].startsWith('http')
    ? imagePaths[0]
    : await uploadToFal(imagePaths[0])

  onProgress(10, 'Extracting facial identity…')
  const faceData = await runFal('fal-ai/instant-id', {
    face_image: faceImageUrl, mode: 'embedding_only',
  }, (u) => onProgress(20, u.message ?? 'Extracting…'))

  // ... rest converted similarly: each fal.run → runFal ...
}
```

---

## STEP 6 — CONVERT V2: stitching.ts (FFmpeg + RIFE)

**Edit** `src/lib/orchestration/stitching.ts`:

```typescript
import { runFal, extractVideoUrl } from '@/lib/fal/client'

// RIFE interpolation:
const trans = await runFal('fal-ai/rife-interpolation', {
  video_a: ordered[i].videoUrl,
  video_b: ordered[i + 1].videoUrl,
  frames: 4, mode: 'boundary',
}).catch(() => null)
if (trans) transitions[i] = extractVideoUrl(trans)

// FFmpeg concat:
const result = await runFal('fal-ai/ffmpeg', {
  command: 'concat', video_urls: concatList, output_format: 'mp4',
  resolution: '1080p', fps: 24,
})
const stitchedUrl = extractVideoUrl(result)
```

---

## STEP 7 — CONVERT V2: vendor progress (Suno + audio)

**Edit** `src/lib/engines/suno.ts` — Suno is direct API (not FAL), leave as-is BUT
any FAL-based audio (Stable Audio SFX) converts to runFal.

```typescript
// Suno = direct suno.com API → keep raw fetch (not FAL)
// ElevenLabs = direct API → keep raw fetch (not FAL)
// Stable Audio SFX (if via FAL) → convert to runFal:
import { runFal } from '@/lib/fal/client'
const data = await runFal('fal-ai/stable-audio', { prompt, seconds_total: duration })
```

---

## STEP 8 — CONVERT V3: src/main/ai and src/main/character

**Edit** all V3 main-process FAL calls to use `src/main/ai/falClient.ts`:

```bash
# Find them:
grep -rn "fal.run\|fetch.*fal" src/main/ --include="*.ts"
```

```typescript
// Pattern for each:
// ❌ Before:
const res = await fetch('https://fal.run/fal-ai/...', { headers: { Authorization: `Key ${key}` }, ... })

// ✅ After:
import { runFal, uploadToFal, extractVideoUrl } from './falClient'
const data = await runFal('fal-ai/...', input, (pct, msg) => updateProgress(jobId, pct, msg))
const url  = extractVideoUrl(data)
```

The V3 swarm (`src/main/ai/swarm.ts`) — confirm it already uses `fal.subscribe`.
If it uses raw fetch, convert it (this is the core generation path — highest priority).

---

## STEP 9 — WHAT STAYS AS RAW FETCH (do NOT convert)

These are NOT FAL — leave them as direct API calls:

| Service | Endpoint | Why |
|---|---|---|
| xAI Grok video | `api.x.ai/v1/videos` | Direct xAI API, not FAL |
| Runway Gen-4 | `@runwayml/sdk` | Runway's own SDK |
| ElevenLabs | `api.elevenlabs.io` | Direct ElevenLabs API |
| Suno | `suno.com` API | Direct Suno API |
| Anthropic Claude | `api.anthropic.com` | Direct Anthropic API |
| Voyage embeddings | `api.voyageai.com` | Direct Voyage API |
| FAL schema GET | `fal.run/{model}/schema` | Fast metadata GET, not a queue job |

---

## SUMMARY

| File | Repo | Action |
|---|---|---|
| `src/lib/fal/client.ts` | V2 | CREATE — shared runFal + uploadToFal |
| `src/main/ai/falClient.ts` | V3 | CREATE — keystore-based runFal |
| `src/lib/orchestration/storyboard.ts` | V2 | EDIT — runFal |
| `src/lib/playback/aiTools.ts` | V2 | EDIT — runFal + uploadToFal (all 6 functions) |
| `src/lib/orchestration/stitching.ts` | V2 | EDIT — runFal |
| `src/lib/cognition/routing/schemaPayload.ts` | V2 | EDIT — document schema fetch is OK |
| character ingestion | V2 | EDIT — runFal + uploadToFal |
| `src/lib/engines/*` audio | V2 | EDIT — FAL audio → runFal; keep Suno/11Labs direct |
| `src/main/ai/*`, `src/main/character/*` | V3 | EDIT — all FAL → runFal |
| `bridgedGeneration.ts` | V2 | AUDIT — confirm already fal.subscribe |

## VERIFICATION

```bash
# Both repos:
npx tsc --noEmit

# Confirm NO raw fal.run generation calls remain (schema GET is the only allowed one):
grep -rn "fal.run" src/ --include="*.ts" | grep -v "/schema"
# Expected: empty (or only the schema endpoint)

# Confirm SDK is used everywhere:
grep -rn "runFal\|fal.subscribe" src/ --include="*.ts" | wc -l
# Expected: many

# Functional test — generate a long video (was timing out before):
# Simple Mode → standard tier → 10s clip
# Should now use queue endpoint → no timeout → completes
# Watch for onQueueUpdate progress in the bar

# Interactive player test:
# Lasso → Remove Object → should upload frame+mask to FAL storage,
# call flux-pro/v1/fill via queue → return result without timeout
```

---

## THE KEY TAKEAWAY

Every FAL **generation** call (video, image, inpaint, relight, interpolation, FFmpeg)
now goes through the **queue endpoint** via `fal.subscribe()`. This:
- Eliminates the 2-5 minute sync timeout that was failing long video renders
- Provides progress events for the progress bar
- Uploads large images via `fal.storage.upload()` instead of bloating JSON with base64

The synchronous `fal.run/` endpoint is now only used for the schema metadata GET, which
is fast and appropriate for that case.
