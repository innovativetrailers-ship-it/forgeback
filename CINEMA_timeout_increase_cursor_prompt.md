# CINEMATIC FORGE — TIMEOUT CEILING INCREASE
## Cursor Agent Prompt
### Raise per-segment, queue, and poll timeouts · Diagnose & fix slow Wan generation

---

## CONTEXT

Wan is taking ~900s (15 min) to generate a 5s clip. Two problems:

1. **The timeout ceilings I set earlier are TOO LOW** and would kill a legitimate slow render:
   - `withTimeout` per segment: 180s → kills anything over 3 min
   - BullMQ `lockDuration`: 600s → a multi-segment job stalls/retries mid-render
   - Poll loops: cap out at 120-300s

2. **900s for Wan is itself abnormal** — Wan 2.2 should generate in 60-120s. This is likely
   FAL cold start, queue congestion, or a slow endpoint variant. Addressed in STEP 5.

This prompt raises every ceiling to comfortably handle slow models, then addresses the
root Wan slowness so you're not waiting 15 minutes unnecessarily.

---

## STEP 1 — MODEL-AWARE SEGMENT TIMEOUTS

A fixed timeout is wrong — drafts finish in 30s, premium/open-source models can take 20 min.
Make the timeout per-model.

**Edit** `src/lib/orchestration/bridgedGeneration.ts` — replace the fixed `withTimeout` cap:

```typescript
// Per-model generation timeout ceilings (milliseconds)
// Generous — these are HARD caps to prevent infinite hangs, not target times
const MODEL_TIMEOUT_MS: Record<string, number> = {
  'ltx-2.3-fast':       180_000,   //  3 min — fast draft model
  'wan-2.2':            1_200_000, // 20 min — open-source, can be slow on FAL
  'cogvideox':          1_200_000, // 20 min — open-source
  'ltx-2.3':            600_000,   // 10 min
  'pika-2.5':           600_000,   // 10 min
  'luma-ray3':          600_000,   // 10 min
  'minimax-2.3':        900_000,   // 15 min
  'hunyuan-video-1.5':  1_200_000, // 20 min — open-source, heavy
  'hunyuan-hy-motion':  1_200_000, // 20 min
  'seedance-2.0':       900_000,   // 15 min
  'skyreels-v3':        1_500_000, // 25 min — long-form generation
  'kling-3.0':          900_000,   // 15 min
  'pixverse-c1':        900_000,   // 15 min
  'pixverse-v6':        600_000,   // 10 min
  'veo-3.1':            900_000,   // 15 min
  'grok-imagine-video': 300_000,   //  5 min — fast model
  'runway-gen4':        900_000,   // 15 min
}

const DEFAULT_TIMEOUT_MS = 1_200_000  // 20 min fallback

function getModelTimeout(model: string): number {
  return MODEL_TIMEOUT_MS[model] ?? DEFAULT_TIMEOUT_MS
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ])
}
```

**Update the segment generation call** to use the per-model timeout:

```typescript
// Inside generateWithBridging, when generating each segment:
const timeoutMs = getModelTimeout(node.assignedModel)

videoUrl = (await withTimeout(
  callVideoModel({
    model:          node.assignedModel,
    prompt,
    duration:       node.shot.duration,
    imageUrl:       tailFrameUrl,
    patientZeroUrl: characterRef,
    onSubProgress:  /* ... */,
  }),
  timeoutMs,
  `Segment ${node.shot.shotIndex} (${node.assignedModel})`
)).videoUrl!
```

---

## STEP 2 — RAISE BULLMQ LOCK DURATION

A multi-segment film can run 30-60+ minutes total. BullMQ's `lockDuration` must exceed the
LONGEST possible job or the worker considers it stalled and retries mid-render.

**Edit** `src/workers/index.ts` — worker config:

```typescript
const orchestrationWorker = new Worker('render', handler, {
  connection,
  concurrency:     2,
  // Lock must exceed the longest possible full-film render.
  // 8 segments × 20 min max + overhead = generous 3 hour ceiling.
  lockDuration:    10_800_000,   // 3 hours (was 600_000 = 10 min)
  // Renew the lock periodically so long jobs keep their claim
  lockRenewTime:   300_000,      // renew every 5 min
  stalledInterval: 300_000,      // check for genuinely stalled jobs every 5 min
  maxStalledCount: 1,            // only retry a stalled job once (avoid double-charging renders)
})
```

> Why `maxStalledCount: 1`: a video render is expensive. If a job genuinely stalls, retry
> once — but don't loop retries that each cost credits and FAL compute.

---

## STEP 3 — RAISE POLL LOOP CEILINGS

The direct-vendor pollers cap out too early. Raise their iteration counts.

**Edit** `src/lib/orchestration/bridgedGeneration.ts`:

```typescript
// xAI Grok — raise from 60 (120s) to 300 iterations (600s = 10 min)
async function pollXAIVideo(requestId: string, onSubProgress?: SubProgressFn): Promise<string> {
  const MAX = 300   // was 60
  for (let i = 0; i < MAX; i++) {
    await new Promise(r => setTimeout(r, 2000))
    // ... existing poll logic ...
  }
  throw new Error('Grok Imagine timed out after 10 min')
}

// Runway — raise from 100 (300s) to 300 iterations (900s = 15 min)
async function pollRunwayJob(client: any, taskId: string, onSubProgress?: SubProgressFn): Promise<string> {
  const MAX = 300   // was 100
  for (let i = 0; i < MAX; i++) {
    await new Promise(r => setTimeout(r, 3000))
    // ... existing poll logic ...
  }
  throw new Error('Runway timed out after 15 min')
}
```

**For FAL `fal.subscribe`** — it polls internally with no caller-side cap, but set its timeout
explicitly so it matches the per-model ceiling:

```typescript
async function callFalModel(
  modelId: string,
  input: Record<string, unknown>,
  onSubProgress?: (pct: number, message: string) => void,
  timeoutMs: number = 1_200_000   // ← pass per-model timeout
): Promise<string> {
  const result = await fal.subscribe(modelId, {
    input,
    logs:    true,
    timeout: timeoutMs,   // ← FAL client respects this
    onQueueUpdate: (update) => { /* ... */ },
  })
  return (result.data as any).video?.url ?? (result.data as any).video_url
}
```

---

## STEP 4 — VERCEL STATUS ENDPOINT (unaffected, but confirm)

The render runs on Railway (no HTTP timeout) — Vercel limits don't apply to generation.
Only confirm the lightweight status endpoint has headroom:

**`vercel.json`:**

```json
{
  "functions": {
    "src/app/api/generate/route.ts":  { "maxDuration": 30 },
    "src/app/api/jobs/[id]/route.ts": { "maxDuration": 15 }
  }
}
```

These stay small because they return in milliseconds — the long work is never on Vercel.

---

## STEP 5 — DIAGNOSE & FIX SLOW WAN (the real issue)

900s for a 5s Wan clip is abnormal. Wan 2.2 should generate in 60-120s. Likely causes:

### 5a — Wrong/slow FAL endpoint
The endpoint `fal-ai/wan-t2v` may route to a slow shared queue. Check FAL for the current
fast Wan endpoint and update `engineRegistry.ts`:

```typescript
// In FAL_MODEL_IDS — verify these are the current fast endpoints:
'wan-2.2':       'fal-ai/wan/v2.2-a14b/text-to-video',     // current Wan 2.2 fast endpoint
'wan-2.2-turbo': 'fal-ai/wan/v2.2-a14b/text-to-video/turbo', // turbo variant if available
```

> Check fal.ai/models for the exact current Wan endpoint — they update model IDs. Search
> "wan" in the FAL model gallery and copy the endpoint with the lowest latency.

### 5b — Cold start / queue congestion
FAL shared endpoints queue behind all other users. The 900s may be mostly QUEUE time, not
inference. Confirm by logging the FAL status phases:

```typescript
// In callFalModel onQueueUpdate — log timing to distinguish queue vs inference:
let queueStart = Date.now()
onQueueUpdate: (update) => {
  if (update.status === 'IN_QUEUE') {
    console.log(`[wan] in queue ${Math.round((Date.now() - queueStart)/1000)}s, position ${(update as any).queue_position}`)
  } else if (update.status === 'IN_PROGRESS') {
    console.log(`[wan] inference started after ${Math.round((Date.now() - queueStart)/1000)}s queue`)
  }
}
```

If most of the 900s is `IN_QUEUE`, the fix is priority or a different endpoint, not a timeout.

### 5c — Set FAL request priority (your own traffic)
For your deployed app you control all traffic — submit at normal priority and let drafts go
low priority so user-facing renders jump the queue:

```typescript
const result = await fal.subscribe(modelId, {
  input,
  priority: node.shot.contentType === 'fast_draft' ? 'low' : 'normal',
  // ...
})
```

### 5d — Demote Wan in the routing matrix if consistently slow
If Wan stays slow on FAL, lower its routing priority so the orchestrator prefers faster
models for the same content type.

**Edit** `dagRouter.ts` `CONTENT_ROUTING` — move Wan to last resort:

```typescript
environment_travel:   ['luma-ray3', 'ltx-2.3', 'wan-2.2'],   // Wan demoted to fallback
fast_draft:           ['ltx-2.3-fast', 'wan-2.2'],            // LTX fast preferred for drafts
```

LTX 2.3 Fast (also 2cr/5s) generates in seconds and is a better budget default than a slow Wan.

---

## STEP 6 — SURFACE LONG WAITS TO THE USER

If a segment legitimately takes 15+ min, tell the user instead of leaving them guessing.

**Edit** `GenerationProgress.tsx` — show a notice for long-running segments:

```tsx
// When a segment has been generating > 5 min, show reassurance:
{job.status === 'PROCESSING' && (job.etaSeconds ?? 0) > 300 && (
  <p className="text-[10px] text-amber-400/70 mt-1">
    This is a complex render — larger clips can take several minutes.
    You can leave this page; we'll keep working and your result will be saved.
  </p>
)}
```

Because the job runs server-side on Railway and the result persists to the DB, **the user can
close the tab and come back** — the render continues. Make that explicit in the UI.

---

## SUMMARY

| Layer | Before | After |
|---|---|---|
| Per-segment timeout | 180s fixed | model-aware, up to 25 min (SkyReels) |
| Wan 2.2 timeout | 180s (killed it) | 20 min |
| BullMQ lock duration | 10 min | 3 hours + auto-renew every 5 min |
| xAI poll cap | 120s | 600s |
| Runway poll cap | 300s | 900s |
| FAL subscribe timeout | default | per-model explicit |
| Wan endpoint | possibly slow shared | verified fast endpoint + priority |
| Wan routing | preferred | demoted to fallback if slow |

| File | Action |
|---|---|
| `src/lib/orchestration/bridgedGeneration.ts` | EDIT — MODEL_TIMEOUT_MS, raise poll caps, FAL timeout, priority |
| `src/workers/index.ts` | EDIT — lockDuration 3h + lockRenewTime |
| `src/lib/routing/engineRegistry.ts` | EDIT — verify fast Wan endpoint |
| `src/lib/orchestration/dagRouter.ts` | EDIT — demote Wan in routing |
| `vercel.json` | CONFIRM — status endpoint headroom |
| `src/components/generation/GenerationProgress.tsx` | EDIT — long-wait reassurance + "you can leave" |

---

## VERIFICATION

```bash
npx tsc --noEmit

# Test Wan timing — log should show queue vs inference split
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" -H "x-user-id: test" \
  -d '{"prompt":"calm forest stream","duration":5,"mode":"simple","tier":"standard"}'

# Watch worker logs on Railway:
#   [wan] in queue 5s, position 3
#   [wan] inference started after 45s queue       ← if queue is the problem
#   [wan] complete after 110s                       ← healthy inference time
# If inference itself is 800s+, switch the endpoint (Step 5a).
# If queue is 800s+, it's congestion — use priority or a dedicated endpoint.
```

---

## RECOMMENDATION

The timeout increases ensure no legitimate render is killed. But **don't accept 900s as
normal** — for a 5s clip that's a broken endpoint or severe queue congestion. Start with
Step 5a (verify the Wan endpoint) and 5b (log queue vs inference). If Wan stays slow,
Step 5d demotes it — LTX 2.3 Fast gives the same 2cr/5s cost at a fraction of the time.
