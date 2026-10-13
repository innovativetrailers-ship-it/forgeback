# CINEMATIC FORGE — COGNITIVE BACKEND (PRODUCTION FINAL)
## Cursor Agent Prompt — the wiring that makes the cognitive system real
### Agent runtime · Working memory · Async routing · Graceful degradation · End-to-end integration

---

## WHAT THIS DOC IS

The two prior docs defined the cognitive *pieces*:
- `CINEMA_cognitive_director_cursor_prompt.md` — intent, affect, ideation, reflection, memory, learning
- `CINEMA_cognitive_enhancements_cursor_prompt.md` — live matrix, schema payloads, continuity, rewards, graph

This doc is the **backbone that wires them into a coherent backend**: a unified agent runtime,
the missing working-memory layer, the async-routing fix the enhancements require, and — most
importantly — **graceful degradation** so cognition can NEVER block or break a render.

**Implement this LAST, after both cognitive docs and the orchestration cluster.**

---

## CORE PRINCIPLE: COGNITION IS AN ENHANCEMENT, NEVER A DEPENDENCY

Every cognitive agent runs behind a timeout and a try/catch. If intent modeling fails, the
render uses the raw prompt. If memory recall fails, it proceeds without history. If the whole
Cognitive Director fails, orchestration runs exactly as it did before. **A thinking failure
degrades quality, never availability.** This is wired into the runtime, not left to each caller.

---

## THE BACKEND STRUCTURE

```
src/lib/cognition/
├── runtime.ts              ← agent runtime: timeout, retry, degradation, telemetry
├── agents/
│   ├── base.ts             ← CognitiveAgent interface + shared Claude caller
│   ├── intentAgent.ts      ← deconstruct intent
│   ├── affectAgent.ts      ← emotional arc + rhythm
│   ├── ideationAgent.ts    ← Tree-of-Thoughts creative directions
│   ├── critiqueAgent.ts    ← Reflexion self-critique
│   ├── continuityAgent.ts  ← scene-to-scene state
│   └── consolidationAgent.ts ← episodic → semantic distillation
├── memory/
│   ├── embeddings.ts       ← embed()
│   ├── working.ts          ← Redis short-term continuity state
│   ├── episodic.ts         ← vector RAG over past projects
│   ├── semantic.ts         ← user taste + craft insights
│   ├── procedural.ts       ← learned routing policies
│   └── forgetting.ts       ← temporal decay + pruning
├── routing/
│   ├── performance.ts      ← live latency/cost/success matrix + circuit breaker
│   ├── schemaPayload.ts    ← schema-driven FAL payloads
│   └── knowledgeGraph.ts   ← relational craft rules
├── director.ts             ← orchestrates agents → CreativeBrief
├── learn.ts                ← post-render learning loop
└── index.ts                ← public API: think() · learn() · recall() · seedAll()
```

> If your prior docs created flat files (e.g. `cognition/intent.ts`), move them into this
> structure. The folders keep agents, memory, and routing concerns cleanly separated.

---

## STEP 1 — THE AGENT RUNTIME (the missing backbone)

**Create** `src/lib/cognition/runtime.ts`:

```typescript
// src/lib/cognition/runtime.ts
// Runs every cognitive agent with timeout + graceful degradation + telemetry.
// Cognition NEVER blocks a render: on failure, returns the fallback and logs.

export interface AgentRun<T> {
  name:     string
  run:      () => Promise<T>
  fallback: T              // returned if the agent times out or throws
  timeoutMs?: number
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('agent timeout')), ms)),
  ])
}

// Run one agent safely — never throws, always resolves (real or fallback)
export async function runAgent<T>(spec: AgentRun<T>): Promise<{ value: T; ok: boolean; ms: number }> {
  const t0 = Date.now()
  try {
    const value = await withTimeout(spec.run(), spec.timeoutMs ?? 30_000)
    return { value, ok: true, ms: Date.now() - t0 }
  } catch (err: any) {
    console.warn(`[cognition:${spec.name}] degraded → fallback:`, err.message)
    return { value: spec.fallback, ok: false, ms: Date.now() - t0 }
  }
}

// Telemetry: track which agents are healthy (surfaces silent degradation)
const agentHealth = new Map<string, { ok: number; fail: number }>()
export function noteAgentHealth(name: string, ok: boolean) {
  const h = agentHealth.get(name) ?? { ok: 0, fail: 0 }
  ok ? h.ok++ : h.fail++
  agentHealth.set(name, h)
}
export function getAgentHealth() {
  return Object.fromEntries(agentHealth)
}
```

---

## STEP 2 — AGENT BASE INTERFACE + SHARED CLAUDE CALLER

**Create** `src/lib/cognition/agents/base.ts`:

```typescript
// src/lib/cognition/agents/base.ts
// Shared Claude caller for all cognitive agents — one place to tune model/keys/parsing

const DOMAIN_KEYS: Record<string, string | undefined> = {
  product:      process.env.ANTHROPIC_API_KEY,
  intelligence: process.env.ANTHROPIC_API_KEY_INTELLIGENCE,
  technical:    process.env.ANTHROPIC_API_KEY_TECHNICAL,
  marketing:    process.env.ANTHROPIC_API_KEY_MARKETING,
}

export async function callAgentLLM(params: {
  system:    string
  user:      string
  maxTokens?: number
  model?:    string
  domain?:   keyof typeof DOMAIN_KEYS
  fast?:     boolean      // use Haiku for cheap/quick agents
}): Promise<string> {
  const key   = DOMAIN_KEYS[params.domain ?? 'intelligence'] ?? process.env.ANTHROPIC_API_KEY!
  const model = params.fast ? 'claude-haiku-4-5-20251001' : (params.model ?? 'claude-sonnet-4-20250514')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: params.maxTokens ?? 800,
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
    }),
  }).then(r => r.json())

  return res.content?.[0]?.text ?? ''
}

// Safe JSON parse for agent outputs (strips markdown fences)
export function parseAgentJSON<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return fallback
  }
}

export interface CognitiveAgent<Input, Output> {
  name: string
  fallback: (input: Input) => Output
  execute: (input: Input) => Promise<Output>
}
```

> Each agent (intentAgent, affectAgent, etc.) from the prior docs should be refactored to use
> `callAgentLLM` + `parseAgentJSON` and export a `CognitiveAgent` object with a `fallback`.
> This is mechanical — replace each agent's inline fetch with `callAgentLLM`, and its inline
> try/catch parse with `parseAgentJSON(text, <fallback>)`.

---

## STEP 3 — WORKING MEMORY (Redis — was referenced, never built)

**Create** `src/lib/cognition/memory/working.ts`:

```typescript
// src/lib/cognition/memory/working.ts
// Short-term continuity state for the ACTIVE project — fast, ephemeral, Redis-backed

import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  retryStrategy: (t) => Math.min(t * 200, 2000),
})

const KEY = (jobId: string) => `working:${jobId}`
const TTL = 60 * 60 * 6   // 6 hours — a project session

export async function setWorkingState(jobId: string, state: any): Promise<void> {
  try {
    if (redis.status === 'wait') await redis.connect()
    await redis.set(KEY(jobId), JSON.stringify(state), 'EX', TTL)
  } catch (err: any) {
    console.warn('[working-memory] set failed:', err.message)   // non-fatal
  }
}

export async function getWorkingState(jobId: string): Promise<any | null> {
  try {
    if (redis.status === 'wait') await redis.connect()
    const v = await redis.get(KEY(jobId))
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}

export async function updateWorkingState(jobId: string, patch: Record<string, any>): Promise<void> {
  const current = (await getWorkingState(jobId)) ?? {}
  await setWorkingState(jobId, { ...current, ...patch })
}
```

> Working memory holds the live continuity state (STEP 3 of the enhancements doc) for the
> running project, so every segment in the job can read/write the evolving wardrobe/prop state.

---

## STEP 4 — THE COGNITIVE DIRECTOR (clean, runtime-wrapped)

**Replace** `src/lib/cognition/director.ts` with this runtime-wrapped version that degrades
gracefully at every step:

```typescript
// src/lib/cognition/director.ts
// Orchestrates the cognitive agents into a CreativeBrief — every step degrades safely

import { runAgent, noteAgentHealth } from './runtime'
import { intentAgent }    from './agents/intentAgent'
import { affectAgent }    from './agents/affectAgent'
import { ideationAgent }  from './agents/ideationAgent'
import { critiqueAgent }  from './agents/critiqueAgent'
import { recallEpisodes } from './memory/episodic'
import { recordEpisode }  from './memory/episodic'

export interface CreativeBrief {
  intent:         any
  emotionalArc:   any
  direction:      any
  enrichedPrompt: string
  cognitionUsed:  boolean    // false if everything degraded — render uses raw prompt
}

export async function runCognitiveDirector(params: {
  userId:      string
  prompt:      string
  durationSec: number
  onProgress?: (detail: string) => void
}): Promise<CreativeBrief> {
  const { userId, prompt, durationSec, onProgress } = params
  let anyOk = false

  // 1. Intent
  onProgress?.('Understanding intent...')
  const intentR = await runAgent({
    name: 'intent', timeoutMs: 25_000,
    run: () => intentAgent.execute({ userId, prompt }),
    fallback: intentAgent.fallback({ userId, prompt }),
  })
  noteAgentHealth('intent', intentR.ok); anyOk ||= intentR.ok
  const intent = intentR.value

  // 2. Recall (RAG) — pure memory, no agent LLM; guard directly
  onProgress?.('Recalling past work...')
  let pastWins: string[] = []
  try {
    const eps = await recallEpisodes(userId, intent.inferredGoal ?? prompt, 5)
    pastWins = eps.filter((e: any) => (e.outcome?.qualityScore ?? 0) > 0.7).map((e: any) => e.summary)
  } catch (e: any) { console.warn('[cognition:recall] degraded:', e.message) }

  // 3. Emotional arc
  onProgress?.('Composing emotional rhythm...')
  const arcR = await runAgent({
    name: 'affect', timeoutMs: 25_000,
    run: () => affectAgent.execute({ intent, durationSec }),
    fallback: affectAgent.fallback({ intent, durationSec }),
  })
  noteAgentHealth('affect', arcR.ok); anyOk ||= arcR.ok
  const emotionalArc = arcR.value

  // 4. Ideation (Tree of Thoughts)
  onProgress?.('Imagining captivating scenes...')
  const ideaR = await runAgent({
    name: 'ideation', timeoutMs: 35_000,
    run: () => ideationAgent.execute({ intent, arc: emotionalArc, pastWins }),
    fallback: ideationAgent.fallback({ intent, arc: emotionalArc, pastWins }),
  })
  noteAgentHealth('ideation', ideaR.ok); anyOk ||= ideaR.ok
  let direction = ideaR.value

  // 5. Reflexion critique (only if ideation succeeded and has room to improve)
  if (ideaR.ok && (direction.score ?? 0) < 0.85) {
    onProgress?.('Refining the vision...')
    const critR = await runAgent({
      name: 'critique', timeoutMs: 30_000,
      run: () => critiqueAgent.execute({ direction, arc: emotionalArc, intent: intent.inferredGoal }),
      fallback: direction,
    })
    noteAgentHealth('critique', critR.ok)
    direction = critR.value
  }

  // Build enriched prompt — or fall back to raw prompt if everything degraded
  const enrichedPrompt = anyOk
    ? [
        direction.concept ?? prompt,
        direction.visualStyle ? `Visual style: ${direction.visualStyle}.` : '',
        emotionalArc.shape ? `Emotional journey: ${emotionalArc.shape} — ${emotionalArc.rhythmNote ?? ''}.` : '',
        direction.scenes?.length ? `Scenes: ${direction.scenes.join(' / ')}.` : '',
        intent.targetEmotion ? `Evoke: ${intent.targetEmotion}.` : '',
      ].filter(Boolean).join(' ')
    : prompt   // total degradation → raw prompt, render still proceeds

  // Record episode (non-fatal)
  recordEpisode({
    userId, kind: 'project',
    summary: `${intent.inferredGoal ?? prompt} — ${direction.concept ?? 'direct'}`,
    intent, brief: { emotionalArc, direction }, importance: 0.6,
  }).catch(() => {})

  return { intent, emotionalArc, direction, enrichedPrompt, cognitionUsed: anyOk }
}
```

---

## STEP 5 — ASYNC ROUTING FIX (required by the enhancements)

The enhancements made `selectModel` async (live performance scoring). `buildDAG` calls it
synchronously — this MUST be fixed or the build breaks.

**Edit** `src/lib/orchestration/dagRouter.ts`:

```typescript
// selectModel is now async (awaits learned policy + live scores)
// → buildDAG must also be async and await each selection

export async function buildDAG(
  shots:         StructuredShot[],
  availablePool: string[]
): Promise<DAGNode[]> {
  const nodes: DAGNode[] = []
  for (let i = 0; i < shots.length; i++) {
    const shot  = shots[i]
    const model = await selectModel(shot as any, availablePool)   // ← await
    nodes.push({
      shot,
      assignedModel:  model,
      dependencies:   i > 0 ? [i - 1] : [],
      tailFrameUrl:   undefined,
      shotMemory:     [],
      estimatedCost:  estimateShotCost(model, shot.duration),
      priority:       shot.hasDialogue || shot.hasFaces ? 'critical' : 'normal',
    })
  }
  return nodes
}
```

**Update ALL callers of `buildDAG`** to await it:

```bash
grep -rn "buildDAG(" src/ --include="*.ts"
# Every call site: const dag = await buildDAG(...)
```

In `src/lib/orchestration/index.ts` and the fast-estimate path in the generate route:
```typescript
const dag = await buildDAG(shotsWithKeyframes, selectedModels)   // ← add await
```

---

## STEP 6 — FULL WORKER INTEGRATION (clean, single place)

**Edit** `src/workers/index.ts` orchestration handler — the complete cognitive flow:

```typescript
import { runCognitiveDirector }  from '@/lib/cognition/director'
import { runLearningLoop }       from '@/lib/cognition/learn'
import { setWorkingState }       from '@/lib/cognition/memory/working'

const orchestrationWorker = new Worker('render', async (job) => {
  if (job.name !== 'orchestrate') return
  const { jobId, userId, prompt, duration, selectedModels, useCognition } = job.data

  await db.renderJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', progress: 2 } })

  try {
    // ── COGNITION (optional, gracefully degrading) ────────────────────────
    let finalPrompt = prompt
    let brief: any = null
    if (useCognition) {
      await db.renderJob.update({ where: { id: jobId }, data: { phase: 'thinking', statusMessage: 'The director is thinking...' } })
      brief = await runCognitiveDirector({
        userId, prompt, durationSec: duration,
        onProgress: async (detail) => {
          await db.renderJob.update({ where: { id: jobId }, data: { statusMessage: detail } }).catch(() => {})
        },
      })
      finalPrompt = brief.enrichedPrompt
      // seed working memory for continuity across this job
      await setWorkingState(jobId, { intent: brief.intent, arc: brief.emotionalArc }).catch(() => {})
    }

    // ── ORCHESTRATION (existing 6-phase pipeline) ─────────────────────────
    const result = await orchestrateGeneration({
      prompt: finalPrompt, totalDuration: duration, selectedModels, userId,
      jobId,    // pass jobId so generation can read/write working memory
      onProgress: async (phase, detail, pct) => {
        const elapsed = (Date.now() - job.timestamp) / 1000
        const eta = pct > 5 ? Math.round((elapsed / pct) * (100 - pct)) : null
        await db.renderJob.update({ where: { id: jobId }, data: { phase, statusMessage: detail, progress: pct, etaSeconds: eta } }).catch(() => {})
      },
    })

    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', progress: 100, etaSeconds: 0, outputUrl: result.finalVideoUrl,
              metadata: { segments: result.segments, modelBreakdown: result.modelBreakdown,
                          qualityScores: result.qualityScores, brief } },
    })

    // ── LEARNING LOOP (background, non-fatal) ─────────────────────────────
    runLearningLoop({ userId, jobId, result, brief }).catch(e => console.warn('[learn]', e.message))

  } catch (err: any) {
    console.error('[orchestration] failed:', err.message)
    await db.renderJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: err.message } })
  }
}, { connection, concurrency: 2, lockDuration: 10_800_000, lockRenewTime: 300_000 })
```

---

## STEP 7 — UNIFIED LEARNING LOOP

**Create** `src/lib/cognition/learn.ts` (consolidates procedural + consolidation + rewards):

```typescript
// src/lib/cognition/learn.ts
// Post-render learning: routing policy + performance + consolidation + episode

import { updateRoutingPolicy } from './memory/procedural'
import { consolidateMemory }   from './agents/consolidationAgent'
import { recordEpisode }       from './memory/episodic'

export async function runLearningLoop(params: {
  userId: string
  jobId:  string
  result: any
  brief:  any
}): Promise<void> {
  const { userId, jobId, result, brief } = params
  const scores = Object.values(result.qualityScores ?? {}) as number[]
  const avgQuality = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.7

  // 1. Update routing policy per segment (procedural learning)
  for (const seg of result.segments ?? []) {
    await updateRoutingPolicy(seg.contentType ?? 'unknown', seg.model, seg.qualityScore ?? avgQuality, 60).catch(() => {})
  }

  // 2. Record the outcome episode
  await recordEpisode({
    userId, projectId: jobId, kind: 'feedback',
    summary: `Rendered: ${(brief?.direction?.concept ?? 'project').slice(0, 80)}`,
    brief, outcome: { qualityScores: result.qualityScores, avgQuality },
    importance: avgQuality,    // good films are more memorable
  }).catch(() => {})

  // 3. Consolidate episodic → semantic occasionally (every ~10th render)
  if (Math.random() < 0.1) await consolidateMemory(userId).catch(() => {})
}
```

---

## STEP 8 — PUBLIC API + SEEDING

**Create** `src/lib/cognition/index.ts`:

```typescript
// src/lib/cognition/index.ts — public surface for the cognitive backend

export { runCognitiveDirector as think } from './director'
export { runLearningLoop as learn }      from './learn'
export { recallEpisodes as recall }      from './memory/episodic'
export { getAgentHealth }                from './runtime'
export { seedKnowledgeGraph }            from './routing/knowledgeGraph'

// One-time seeding — call on deploy
export async function seedAll(): Promise<void> {
  const { seedKnowledgeGraph } = await import('./routing/knowledgeGraph')
  await seedKnowledgeGraph()
  console.log('[cognition] knowledge graph seeded')
}
```

**Add a seed script** `prisma/seed-cognition.ts`:

```typescript
import { seedAll } from '../src/lib/cognition'
seedAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
```

Run after migration: `npx tsx prisma/seed-cognition.ts`

---

## STEP 9 — HEALTH ENDPOINT (observe cognition in production)

**Create** `src/app/api/health/cognition/route.ts`:

```typescript
import { getAgentHealth } from '@/lib/cognition'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  if (req.headers.get('x-user-role') !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const [episodic, semantic, policies, downModels] = await Promise.all([
    db.episodicMemory.count(),
    db.semanticMemory.count(),
    db.routingPolicy.count(),
    db.modelPerformance.count({ where: { status: 'down' } }),
  ])

  return Response.json({
    agents:        getAgentHealth(),     // per-agent ok/fail counts
    memory:        { episodic, semantic, routingPolicies: policies },
    routing:       { modelsDown: downModels },
  })
}
```

---

## STEP 10 — SINGLE CONSOLIDATED MIGRATION

All cognitive models across both docs + this one, in one migration:

```bash
# Enable pgvector first
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"

# One migration for: EpisodicMemory, SemanticMemory, RoutingPolicy,
# ModelPerformance, RewardSignal, CraftRule + User relations
npx prisma migrate dev --name cognitive_backend_complete
npx prisma generate

# Seed the knowledge graph
npx tsx prisma/seed-cognition.ts
```

---

## ENV — COMPLETE

```env
# Cognition
ANTHROPIC_API_KEY=                 # agent reasoning (Sonnet) + vision (Haiku)
ANTHROPIC_API_KEY_INTELLIGENCE=    # optional domain isolation for cognition
VOYAGE_API_KEY=                    # embeddings (1024-dim) — voyageai.com
REDIS_URL=                         # working memory + queue (rediss:// for Upstash)
DATABASE_URL=                      # pgvector-enabled Postgres
```

---

## IMPLEMENTATION ORDER (the whole cognitive system)

```
PREREQUISITE: orchestration cluster (5 docs) already built & verified

1. CINEMA_cognitive_director_cursor_prompt.md      ← memory, agents, director (pieces)
2. CINEMA_cognitive_enhancements_cursor_prompt.md  ← matrix, schema, continuity, rewards, graph
3. THIS DOC                                         ← runtime, working memory, async fix, wiring

Within this doc:
  STEP 1 runtime → 2 base → 3 working memory → 4 director →
  STEP 5 async DAG FIX (critical — build breaks without it) →
  STEP 6 worker → 7 learn → 8 index/seed → 9 health → 10 migrate
```

---

## VERIFICATION

```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
npx prisma migrate dev --name cognitive_backend_complete
npx prisma generate
npx tsx prisma/seed-cognition.ts
npx tsc --noEmit          # MUST pass — confirms async DAG fix + all imports resolve

# 1. Full cognitive render
curl -X POST http://localhost:3000/api/generate -H "x-user-id: test" \
  -d '{"prompt":"a lonely astronaut drifting from a dying ship","duration":20,"mode":"director","selectedModels":["veo-3.1","kling-3.0","luma-ray3"]}'

# Watch the cognitive pipeline in worker logs:
#   "The director is thinking..."
#   "Understanding intent..." → "Composing emotional rhythm..." →
#   "Imagining captivating scenes..." → "Refining the vision..." →
#   then orchestration phases → learning loop

# 2. Confirm graceful degradation — break the embedding key, render must STILL complete:
#   (temporarily unset VOYAGE_API_KEY) → recall degrades → render proceeds on raw-ish prompt

# 3. Cognition health
curl http://localhost:3000/api/health/cognition -H "x-user-role: ADMIN"
# Expected: { agents: { intent: {ok, fail}, affect: {...} }, memory: {...}, routing: {...} }

# 4. Confirm learning accumulates after a few renders:
psql $DATABASE_URL -c 'SELECT "contentType", model, "successRate", "sampleCount" FROM "RoutingPolicy" ORDER BY "successRate" DESC;'
psql $DATABASE_URL -c 'SELECT model, "avgLatencyMs", status FROM "ModelPerformance";'
psql $DATABASE_URL -c 'SELECT category, insight FROM "SemanticMemory" LIMIT 5;'
```

---

## PRODUCTION-READINESS GUARANTEES

| Concern | Guarantee |
|---|---|
| Cognition fails | `runAgent` returns fallback; render proceeds on raw prompt — never blocked |
| Embedding provider down | recall degrades silently; render proceeds |
| Redis down | working memory no-ops; continuity falls back to keyframe bridging |
| A model goes down | circuit breaker drops it; router picks healthy alternative |
| FAL changes a param | schema-driven payload adapts; no silent failure |
| Build breaks | STEP 5 async DAG fix is mandatory — `tsc` catches it |
| Latency added | cognition is behind `useCognition` flag — drafts skip it |
| Observability | `/api/health/cognition` surfaces agent + memory + routing health |

---

## FINAL FILE COUNT

```
runtime.ts · agents/base.ts · agents/{intent,affect,ideation,critique,continuity,consolidation}Agent.ts
memory/{embeddings,working,episodic,semantic,procedural,forgetting}.ts
routing/{performance,schemaPayload,knowledgeGraph}.ts
director.ts · learn.ts · index.ts
+ api/health/cognition/route.ts · api/feedback/signal/route.ts
+ prisma/seed-cognition.ts
+ edits: dagRouter.ts (async), workers/index.ts, generate route, bridgedGeneration.ts, affect.ts
```

This is the complete, wired, gracefully-degrading cognitive backend. With the orchestration
cluster beneath it, you have a self-optimising production studio: it thinks before it renders,
remembers across projects, routes around failure in real time, and gets better every film —
while guaranteeing that no cognitive failure can ever take down a render.
