# CINEMATIC FORGE — COGNITIVE BACKEND INTEGRATION
## Cursor Agent Prompt — wire cognition into YOUR actual code, not an assumed structure
### Two seams · Discovery first · Adapters for signature mismatches

---

## READ THIS FIRST — WHY THIS DOC EXISTS

The cognitive backend docs were written against an *idealised* architecture. Your real
codebase (built by Cursor) has diverged — evidence from your own deploys:

- Worker is `render.worker.ts`, not `src/workers/index.ts`
- There's an internal "swarm caller" with `kling.pollStatus(tier)`
- The model-calling layer isn't the `callVideoModel` my prompts assume

So **do not blindly paste the cognitive wiring**. Instead: discover your actual integration
points, then connect cognition at just **two seams**. The cognitive backend's internal files
(agents, memory, routing) are self-contained and correct — only the *connection* to your
pipeline needs to match your real code.

---

## THE PRINCIPLE: TWO SEAMS ONLY

The entire cognitive backend connects to your pipeline at exactly two points:

```
            ┌─────────── SEAM 1 (before render) ───────────┐
            │  prompt → think() → enrichedPrompt            │
USER ─────► │                                               │ ─────► YOUR EXISTING
            └───────────────────────────────────────────────┘        ORCHESTRATION
                                                                      (unchanged)
            ┌─────────── SEAM 2 (after render) ────────────┐
YOUR RESULT ►│  result → learn()                            │ ─────► done
            └───────────────────────────────────────────────┘
```

Everything else cognition does (memory, live routing, continuity) hangs off these two calls
plus optional helpers. If you wire only these two, you get 80% of the value with near-zero
risk to your working pipeline.

---

## STEP 1 — DISCOVER YOUR ACTUAL INTEGRATION POINTS

Run these and note the real paths/signatures BEFORE wiring anything:

```bash
# 1. Where is the worker that processes render jobs?
find src -name "*.worker.ts" -o -name "worker*.ts" | head
grep -rln "orchestrate\|render-simple\|\.process\|new Worker" src/ --include="*.ts"

# 2. What is the orchestration entry function actually called + its signature?
grep -rn "export async function\|export function" src/ --include="*.ts" | grep -i "orchestrat\|generate\|pipeline\|render"

# 3. Where does the generate route queue the job?
grep -rn "\.add(" src/app/api --include="*.ts"
cat src/app/api/generate/route.ts 2>/dev/null | head -60

# 4. What's the model-calling layer (the "swarm caller")?
grep -rln "pollStatus\|callVideoModel\|callEngine\|swarm\|fal.subscribe\|fal.run" src/ --include="*.ts"

# 5. What fields does RenderJob actually have?
grep -A30 "model RenderJob" prisma/schema.prisma

# 6. Is the Prisma client at @/lib/db?
ls src/lib/db.ts src/lib/prisma.ts 2>/dev/null
grep -rn "export.*db\b\|export.*prisma" src/lib/db.ts src/lib/prisma.ts 2>/dev/null
```

Write down the answers — you'll substitute them into the seams below.

---

## STEP 2 — BUILD THE COGNITIVE BACKEND (self-contained, safe)

The internal cognitive files have NO dependency on your pipeline shape — they only need:
- `@/lib/db` (your Prisma client — confirm path from STEP 1.6)
- `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `REDIS_URL`, pgvector

Implement these from the prior docs AS-IS (they're standalone):
```
src/lib/cognition/runtime.ts
src/lib/cognition/agents/*.ts
src/lib/cognition/memory/*.ts
src/lib/cognition/routing/performance.ts
src/lib/cognition/routing/schemaPayload.ts
src/lib/cognition/routing/knowledgeGraph.ts
src/lib/cognition/director.ts
src/lib/cognition/learn.ts
src/lib/cognition/index.ts
```

> If your Prisma client is NOT at `@/lib/db`, do a project-wide replace of that import in the
> cognition files to your actual path (from STEP 1.6).

Run the migration + seed:
```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
npx prisma migrate dev --name cognitive_backend_complete
npx prisma generate
npx tsx prisma/seed-cognition.ts
```

---

## STEP 3 — WIRE SEAM 1 (before render) IN YOUR ACTUAL WORKER

Open your real worker file (from STEP 1.1 — likely `render.worker.ts`). Find where it handles
the `orchestrate` job and calls your orchestration function. Insert cognition immediately
before that call:

```typescript
// At top of render.worker.ts:
import { think } from '@/lib/cognition'

// Inside your orchestrate handler, find where you currently do something like:
//    const result = await <yourOrchestrationFn>({ prompt, ... })
// Insert BEFORE it:

let finalPrompt = prompt
if (job.data.useCognition) {
  try {
    const brief = await think({
      userId,
      prompt,
      durationSec: duration,           // use your var name for duration
      onProgress: async (detail) => {
        // use YOUR job-status update call here:
        await db.renderJob.update({ where: { id: jobId }, data: { statusMessage: detail } }).catch(() => {})
      },
    })
    finalPrompt = brief.enrichedPrompt
  } catch (e) {
    // cognition failed — proceed with the raw prompt, render is never blocked
    finalPrompt = prompt
  }
}

// Then pass finalPrompt into your EXISTING orchestration call, unchanged otherwise:
const result = await <yourOrchestrationFn>({ prompt: finalPrompt, /* ...your other args... */ })
```

> The only change to your pipeline is `prompt → finalPrompt`. Your orchestration function,
> its signature, the swarm caller, kling.pollStatus — all untouched.

---

## STEP 4 — WIRE SEAM 2 (after render) IN YOUR ACTUAL WORKER

Right after your orchestration call returns `result`, add the learning loop. Adapt the field
names to whatever YOUR result object actually contains (from STEP 1.2):

```typescript
import { learn } from '@/lib/cognition'

// After: const result = await <yourOrchestrationFn>(...)
// and after you've marked the job COMPLETED:

learn({
  userId,
  jobId,
  // Map YOUR result shape into what learn() expects:
  result: {
    segments:      result.segments      ?? [],   // each needs { model, contentType?, qualityScore? }
    qualityScores: result.qualityScores ?? {},
    finalVideoUrl: result.finalVideoUrl ?? result.outputUrl,
  },
  brief: null,   // or the brief from SEAM 1 if you kept it in scope
}).catch(e => console.warn('[learn]', e.message))   // fire-and-forget, never blocks
```

> If your `result.segments` don't carry `model`/`contentType`/`qualityScore`, learning still
> runs but with less signal. To get full procedural learning, add those fields to your
> segment objects (see STEP 6).

---

## STEP 5 — WIRE THE `useCognition` FLAG IN YOUR GENERATE ROUTE

Open your real generate route (STEP 1.3). Find the `.add(...)` queue call and add the flag to
the job payload:

```typescript
// Wherever you currently queue the orchestrate job:
await <yourQueue>.add('orchestrate', {
  // ...your existing job data...
  useCognition: mode === 'director',   // ← add this; drafts can skip cognition
})
```

That's the only route change. No new estimate logic, no signature changes.

---

## STEP 6 — OPTIONAL: CONNECT LIVE ROUTING TO YOUR MODEL CALLER

This is the higher-value, higher-touch integration. Only do it after SEAMs 1-2 work.

Your model caller (the "swarm caller" with `kling.pollStatus`) is where live performance data
comes from. Wrap each model call with timing so the live matrix learns:

```typescript
import { recordPerformance } from '@/lib/cognition/routing/performance'

// Wherever your swarm caller invokes a model and waits for the result:
const t0 = Date.now()
let ok = false
try {
  const out = await <yourModelCall>(model, payload)   // your existing call
  ok = true
  return out
} finally {
  recordPerformance({ model, latencyMs: Date.now() - t0, success: ok }).catch(() => {})
}
```

And to let routing CONSULT the live matrix, in whatever function picks the model per segment:

```typescript
import { scoreModelsLive, getHealthyModels } from '@/lib/cognition/routing/performance'

// Before picking a model for a segment:
const healthy = await getHealthyModels(availablePool)   // drops circuit-broken models
const live    = await scoreModelsLive(healthy)          // { model: score }
// Pick the healthy candidate with the best live score for this content type.
// Adapt to YOUR existing selection logic — this just adds a scoring input.
```

> If your selection function is synchronous, make it async and `await` these. If that ripples
> too far, skip STEP 6 for now — SEAMs 1-2 deliver the cognitive planning + learning without it.

---

## STEP 7 — OPTIONAL: SCHEMA-DRIVEN PAYLOADS IN THE SWARM CALLER

The permanent fix for stale-endpoint failures. In your swarm caller, before building the FAL
input, replace hardcoded payload construction with the schema-driven builder:

```typescript
import { buildPayload } from '@/lib/cognition/routing/schemaPayload'

// Replace your hardcoded input object with:
const payload = await buildPayload(falModelId, {
  prompt, duration, imageUrl, referenceUrl,
})
// then pass payload to fal.subscribe / fal.run as you do today
```

---

## INTEGRATION CHECKLIST

```
SEAM 1 (required):
  [ ] Found the real worker file + orchestrate handler
  [ ] Inserted think() before your orchestration call
  [ ] prompt → finalPrompt is the ONLY change to the call
  [ ] Wrapped in try/catch — render proceeds if cognition fails

SEAM 2 (required):
  [ ] Inserted learn() after the orchestration result
  [ ] Mapped YOUR result shape into learn()'s expected shape
  [ ] fire-and-forget (.catch) — never blocks completion

Route (required):
  [ ] Added useCognition flag to the queue payload

Optional (higher value, after seams work):
  [ ] STEP 6 — recordPerformance + live scoring in swarm caller
  [ ] STEP 7 — schema-driven payloads in swarm caller
```

---

## VERIFICATION (against YOUR code)

```bash
npx tsc --noEmit      # confirms imports resolve against your actual files

# 1. Cognition runs without breaking your pipeline:
curl -X POST <your-generate-endpoint> -H "x-user-id: test" \
  -d '{"prompt":"a lonely astronaut","duration":15,"mode":"director","selectedModels":[...]}'
# Worker logs should show "The director is thinking..." then YOUR normal orchestration logs

# 2. CRITICAL — graceful degradation. Temporarily unset VOYAGE_API_KEY, render again:
#    cognition degrades, render STILL completes. If the render fails, a seam is wired wrong —
#    cognition must never be in the critical path.

# 3. Learning accumulates (after a few renders):
psql $DATABASE_URL -c 'SELECT * FROM "EpisodicMemory" LIMIT 3;'
psql $DATABASE_URL -c 'SELECT * FROM "RoutingPolicy" ORDER BY "successRate" DESC LIMIT 5;'

# 4. Health:
curl <your-app>/api/health/cognition -H "x-user-role: ADMIN"
```

---

## THE HONEST BOTTOM LINE

- The cognitive backend's **internal logic is sound and self-contained** — agents, memory,
  routing all stand alone and only need `@/lib/db` + the env vars.
- The **integration is the part that must match YOUR code**, and your code differs from my
  prompts' assumptions. STEP 1 discovers the real shape; SEAMs 1-2 connect at minimal surface.
- **Do SEAMs 1-2 first, verify graceful degradation, then optionally add STEPS 6-7.** That
  ordering means cognition can never break your working render pipeline — worst case it does
  nothing, best case it makes every film smarter and the system self-optimising.
- If any STEP-1 discovery turns up a structure I should account for (unusual worker pattern,
  a result shape that doesn't carry per-segment data), paste it back and I'll write the exact
  adapter for that seam rather than a generic one.
```
