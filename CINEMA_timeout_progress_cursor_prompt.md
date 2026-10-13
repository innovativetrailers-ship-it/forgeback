# CINEMATIC FORGE — TIMEOUT SAFETY & LIVE PROGRESS
## Cursor Agent Prompt
### Avoid Vercel/Railway timeouts on long renders · Live progress bar with real ETA from FAL

---

## THE PROBLEM

| Limit | Value | Impact |
|---|---|---|
| Vercel Hobby function | 5s default, 300s max (Fluid Compute) | Generate route can timeout |
| Vercel Pro function | up to 800s (Fluid Compute) | Still not enough for 3-min films |
| Railway worker | no HTTP timeout | ✅ safe for long renders |
| A 60s film | 6-12 segments × 30-90s each = 5-15 min total | Way over any HTTP limit |

**The fix:** The Vercel route NEVER waits for rendering. It does a fast estimate, queues the
job, and returns in <2s. All heavy work happens on the Railway worker. The frontend polls a
lightweight status endpoint that reads progress the worker writes to the DB in real time.

```
[Vercel route]  fast estimate → queue → return jobId          (< 2 seconds)
[Railway worker] full pipeline, writes progress to DB         (minutes, no timeout)
[Vercel status] read DB row → return progress + ETA           (< 200ms, polled every 2s)
[Frontend]      progress bar polls status → shows % + ETA
```

---

## STEP 1 — VERCEL CONFIG (enable Fluid Compute + set durations)

**Create/edit** `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "src/app/api/generate/route.ts":      { "maxDuration": 30 },
    "src/app/api/jobs/[id]/route.ts":     { "maxDuration": 10 },
    "src/app/api/generate/estimate/route.ts": { "maxDuration": 15 }
  }
}
```

**Enable Fluid Compute:** Vercel → Project → Settings → Functions → toggle **Fluid Compute** ON.
This raises Hobby max to 300s and Pro to 800s, and only bills active compute (not idle wait).

---

## STEP 2 — FAST COST ESTIMATE (no Claude call in the hot path)

The route must return fast. Replace the slow `breakdownToShots()` estimate with a heuristic.
The REAL breakdown happens later in the worker.

**Create** `src/lib/orchestration/fastEstimate.ts`:

```typescript
// src/lib/orchestration/fastEstimate.ts
// Instant cost estimate — no API calls. Used by the Vercel route to avoid timeout.

import { MODEL_COSTS } from '@/lib/routing/engineRegistry'

/**
 * Estimate cost WITHOUT calling Claude.
 * Assumes the orchestrator will distribute duration across the selected pool,
 * weighted toward mid-cost models. Good enough for the pre-charge estimate;
 * the worker reconciles the exact cost after real breakdown.
 */
export function fastEstimateCost(
  selectedModels: string[],
  duration:       number
): number {
  if (selectedModels.length === 0) return Math.ceil((2 / 5) * duration)

  // Average rate across the pool (the orchestrator picks cheapest-fit per segment,
  // so real cost trends BELOW this average — safe to charge this then refund difference)
  const avgRate = selectedModels.reduce(
    (sum, m) => sum + (MODEL_COSTS[m] ?? 10), 0
  ) / selectedModels.length

  const videoCost = Math.ceil((avgRate / 5) * duration)
  const patientZeroCost = 10   // reference image generation buffer

  return videoCost + patientZeroCost
}

/**
 * Estimate render time in seconds — used for the initial ETA before real progress.
 * Based on observed FAL generation times per model tier.
 */
export function estimateRenderSeconds(
  selectedModels: string[],
  duration:       number
): number {
  // Rough: number of segments ≈ duration / 6s avg per shot
  const estimatedSegments = Math.max(1, Math.ceil(duration / 6))
  // Each segment averages ~45s to generate (premium models slower, drafts faster)
  const perSegment = 45
  // Patient Zero adds ~20s, stitching adds ~30s
  return (estimatedSegments * perSegment) + 20 + 30
}
```

---

## STEP 3 — UPDATE GENERATE ROUTE (fast path only)

**Edit** `src/app/api/generate/route.ts` — remove the slow breakdown, use fast estimate:

```typescript
// src/app/api/generate/route.ts

export const maxDuration = 30   // Fluid Compute — generous but we return in <2s anyway

import { fastEstimateCost, estimateRenderSeconds } from '@/lib/orchestration/fastEstimate'
import { calculateSimpleCost }            from '@/lib/credits'
import { checkAccess, deductUserCredits } from '@/lib/access/guard'
import { TIER_ENGINE_MAP }                from '@/lib/routing/engineRegistry'
import { db }                             from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  const {
    prompt,
    duration       = 10,
    selectedModels = [],
    mode           = 'simple',
    tier           = 'standard',
  } = await req.json()

  // FAST estimate — no Claude call, returns instantly
  const creditCost = mode === 'director' && selectedModels.length > 0
    ? fastEstimateCost(selectedModels, duration)
    : calculateSimpleCost(tier, duration)

  const access = await checkAccess(userId, creditCost)
  if (!access.allowed) {
    return Response.json({ error: access.reason }, { status: (access as any).code })
  }

  const renderSecondsEstimate = estimateRenderSeconds(selectedModels, duration)

  // Create job row with initial ETA
  const job = await db.renderJob.create({
    data: {
      userId:        userId!,
      status:        'QUEUED',
      prompt,
      duration,
      mode,
      progress:      0,
      statusMessage: 'Queued — waiting for an available worker',
      metadata:      { selectedModels, tier, estimatedSeconds: renderSecondsEstimate },
      etaSeconds:    renderSecondsEstimate,
    },
  })

  // Queue — this is the only thing the route waits for (milliseconds)
  let queued = false
  try {
    const { renderQueue } = await import('@/lib/queue')
    await renderQueue.add(
      mode === 'director' ? 'orchestrate' : 'render-simple',
      { jobId: job.id, userId: userId!, prompt, duration, selectedModels, tier,
        engine: TIER_ENGINE_MAP[tier] ?? 'ltx-2.3-fast' },
      { attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
    )
    queued = true
  } catch (err: any) {
    await db.renderJob.update({
      where: { id: job.id },
      data:  { status: 'FAILED', error: 'Queue unavailable — check REDIS_URL' },
    })
    return Response.json({ error: 'Render queue unavailable. Try again shortly.' }, { status: 503 })
  }

  // Deduct AFTER successful queue (admin = no-op)
  await deductUserCredits(userId!, creditCost, `${mode}: ${prompt.slice(0, 40)}`, 'fal')

  // Returns in well under 2 seconds — no timeout risk
  return Response.json({
    jobId:            job.id,
    queued,
    estimatedCredits: creditCost,
    etaSeconds:       renderSecondsEstimate,
  })
}
```

---

## STEP 4 — WORKER WRITES GRANULAR PROGRESS + RECONCILES COST

The worker uses FAL's `subscribe` with `onQueueUpdate` to get real-time per-segment progress,
and updates the DB so the frontend can read it. It also reconciles the real cost vs the estimate.

**Edit** `src/lib/orchestration/bridgedGeneration.ts` — replace the `callVideoModel` FAL path to use `fal.subscribe` for live progress:

```typescript
// At top of bridgedGeneration.ts:
import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_API_KEY })

// Replace the FAL fetch call inside callVideoModel with subscribe + progress:
async function callFalModel(
  modelId:   string,
  input:     Record<string, unknown>,
  onSubProgress?: (pct: number, message: string) => void
): Promise<string> {
  const result = await fal.subscribe(modelId, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_QUEUE') {
        onSubProgress?.(0, `Queued (position ${(update as any).queue_position ?? '?'})`)
      } else if (update.status === 'IN_PROGRESS') {
        // FAL logs give incremental progress messages
        const lastLog = (update as any).logs?.slice(-1)[0]?.message ?? 'Generating...'
        onSubProgress?.(50, lastLog)
      }
    },
  })

  return (result.data as any).video?.url
       ?? (result.data as any).video_url
       ?? (result.data as any).images?.[0]?.url
}
```

**Edit** `generateWithBridging` to report per-segment progress with sub-progress:

```typescript
// Update the onProgress signature to carry richer data:
export async function generateWithBridging(
  dag:         DAGNode[],
  assets:      PatientZeroAssets,
  onProgress:  (data: {
    shotIndex:    number
    totalShots:   number
    status:       string
    subProgress?: number
    subMessage?:  string
  }) => void
): Promise<GeneratedSegment[]> {

  const results: GeneratedSegment[] = []
  const shotMemoryCache: string[]   = []
  const startTime = Date.now()

  for (const node of dag) {
    const shotStart = Date.now()
    onProgress({
      shotIndex:  node.shot.shotIndex,
      totalShots: dag.length,
      status:     'generating',
    })

    // ... existing tail-frame + prompt logic ...

    // Generate with live sub-progress from FAL
    let videoUrl: string
    videoUrl = await callFalModel(
      /* modelId */ resolveModelId(node.assignedModel, !!tailFrameUrl),
      /* input */   buildInput(node, prompt, tailFrameUrl, characterRef),
      (pct, msg) => onProgress({
        shotIndex:   node.shot.shotIndex,
        totalShots:  dag.length,
        status:      'generating',
        subProgress: pct,
        subMessage:  msg,
      })
    )

    // ... existing keyframe cache + segment push ...
  }

  return results
}
```

---

## STEP 5 — WORKER REPORTS PROGRESS + ETA TO DB

**Edit** `src/workers/index.ts` — compute and write ETA as each phase/segment completes:

```typescript
// src/workers/index.ts

const orchestrationWorker = new Worker('render', async (job) => {
  if (job.name !== 'orchestrate') return

  const { jobId, userId, prompt, duration, selectedModels } = job.data
  const jobStartTime = Date.now()

  await db.renderJob.update({
    where: { id: jobId },
    data:  { status: 'PROCESSING', progress: 2, statusMessage: 'Starting...' },
  })

  try {
    const result = await orchestrateGeneration({
      prompt,
      totalDuration: duration,
      selectedModels,
      userId,
      onProgress: async (phase, detail, pct) => {
        // Compute ETA from elapsed time and progress percentage
        const elapsedSec = (Date.now() - jobStartTime) / 1000
        const etaSeconds = pct > 5
          ? Math.max(0, Math.round((elapsedSec / pct) * (100 - pct)))
          : null

        await db.renderJob.update({
          where: { id: jobId },
          data: {
            progress:      pct,
            statusMessage: detail,
            phase,
            etaSeconds,
          },
        }).catch(() => {})   // never let a progress write crash the job
      },
    })

    // Reconcile cost: refund the difference between estimate and actual
    const job_ = await db.renderJob.findUnique({ where: { id: jobId } })
    const estimatedCredits = (job_?.metadata as any)?.estimatedCredits ?? result.totalCredits
    const refund = estimatedCredits - result.totalCredits
    if (refund > 0) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
      if (user?.role !== 'ADMIN') {
        await db.user.update({
          where: { id: userId },
          data:  { creditBalance: { increment: refund } },
        })
        await db.creditTransaction.create({
          data: { userId, amount: refund, description: 'Orchestration cost reconciliation refund', balanceAfter: 0 },
        })
      }
    }

    await db.renderJob.update({
      where: { id: jobId },
      data: {
        status:        'COMPLETED',
        progress:      100,
        etaSeconds:    0,
        statusMessage: 'Complete',
        outputUrl:     result.finalVideoUrl,
        metadata: {
          segments:       result.segments,
          modelBreakdown: result.modelBreakdown,
          qualityScores:  result.qualityScores,
          actualCredits:  result.totalCredits,
        },
      },
    })
  } catch (err: any) {
    console.error('[orchestration] failed:', err.message)
    await db.renderJob.update({
      where: { id: jobId },
      data:  { status: 'FAILED', error: err.message, statusMessage: 'Generation failed' },
    })
  }
}, { connection, concurrency: 2 })
```

---

## STEP 6 — PRISMA FIELDS FOR PROGRESS

**Edit** `prisma/schema.prisma` — add progress/ETA fields to RenderJob:

```prisma
model RenderJob {
  id            String   @id @default(cuid())
  userId        String
  status        String   @default("QUEUED")
  prompt        String?
  duration      Int      @default(10)
  mode          String   @default("simple")
  progress      Int      @default(0)       // 0-100
  phase         String?                    // patient_zero | breakdown | routing | generating | stitching
  statusMessage String?                    // human-readable current step
  etaSeconds    Int?                       // estimated seconds remaining
  outputUrl     String?
  error         String?
  metadata      Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([status])
}
```

```bash
npx prisma migrate dev --name render_job_progress_eta
npx prisma generate
```

---

## STEP 7 — FAST STATUS ENDPOINT (polled by frontend)

**Create/replace** `src/app/api/jobs/[id]/route.ts`:

```typescript
// src/app/api/jobs/[id]/route.ts
export const maxDuration = 10

import { db } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const job = await db.renderJob.findFirst({
    where:  { id: params.id, userId },
    select: {
      id: true, status: true, progress: true, phase: true,
      statusMessage: true, etaSeconds: true, outputUrl: true, error: true,
    },
  })

  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 })

  return Response.json(job)
}
```

---

## STEP 8 — PROGRESS BAR COMPONENT (frontend, with live ETA)

**Create** `src/components/generation/GenerationProgress.tsx`:

```tsx
// src/components/generation/GenerationProgress.tsx

'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

const PHASE_LABELS: Record<string, string> = {
  patient_zero: 'Creating character references',
  breakdown:    'Planning shots',
  routing:      'Assigning models',
  generating:   'Generating video',
  quality_gate: 'Checking quality',
  stitching:    'Assembling final film',
  complete:     'Complete',
}

function formatEta(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return ''
  if (seconds < 60) return `~${seconds}s remaining`
  const mins = Math.ceil(seconds / 60)
  return `~${mins} min remaining`
}

export function GenerationProgress({ jobId, onComplete }: {
  jobId:      string
  onComplete?: (outputUrl: string) => void
}) {
  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn:  () => fetch(`/api/jobs/${jobId}`, { credentials: 'include' }).then(r => r.json()),
    // Poll every 2s while running; stop when done
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return (status === 'COMPLETED' || status === 'FAILED') ? false : 2000
    },
  })

  if (!job) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Starting...
      </div>
    )
  }

  // Fire onComplete once when done
  if (job.status === 'COMPLETED' && job.outputUrl) {
    onComplete?.(job.outputUrl)
  }

  if (job.status === 'FAILED') {
    return (
      <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
        <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-red-400 font-medium">Generation failed</p>
          <p className="text-xs text-red-400/70 mt-0.5">{job.error ?? 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  if (job.status === 'COMPLETED') {
    return (
      <div className="flex items-center gap-2 text-sm text-[#00e5c8]">
        <CheckCircle2 className="w-4 h-4" /> Complete
      </div>
    )
  }

  // In progress
  const pct       = job.progress ?? 0
  const phase     = PHASE_LABELS[job.phase ?? ''] ?? job.statusMessage ?? 'Processing'
  const etaText   = formatEta(job.etaSeconds)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-[#00e5c8] animate-spin" />
          <span className="text-xs text-white/80">{phase}</span>
        </div>
        <span className="text-[10px] text-gray-500 tabular-nums">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#00e5c8] to-[#00b8a0] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status message + ETA */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600 truncate max-w-[70%]">
          {job.statusMessage}
        </span>
        {etaText && <span className="text-[10px] text-gray-500">{etaText}</span>}
      </div>
    </div>
  )
}
```

---

## STEP 9 — WIRE PROGRESS INTO THE RESULTS CARD

In the Simple/Director mode results area, render `GenerationProgress` while a job runs:

```tsx
import { GenerationProgress } from '@/components/generation/GenerationProgress'

// After calling /api/generate and getting { jobId }:
const [activeJobId, setActiveJobId] = useState<string | null>(null)

const handleGenerate = async () => {
  const res  = await fetch('/api/generate', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ prompt, duration, mode, tier, selectedModels }),
  })
  const data = await res.json()
  if (data.jobId) setActiveJobId(data.jobId)
}

// In the result card JSX:
{activeJobId && (
  <GenerationProgress
    jobId={activeJobId}
    onComplete={(url) => {
      addClipToTimeline(url)
      setActiveJobId(null)
    }}
  />
)}
```

---

## STEP 10 — WORKER CONCURRENCY & STALL PROTECTION

Long jobs need stall protection so a hung FAL call doesn't block forever.

**Edit** worker config in `src/workers/index.ts`:

```typescript
const orchestrationWorker = new Worker('render', handler, {
  connection,
  concurrency:       2,        // process 2 films at once
  stalledInterval:   30_000,   // check for stalled jobs every 30s
  maxStalledCount:   2,        // retry a stalled job up to 2x
  lockDuration:      600_000,  // 10 min lock — long enough for big renders
})
```

Also add a per-segment hard timeout inside `bridgedGeneration.ts` so one stuck model
doesn't hang the whole film:

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ])
}

// Wrap each segment generation:
videoUrl = await withTimeout(
  callFalModel(modelId, input, onSubProgress),
  180_000,   // 3 min hard cap per segment — then retry/fallback
  `Segment ${node.shot.shotIndex}`
)
```

---

## ARCHITECTURE SUMMARY

```
┌──────────────┐   POST /api/generate (< 2s)      ┌─────────────┐
│   Browser    │ ───────────────────────────────> │ Vercel route│
│              │ <─── { jobId, etaSeconds } ────── │  (fast)     │
│              │                                   └──────┬──────┘
│              │                                          │ queue
│              │                                   ┌──────▼──────┐
│ progress bar │   GET /api/jobs/[id] every 2s     │   BullMQ    │
│  polls ──────┼──────────────────────────────┐    │   (Redis)   │
│              │ <── { progress, eta, phase } ─┤    └──────┬──────┘
└──────────────┘                              │           │ pulls job
                                              │    ┌──────▼──────────┐
                                       reads  │    │ Railway worker  │
                                       DB row └────┤ full pipeline   │
                                                   │ writes progress │
                                                   │ FAL subscribe   │
                                                   │ → onQueueUpdate │
                                                   └─────────────────┘
```

- **Vercel route**: returns in <2s, never renders → no timeout
- **Railway worker**: no HTTP limit, runs minutes → safe for 3-min films
- **FAL subscribe**: real per-segment progress via `onQueueUpdate`
- **DB as progress bus**: worker writes, status endpoint reads
- **Frontend**: polls every 2s, shows phase + % + live ETA
- **Cost reconciliation**: estimate charged upfront, difference refunded after real breakdown

---

## SUMMARY — FILES

| File | Action |
|---|---|
| `vercel.json` | CREATE/EDIT — maxDuration per route + enable Fluid Compute |
| `src/lib/orchestration/fastEstimate.ts` | CREATE — instant cost + render-time estimate |
| `src/app/api/generate/route.ts` | EDIT — fast path, no Claude call, returns <2s |
| `src/lib/orchestration/bridgedGeneration.ts` | EDIT — fal.subscribe + per-segment timeout |
| `src/workers/index.ts` | EDIT — ETA calc, progress writes, cost reconciliation, stall protection |
| `prisma/schema.prisma` | EDIT — progress/phase/etaSeconds on RenderJob |
| `src/app/api/jobs/[id]/route.ts` | CREATE — fast status read (<200ms) |
| `src/components/generation/GenerationProgress.tsx` | CREATE — live progress bar with ETA |
| Results card component | EDIT — render GenerationProgress while job runs |

---

## VERIFICATION

```bash
npx prisma migrate dev --name render_job_progress_eta
npx tsc --noEmit

# Route returns fast (should be well under 2s):
time curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" -H "x-user-id: test" \
  -d '{"prompt":"long epic battle scene","duration":60,"mode":"director","selectedModels":["kling-3.0","veo-3.1","pixverse-c1"]}'
# Expected: { jobId, etaSeconds: ~480 } in < 2 seconds

# Poll progress — watch it climb with live ETA:
watch -n 2 'curl -s http://localhost:3000/api/jobs/[jobId] -H "x-user-id: test"'
# Expected sequence:
# { progress: 5,  phase: "patient_zero", etaSeconds: 450 }
# { progress: 30, phase: "routing",      etaSeconds: 320 }
# { progress: 60, phase: "generating",   statusMessage: "Shot 3/8: generating", etaSeconds: 180 }
# { progress: 94, phase: "stitching",    etaSeconds: 25 }
# { progress: 100, status: "COMPLETED",  outputUrl: "https://..." }
```
