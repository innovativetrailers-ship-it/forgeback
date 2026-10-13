# CINEMATIC FORGE — UNIFIED VENDOR PROGRESS
## Cursor Agent Prompt
### Wire Runway · xAI Grok · Suno · ElevenLabs polling into the same progress bar as FAL

---

## THE GAP

The progress bar reads `onQueueUpdate` from FAL. But these vendors poll differently and
currently report NO incremental progress:

| Vendor | How it reports | Progress wired? |
|---|---|---|
| FAL (14 models) | `fal.subscribe` → `onQueueUpdate` | ✅ done |
| Runway Gen-4 | `client.tasks.retrieve()` poll | ❌ silent |
| xAI Grok Imagine | `GET /v1/videos/{id}` poll | ❌ silent |
| Suno (music) | `GET /generate/{id}` poll | ❌ silent |
| ElevenLabs (voice) | mostly synchronous | ❌ silent |

When a segment routes to Runway or Grok, the bar freezes at the last FAL update until the
segment finishes. This fixes that — every vendor reports through one callback shape.

---

## STEP 1 — UNIFIED PROGRESS CALLBACK TYPE

**Add to** `src/lib/orchestration/types.ts`:

```typescript
// Unified sub-progress callback — every vendor poller calls this
export interface SubProgress {
  pct:      number      // 0-100 within this single segment
  message:  string      // human-readable status
  vendor:   string      // 'fal' | 'runway' | 'xai' | 'suno' | 'elevenlabs'
}

export type SubProgressFn = (p: SubProgress) => void
```

---

## STEP 2 — RUNWAY POLLER WITH PROGRESS

**Edit** `src/lib/orchestration/bridgedGeneration.ts` — update `pollRunwayJob`:

```typescript
async function pollRunwayJob(
  client:        any,
  taskId:        string,
  onSubProgress?: import('./types').SubProgressFn
): Promise<string> {
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const task = await client.tasks.retrieve(taskId)

    // Runway returns a `progress` float 0-1 during RUNNING
    if (task.status === 'RUNNING') {
      const pct = Math.round((task.progress ?? 0.5) * 100)
      onSubProgress?.({ pct, message: `Runway rendering ${pct}%`, vendor: 'runway' })
    } else if (task.status === 'PENDING') {
      onSubProgress?.({ pct: 0, message: 'Runway queued', vendor: 'runway' })
    } else if (task.status === 'SUCCEEDED') {
      onSubProgress?.({ pct: 100, message: 'Runway complete', vendor: 'runway' })
      return task.output?.[0]
    } else if (task.status === 'FAILED') {
      throw new Error(`Runway failed: ${task.failure ?? 'unknown'}`)
    }
  }
  throw new Error('Runway timed out')
}
```

---

## STEP 3 — xAI GROK POLLER WITH PROGRESS

**Edit** `src/lib/orchestration/bridgedGeneration.ts` — update `pollXAIVideo`:

```typescript
async function pollXAIVideo(
  requestId:     string,
  onSubProgress?: import('./types').SubProgressFn
): Promise<string> {
  const MAX = 60
  for (let i = 0; i < MAX; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    }).then(r => r.json())

    if (res.status === 'pending') {
      // xAI gives no granular %, so estimate from elapsed polls
      const pct = Math.min(90, Math.round((i / MAX) * 100))
      onSubProgress?.({ pct, message: `Grok Imagine generating ${pct}%`, vendor: 'xai' })
    } else if (res.status === 'done') {
      onSubProgress?.({ pct: 100, message: 'Grok Imagine complete', vendor: 'xai' })
      return res.video?.url
    } else if (res.status === 'failed') {
      throw new Error(`Grok Imagine failed: ${res.error}`)
    }
  }
  throw new Error('Grok Imagine timed out')
}
```

---

## STEP 4 — THREAD onSubProgress THROUGH callVideoModel

**Edit** `callVideoModel` in `bridgedGeneration.ts` so it passes the callback to every vendor:

```typescript
async function callVideoModel(params: {
  model:          string
  prompt:         string
  duration:       number
  imageUrl?:      string
  patientZeroUrl?: string
  onSubProgress?: import('./types').SubProgressFn   // ← add this
}): Promise<{ videoUrl?: string; imageUrl?: string; jobId: string }> {

  // Grok Imagine — direct xAI
  if (params.model === 'grok-imagine-video') {
    const res = await fetch('https://api.x.ai/v1/videos/generations', {
      method:  'POST',
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'grok-imagine-video', prompt: params.prompt,
        duration: Math.min(params.duration, 15), aspect_ratio: '16:9',
        ...(params.imageUrl ? { image_url: params.imageUrl } : {}),
      }),
    }).then(r => r.json())
    const videoUrl = await pollXAIVideo(res.request_id, params.onSubProgress)
    return { videoUrl, jobId: res.request_id }
  }

  // Runway — direct SDK
  if (params.model === 'runway-gen4') {
    const RunwayML = (await import('@runwayml/sdk')).default
    const client   = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY! })
    const task     = await client.imageToVideo.create({
      model: 'gen4_turbo', promptText: params.prompt, duration: params.duration as 5 | 10,
      ...(params.imageUrl ? { promptImage: params.imageUrl } : {}),
    })
    const videoUrl = await pollRunwayJob(client, task.id, params.onSubProgress)
    return { videoUrl, jobId: task.id }
  }

  // FAL — subscribe with onQueueUpdate (already wired)
  const useI2V  = !!params.imageUrl
  const modelId = useI2V
    ? (I2V_MODEL_IDS[params.model] ?? T2V_MODEL_IDS[params.model])
    : T2V_MODEL_IDS[params.model]
  if (!modelId) throw new Error(`Unknown model: ${params.model}`)

  const input: Record<string, unknown> = {
    prompt: params.prompt, duration: params.duration,
    aspect_ratio: '16:9', resolution: '1080p',
  }
  if (useI2V)                input.image_url           = params.imageUrl
  if (params.patientZeroUrl) input.reference_image_url = params.patientZeroUrl

  const videoUrl = await callFalModel(modelId, input, (pct, message) =>
    params.onSubProgress?.({ pct, message, vendor: 'fal' })
  )
  return { videoUrl, jobId: `fal_${Date.now()}` }
}
```

---

## STEP 5 — STANDALONE AUDIO SERVICES (Suno + ElevenLabs)

These run from their own routes (not the orchestration pipeline), so they need their own
job + progress wiring identical to the video flow.

### 5a — Suno music with progress

**Edit** `src/lib/engines/suno.ts` — add a polling helper with progress:

```typescript
// src/lib/engines/suno.ts

export async function generateMusicWithProgress(
  params: SunoParams,
  onProgress?: (pct: number, message: string) => void
): Promise<{ audioUrl: string; jobId: string }> {
  // Submit
  const submit = await fetch(`${SUNO_BASE}/generate`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt, style: params.style ?? 'cinematic',
      duration: params.durationSec ?? 60, make_instrumental: params.instrumental ?? false,
    }),
  }).then(r => r.json())

  const jobId = submit.id
  onProgress?.(5, 'Suno composing...')

  // Poll until complete
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const status = await fetch(`${SUNO_BASE}/generate/${jobId}`, {
      headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` },
    }).then(r => r.json())

    if (status.status === 'streaming' || status.status === 'processing') {
      const pct = Math.min(90, 5 + Math.round((i / 60) * 85))
      onProgress?.(pct, 'Suno composing music...')
    } else if (status.status === 'complete') {
      onProgress?.(100, 'Music complete')
      return { audioUrl: status.audio_url, jobId }
    } else if (status.status === 'error') {
      throw new Error(`Suno failed: ${status.error}`)
    }
  }
  throw new Error('Suno timed out')
}
```

**Edit** `src/app/api/audio/music/route.ts` to queue + report progress like video:

```typescript
// Music is now a queued job too (can take 1-2 min), with progress
import { db }          from '@/lib/db'
import { checkAccess, deductUserCredits } from '@/lib/access/guard'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  const { prompt, style, durationSec, instrumental } = await req.json()

  const cost = Math.ceil((durationSec ?? 60) / 30) * 5
  const access = await checkAccess(userId, cost)
  if (!access.allowed) return Response.json({ error: access.reason }, { status: (access as any).code })

  const job = await db.renderJob.create({
    data: { userId: userId!, status: 'QUEUED', mode: 'music', prompt, progress: 0,
            statusMessage: 'Queued', metadata: { style, durationSec, instrumental } },
  })

  const { renderQueue } = await import('@/lib/queue')
  await renderQueue.add('music', { jobId: job.id, userId, prompt, style, durationSec, instrumental })
  await deductUserCredits(userId!, cost, `Music: ${prompt?.slice(0, 40)}`, 'suno', cost * 0.05)

  return Response.json({ jobId: job.id, queued: true })
}
```

**Add music worker** to `src/workers/index.ts`:

```typescript
import { generateMusicWithProgress } from '@/lib/engines/suno'
import { uploadToR2 }                from '@/lib/storage/r2'

const musicWorker = new Worker('render', async (job) => {
  if (job.name !== 'music') return
  const { jobId, userId, prompt, style, durationSec, instrumental } = job.data

  await db.renderJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', progress: 5 } })
  const startTime = Date.now()

  try {
    const result = await generateMusicWithProgress(
      { prompt, style, durationSec, instrumental },
      async (pct, message) => {
        const elapsed = (Date.now() - startTime) / 1000
        const eta = pct > 5 ? Math.round((elapsed / pct) * (100 - pct)) : null
        await db.renderJob.update({
          where: { id: jobId }, data: { progress: pct, statusMessage: message, etaSeconds: eta },
        }).catch(() => {})
      }
    )
    const buf   = await fetch(result.audioUrl).then(r => r.arrayBuffer())
    const r2Url = await uploadToR2(Buffer.from(buf), `music/${userId}/${Date.now()}.mp3`)

    await db.renderJob.update({
      where: { id: jobId },
      data:  { status: 'COMPLETED', progress: 100, etaSeconds: 0, outputUrl: r2Url },
    })
  } catch (err: any) {
    await db.renderJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: err.message } })
  }
}, { connection, concurrency: 3 })
```

### 5b — ElevenLabs voice (fast — inline progress)

ElevenLabs TTS is usually 2-5s, so it doesn't need a queue. But for long scripts, report
indeterminate progress. **Edit** `src/app/api/audio/synthesise/route.ts`:

```typescript
// ElevenLabs returns the full audio in one response — no polling needed.
// For UI consistency, the frontend shows an indeterminate spinner for voice,
// or for very long text, chunk it and report per-chunk progress:

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  const { text, voiceId } = await req.json()

  const access = await checkAccess(userId, Math.ceil(text.length / 1000))
  if (!access.allowed) return Response.json({ error: access.reason }, { status: (access as any).code })

  // For long scripts: split into sentences, synthesise sequentially, report progress
  if (text.length > 2500) {
    const job = await db.renderJob.create({
      data: { userId: userId!, status: 'QUEUED', mode: 'voice', prompt: text.slice(0, 100), progress: 0 },
    })
    const { renderQueue } = await import('@/lib/queue')
    await renderQueue.add('voice', { jobId: job.id, userId, text, voiceId })
    return Response.json({ jobId: job.id, queued: true })
  }

  // Short text — synchronous, returns immediately
  const audio = await synthesiseSpeech({ text, voiceId })
  return Response.json({ audioUrl: audio.url })
}
```

---

## STEP 6 — PROGRESS BAR HANDLES ALL JOB MODES

**Edit** `src/components/generation/GenerationProgress.tsx` — add vendor-aware labels:

```tsx
const MODE_LABELS: Record<string, string> = {
  director: 'Generating film',
  simple:   'Generating video',
  music:    'Composing music',
  voice:    'Synthesising voice',
}

const VENDOR_LABELS: Record<string, string> = {
  fal:        'AI engine',
  runway:     'Runway',
  xai:        'Grok Imagine',
  suno:       'Suno',
  elevenlabs: 'ElevenLabs',
}

// The statusMessage from the worker already includes the vendor context
// (e.g. "Runway rendering 45%", "Grok Imagine generating 60%", "Suno composing music...")
// so the bar shows which engine is actively working per segment.
```

The worker already writes `statusMessage` from each vendor's `onSubProgress`, so the bar
naturally shows "Shot 3/8: Runway rendering 45%" — the user sees exactly which engine is
working and its real progress, regardless of vendor.

---

## STEP 7 — COMBINE SEGMENT PROGRESS INTO OVERALL %

In `generateWithBridging`, blend per-segment sub-progress into the overall film progress so
the bar moves smoothly even within a single long segment:

```typescript
// In generateWithBridging, when calling callVideoModel:
videoUrl = (await callVideoModel({
  model: node.assignedModel, prompt, duration: node.shot.duration,
  imageUrl: tailFrameUrl, patientZeroUrl: characterRef,
  onSubProgress: (sub) => {
    // Overall = (completed shots + current shot fraction) / total shots
    const shotsBefore   = node.shot.shotIndex
    const currentFrac   = sub.pct / 100
    const overallShotPct = ((shotsBefore + currentFrac) / dag.length) * 100
    // Map into the 40-88 generation band of the whole pipeline
    const bandPct = 40 + Math.round((overallShotPct / 100) * 48)
    onProgress({
      shotIndex:   node.shot.shotIndex,
      totalShots:  dag.length,
      status:      'generating',
      subProgress: sub.pct,
      subMessage:  `Shot ${node.shot.shotIndex + 1}/${dag.length}: ${sub.message}`,
      overallPct:  bandPct,
    })
  },
})).videoUrl!
```

This makes the bar advance smoothly inside each segment — a 90-second Runway render shows
0→100% for that shot instead of freezing, while the overall film % climbs proportionally.

---

## SUMMARY — EVERY VENDOR NOW REPORTS PROGRESS

```
Segment routed to FAL      → onQueueUpdate    → "AI engine generating 50%"
Segment routed to Runway   → task.progress    → "Runway rendering 45%"
Segment routed to Grok     → poll estimate    → "Grok Imagine generating 60%"
Standalone music (Suno)    → poll estimate    → "Suno composing music..."
Standalone voice (11Labs)  → chunk progress   → "Synthesising voice 3/5"

All write to renderJob.statusMessage + progress + etaSeconds
   ↓
Frontend polls /api/jobs/[id] every 2s
   ↓
Progress bar shows: current shot · active vendor · live % · ETA
```

| File | Action |
|---|---|
| `src/lib/orchestration/types.ts` | EDIT — add SubProgress type |
| `src/lib/orchestration/bridgedGeneration.ts` | EDIT — Runway + xAI pollers report progress; thread callback |
| `src/lib/engines/suno.ts` | EDIT — generateMusicWithProgress |
| `src/app/api/audio/music/route.ts` | EDIT — queue + progress |
| `src/app/api/audio/synthesise/route.ts` | EDIT — queue long scripts |
| `src/workers/index.ts` | EDIT — music worker + voice worker |
| `src/components/generation/GenerationProgress.tsx` | EDIT — vendor-aware labels |

---

## VERIFICATION

```bash
npx tsc --noEmit

# Director job mixing FAL + Runway + Grok — bar should never freeze
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" -H "x-user-id: test" \
  -d '{"prompt":"action scene with camera control then aerial","duration":20,"mode":"director","selectedModels":["runway-gen4","grok-imagine-video","luma-ray3"]}'

# Poll — should show vendor-specific messages as each segment switches engine:
watch -n 2 'curl -s http://localhost:3000/api/jobs/[jobId] -H "x-user-id: test" | grep statusMessage'
# Expected progression:
#   "Shot 1/3: Runway rendering 30%"
#   "Shot 1/3: Runway rendering 80%"
#   "Shot 2/3: Grok Imagine generating 50%"
#   "Shot 3/3: AI engine generating 50%"   (Luma via FAL)
#   "Assembling final film..."

# Music job — Suno progress
curl -X POST http://localhost:3000/api/audio/music \
  -H "Content-Type: application/json" -H "x-user-id: test" \
  -d '{"prompt":"epic orchestral score","durationSec":90}'
# Poll → "Suno composing music..." climbing 5→90→100%
```
